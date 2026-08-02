const pool = require('../config/db');
const { saveMulterFile } = require('../utils/fileStorage');
const { getUserScope, isSuperAdmin } = require('../utils/adminScope');
const { logAction } = require('../utils/auditLog');

/** Nhánh xem của user: HG | EG | null (super / chưa xác định) */
function resolveViewerBranch(user) {
  if (!user) return null;
  if (user.role === 'admin' || user.role === 'teacher') {
    return getUserScope(user);
  }
  if (user.role === 'student' && user.code) {
    const c = String(user.code).trim().toUpperCase();
    if (c.startsWith('EG')) return 'EG';
    if (c.startsWith('HG')) return 'HG';
  }
  return null;
}

async function inferTeacherBranches(teacherId) {
  const [rows] = await pool.query(
    `SELECT
       SUM(CASE WHEN UPPER(u.code) LIKE 'HG%' THEN 1 ELSE 0 END) AS hg_count,
       SUM(CASE WHEN UPPER(u.code) LIKE 'EG%' THEN 1 ELSE 0 END) AS eg_count
     FROM class_members cm_t
     INNER JOIN class_members cm_s ON cm_s.class_id = cm_t.class_id
     INNER JOIN users u ON u.id = cm_s.user_id AND u.role = 'student'
     WHERE cm_t.user_id = ?`,
    [teacherId],
  );
  const hg = Number(rows[0]?.hg_count || 0);
  const eg = Number(rows[0]?.eg_count || 0);
  const branches = [];
  if (hg > 0) branches.push('HG');
  if (eg > 0) branches.push('EG');
  return branches;
}

async function resolveStudentBranchFromDb(userId, codeFromToken) {
  let code = codeFromToken;
  if (!code) {
    const [rows] = await pool.query('SELECT code FROM users WHERE id = ? LIMIT 1', [userId]);
    code = rows[0]?.code;
  }
  const c = String(code || '').trim().toUpperCase();
  if (c.startsWith('EG')) return 'EG';
  if (c.startsWith('HG')) return 'HG';

  // Mã đăng nhập có thể không mang HG/EG — lấy từ mã học viên theo môn
  try {
    const { findStudentCodesForUser } = require('../utils/studentIdentity');
    const codes = await findStudentCodesForUser(pool, userId);
    for (const row of codes || []) {
      const sc = String(row.student_code || '').trim().toUpperCase();
      if (sc.startsWith('EG')) return 'EG';
      if (sc.startsWith('HG')) return 'HG';
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * mode: all | branch | branches | unknown
 * scope: 'HG'|'EG' khi mode=branch
 * scopes: ['HG','EG'] khi mode=branches
 */
async function effectiveListScope(req) {
  if (isSuperAdmin(req.user)) {
    const q = String(req.query.scope || 'all').toUpperCase();
    if (q === 'HG' || q === 'EG') return { mode: 'branch', scope: q };
    return { mode: 'all' };
  }

  const syncBranch = resolveViewerBranch(req.user);
  if (syncBranch) return { mode: 'branch', scope: syncBranch };

  if (req.user.role === 'teacher') {
    const branches = await inferTeacherBranches(req.user.id);
    if (branches.length === 1) return { mode: 'branch', scope: branches[0] };
    if (branches.length > 1) return { mode: 'branches', scopes: branches };
    // GV chưa có HV trong lớp / chưa gắn scope: vẫn cho xem toàn bộ để không bị trống oan
    return { mode: 'all' };
  }

  if (req.user.role === 'student') {
    const branch = await resolveStudentBranchFromDb(req.user.id, req.user.code);
    if (branch) return { mode: 'branch', scope: branch };
  }

  // Admin phụ luôn có getUserScope; còn lại không xác định
  return { mode: 'unknown' };
}

function parseActiveFlag(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return value === '1' || value === 'true' || value === true || value === 1;
}

function parseSortOrder(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Admin phụ chỉ được ghi đúng nhánh; super chọn tự do. */
function assertWriteBranch(req, branchScope, { allowAll = false } = {}) {
  if (req.user.role !== 'admin') {
    return 'Chỉ admin được quản lý nội dung quảng bá';
  }
  const allowed = allowAll ? ['HG', 'EG', 'all'] : ['HG', 'EG'];
  if (!allowed.includes(branchScope)) {
    return allowAll
      ? 'Phạm vi hiển thị không hợp lệ (HG, EG hoặc Tất cả)'
      : 'Khóa học phải chọn nhánh HG hoặc EG';
  }
  const scope = getUserScope(req.user);
  if (scope && branchScope !== scope) {
    return `Admin nhánh ${scope} chỉ được đăng nội dung ${scope}`;
  }
  return null;
}

function applyBranchFilter(sql, params, listScope, { includeAllScope = false } = {}) {
  if (listScope.mode === 'branch') {
    if (includeAllScope) {
      sql += ' AND (branch_scope = ? OR branch_scope = \'all\')';
    } else {
      sql += ' AND branch_scope = ?';
    }
    params.push(listScope.scope);
  } else if (listScope.mode === 'branches') {
    if (includeAllScope) {
      sql += ` AND (branch_scope IN (${listScope.scopes.map(() => '?').join(',')}) OR branch_scope = 'all')`;
      params.push(...listScope.scopes);
    } else {
      sql += ` AND branch_scope IN (${listScope.scopes.map(() => '?').join(',')})`;
      params.push(...listScope.scopes);
    }
  } else if (listScope.mode === 'unknown') {
    if (includeAllScope) {
      sql += ' AND branch_scope = \'all\'';
    } else {
      return { sql: null, params };
    }
  }
  return { sql, params };
}

const listBanners = async (req, res) => {
  try {
    const listScope = await effectiveListScope(req);
    const includeInactive = req.user.role === 'admin' && req.query.include_inactive === '1';

    let sql = 'SELECT * FROM promo_banners WHERE 1=1';
    const params = [];
    if (!includeInactive) {
      sql += ' AND is_active = 1';
    }
    const filtered = applyBranchFilter(sql, params, listScope, { includeAllScope: true });
    sql = filtered.sql;
    sql += ' ORDER BY sort_order ASC, id DESC';

    const [rows] = await pool.query(sql, filtered.params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const listCourses = async (req, res) => {
  try {
    const listScope = await effectiveListScope(req);
    const includeInactive = req.user.role === 'admin' && req.query.include_inactive === '1';

    if (listScope.mode === 'unknown') {
      return res.json([]);
    }

    let sql = 'SELECT * FROM promo_courses WHERE 1=1';
    const params = [];
    if (!includeInactive) {
      sql += ' AND is_active = 1';
    }
    const filtered = applyBranchFilter(sql, params, listScope, { includeAllScope: false });
    if (!filtered.sql) {
      return res.json([]);
    }
    sql = filtered.sql;
    sql += ' ORDER BY sort_order ASC, id DESC';

    const [rows] = await pool.query(sql, filtered.params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const createBanner = async (req, res) => {
  try {
    const {
      title, subtitle, cta_label, link_url, branch_scope, sort_order, is_active,
    } = req.body;
    if (!title?.trim()) {
      return res.status(400).json({ message: 'Vui lòng nhập tiêu đề banner' });
    }
    const scopeVal = branch_scope || 'all';
    const err = assertWriteBranch(req, scopeVal, { allowAll: true });
    if (err) return res.status(403).json({ message: err });

    let imageUrl = null;
    if (req.file) {
      const saved = await saveMulterFile(req);
      imageUrl = saved.file_url;
    }

    const [result] = await pool.query(
      `INSERT INTO promo_banners
       (title, subtitle, image_url, cta_label, link_url, branch_scope, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title.trim(),
        subtitle?.trim() || null,
        imageUrl,
        cta_label?.trim() || null,
        link_url?.trim() || null,
        scopeVal,
        parseSortOrder(sort_order),
        parseActiveFlag(is_active, true) ? 1 : 0,
      ],
    );

    await logAction({
      actorId: req.user.id,
      action: 'create',
      resourceType: 'promo_banner',
      resourceId: result.insertId,
      resourceLabel: title.trim(),
      metadata: { branch_scope: scopeVal },
    });

    const [rows] = await pool.query('SELECT * FROM promo_banners WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const updateBanner = async (req, res) => {
  try {
    const [existingRows] = await pool.query('SELECT * FROM promo_banners WHERE id = ?', [req.params.id]);
    if (existingRows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy banner' });
    }
    const existing = existingRows[0];

    const scopeVal = req.body.branch_scope || existing.branch_scope;
    const err = assertWriteBranch(req, scopeVal, { allowAll: true });
    if (err) return res.status(403).json({ message: err });

    // Admin phụ không sửa banner nhánh khác / all nếu không thuộc họ
    const adminScope = getUserScope(req.user);
    if (adminScope && existing.branch_scope !== adminScope && existing.branch_scope !== 'all') {
      return res.status(403).json({ message: 'Không có quyền sửa banner nhánh khác' });
    }

    let imageUrl = existing.image_url;
    if (req.file) {
      const saved = await saveMulterFile(req);
      imageUrl = saved.file_url;
    }

    const title = req.body.title?.trim() || existing.title;
    await pool.query(
      `UPDATE promo_banners
       SET title=?, subtitle=?, image_url=?, cta_label=?, link_url=?,
           branch_scope=?, sort_order=?, is_active=?
       WHERE id=?`,
      [
        title,
        req.body.subtitle !== undefined ? (String(req.body.subtitle).trim() || null) : existing.subtitle,
        imageUrl,
        req.body.cta_label !== undefined ? (String(req.body.cta_label).trim() || null) : existing.cta_label,
        req.body.link_url !== undefined ? (String(req.body.link_url).trim() || null) : existing.link_url,
        scopeVal,
        req.body.sort_order !== undefined ? parseSortOrder(req.body.sort_order) : existing.sort_order,
        req.body.is_active !== undefined ? (parseActiveFlag(req.body.is_active) ? 1 : 0) : existing.is_active,
        req.params.id,
      ],
    );

    await logAction({
      actorId: req.user.id,
      action: 'update',
      resourceType: 'promo_banner',
      resourceId: Number(req.params.id),
      resourceLabel: title,
    });

    const [rows] = await pool.query('SELECT * FROM promo_banners WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const deleteBanner = async (req, res) => {
  try {
    const [existingRows] = await pool.query('SELECT * FROM promo_banners WHERE id = ?', [req.params.id]);
    if (existingRows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy banner' });
    }
    const existing = existingRows[0];
    const adminScope = getUserScope(req.user);
    if (adminScope && existing.branch_scope !== adminScope && existing.branch_scope !== 'all') {
      return res.status(403).json({ message: 'Không có quyền xóa banner nhánh khác' });
    }
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Chỉ admin được xóa banner' });
    }

    await pool.query('DELETE FROM promo_banners WHERE id = ?', [req.params.id]);
    await logAction({
      actorId: req.user.id,
      action: 'delete',
      resourceType: 'promo_banner',
      resourceId: Number(req.params.id),
      resourceLabel: existing.title,
    });
    res.json({ message: 'Đã xóa banner' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const createCourse = async (req, res) => {
  try {
    const {
      title, description, highlight, branch_scope, sort_order, is_active,
    } = req.body;
    if (!title?.trim()) {
      return res.status(400).json({ message: 'Vui lòng nhập tên khóa học' });
    }
    const locked = getUserScope(req.user);
    const scopeVal = locked || branch_scope;
    if (!scopeVal) {
      return res.status(400).json({ message: 'Vui lòng chọn nhánh HG hoặc EG' });
    }
    const err = assertWriteBranch(req, scopeVal, { allowAll: false });
    if (err) return res.status(403).json({ message: err });

    let imageUrl = null;
    if (req.file) {
      const saved = await saveMulterFile(req);
      imageUrl = saved.file_url;
    }

    const [result] = await pool.query(
      `INSERT INTO promo_courses
       (title, description, image_url, highlight, branch_scope, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        title.trim(),
        description?.trim() || null,
        imageUrl,
        highlight?.trim() || null,
        scopeVal,
        parseSortOrder(sort_order),
        parseActiveFlag(is_active, true) ? 1 : 0,
      ],
    );

    await logAction({
      actorId: req.user.id,
      action: 'create',
      resourceType: 'promo_course',
      resourceId: result.insertId,
      resourceLabel: title.trim(),
      metadata: { branch_scope: scopeVal },
    });

    const [rows] = await pool.query('SELECT * FROM promo_courses WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const updateCourse = async (req, res) => {
  try {
    const [existingRows] = await pool.query('SELECT * FROM promo_courses WHERE id = ?', [req.params.id]);
    if (existingRows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy khóa học' });
    }
    const existing = existingRows[0];
    const adminScope = getUserScope(req.user);
    if (adminScope && existing.branch_scope !== adminScope) {
      return res.status(403).json({ message: 'Không có quyền sửa khóa học nhánh khác' });
    }

    const locked = getUserScope(req.user);
    const scopeVal = locked || req.body.branch_scope || existing.branch_scope;
    const err = assertWriteBranch(req, scopeVal, { allowAll: false });
    if (err) return res.status(403).json({ message: err });

    let imageUrl = existing.image_url;
    if (req.file) {
      const saved = await saveMulterFile(req);
      imageUrl = saved.file_url;
    }

    const title = req.body.title?.trim() || existing.title;
    await pool.query(
      `UPDATE promo_courses
       SET title=?, description=?, image_url=?, highlight=?,
           branch_scope=?, sort_order=?, is_active=?
       WHERE id=?`,
      [
        title,
        req.body.description !== undefined ? (String(req.body.description).trim() || null) : existing.description,
        imageUrl,
        req.body.highlight !== undefined ? (String(req.body.highlight).trim() || null) : existing.highlight,
        scopeVal,
        req.body.sort_order !== undefined ? parseSortOrder(req.body.sort_order) : existing.sort_order,
        req.body.is_active !== undefined ? (parseActiveFlag(req.body.is_active) ? 1 : 0) : existing.is_active,
        req.params.id,
      ],
    );

    await logAction({
      actorId: req.user.id,
      action: 'update',
      resourceType: 'promo_course',
      resourceId: Number(req.params.id),
      resourceLabel: title,
    });

    const [rows] = await pool.query('SELECT * FROM promo_courses WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const deleteCourse = async (req, res) => {
  try {
    const [existingRows] = await pool.query('SELECT * FROM promo_courses WHERE id = ?', [req.params.id]);
    if (existingRows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy khóa học' });
    }
    const existing = existingRows[0];
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Chỉ admin được xóa khóa học' });
    }
    const adminScope = getUserScope(req.user);
    if (adminScope && existing.branch_scope !== adminScope) {
      return res.status(403).json({ message: 'Không có quyền xóa khóa học nhánh khác' });
    }

    await pool.query('DELETE FROM promo_courses WHERE id = ?', [req.params.id]);
    await logAction({
      actorId: req.user.id,
      action: 'delete',
      resourceType: 'promo_course',
      resourceId: Number(req.params.id),
      resourceLabel: existing.title,
    });
    res.json({ message: 'Đã xóa khóa học' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

module.exports = {
  listBanners,
  listCourses,
  createBanner,
  updateBanner,
  deleteBanner,
  createCourse,
  updateCourse,
  deleteCourse,
  resolveViewerBranch,
};
