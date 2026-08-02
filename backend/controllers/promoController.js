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

function parseMoney(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(String(value).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

function computeSalePrice(originalPrice, discountType, discountValue) {
  const original = Number(originalPrice) || 0;
  if (!original) return null;
  if (!discountType || discountValue === null || discountValue === undefined || discountValue === '') {
    return original;
  }
  const value = Number(discountValue) || 0;
  if (discountType === 'percent') {
    const pct = Math.min(Math.max(value, 0), 100);
    return Math.max(0, Math.round(original - (original * pct) / 100));
  }
  if (discountType === 'fixed') {
    return Math.max(0, Math.round(original - value));
  }
  return original;
}

function resolveCoursePricing(body, existing = {}) {
  const original = Object.prototype.hasOwnProperty.call(body, 'original_price')
    ? parseMoney(body.original_price)
    : (existing.original_price != null ? Number(existing.original_price) : null);

  let discountType = Object.prototype.hasOwnProperty.call(body, 'discount_type')
    ? (body.discount_type || null)
    : (existing.discount_type || null);
  if (discountType === '' || discountType === 'none') discountType = null;

  let discountValue = Object.prototype.hasOwnProperty.call(body, 'discount_value')
    ? (body.discount_value === '' || body.discount_value == null ? null : Number(body.discount_value))
    : (existing.discount_value != null ? Number(existing.discount_value) : null);
  if (discountValue != null && !Number.isFinite(discountValue)) discountValue = null;

  const salePrice = computeSalePrice(original, discountType, discountValue);

  const registrationEnabled = Object.prototype.hasOwnProperty.call(body, 'registration_enabled')
    ? parseActiveFlag(body.registration_enabled, true)
    : (existing.registration_enabled === undefined ? true : Boolean(Number(existing.registration_enabled)));

  return {
    original_price: original,
    discount_type: discountType,
    discount_value: discountValue,
    sale_price: salePrice,
    registration_enabled: registrationEnabled ? 1 : 0,
    category: Object.prototype.hasOwnProperty.call(body, 'category')
      ? (String(body.category || '').trim() || null)
      : (existing.category || null),
    instructor_name: Object.prototype.hasOwnProperty.call(body, 'instructor_name')
      ? (String(body.instructor_name || '').trim() || null)
      : (existing.instructor_name || null),
    duration_label: Object.prototype.hasOwnProperty.call(body, 'duration_label')
      ? (String(body.duration_label || '').trim() || null)
      : (existing.duration_label || null),
    level_label: Object.prototype.hasOwnProperty.call(body, 'level_label')
      ? (String(body.level_label || '').trim() || null)
      : (existing.level_label || null),
    rating: Object.prototype.hasOwnProperty.call(body, 'rating')
      ? (body.rating === '' || body.rating == null ? 5.0 : Number(body.rating))
      : (existing.rating != null ? Number(existing.rating) : 5.0),
    student_count: Object.prototype.hasOwnProperty.call(body, 'student_count')
      ? (body.student_count === '' || body.student_count == null ? 0 : parseInt(body.student_count, 10) || 0)
      : (existing.student_count != null ? Number(existing.student_count) : 0),
  };
}

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

    const pricing = resolveCoursePricing(req.body);

    const [result] = await pool.query(
      `INSERT INTO promo_courses
       (title, description, image_url, highlight, branch_scope,
        original_price, discount_type, discount_value, sale_price, registration_enabled,
        category, instructor_name, duration_label, level_label, rating, student_count,
        sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title.trim(),
        description?.trim() || null,
        imageUrl,
        highlight?.trim() || null,
        scopeVal,
        pricing.original_price,
        pricing.discount_type,
        pricing.discount_value,
        pricing.sale_price,
        pricing.registration_enabled,
        pricing.category,
        pricing.instructor_name,
        pricing.duration_label,
        pricing.level_label,
        pricing.rating,
        pricing.student_count,
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
      metadata: { branch_scope: scopeVal, sale_price: pricing.sale_price },
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

    const pricing = resolveCoursePricing(req.body, existing);
    const title = req.body.title?.trim() || existing.title;
    await pool.query(
      `UPDATE promo_courses
       SET title=?, description=?, image_url=?, highlight=?,
           branch_scope=?,
           original_price=?, discount_type=?, discount_value=?, sale_price=?, registration_enabled=?,
           category=?, instructor_name=?, duration_label=?, level_label=?, rating=?, student_count=?,
           sort_order=?, is_active=?
       WHERE id=?`,
      [
        title,
        req.body.description !== undefined ? (String(req.body.description).trim() || null) : existing.description,
        imageUrl,
        req.body.highlight !== undefined ? (String(req.body.highlight).trim() || null) : existing.highlight,
        scopeVal,
        pricing.original_price,
        pricing.discount_type,
        pricing.discount_value,
        pricing.sale_price,
        pricing.registration_enabled,
        pricing.category,
        pricing.instructor_name,
        pricing.duration_label,
        pricing.level_label,
        pricing.rating,
        pricing.student_count,
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

async function assertTeacherOwnsStudent(teacherId, studentId) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM class_members t
     INNER JOIN class_members s ON s.class_id = t.class_id
     INNER JOIN users u ON u.id = s.user_id AND u.role = 'student'
     WHERE t.user_id = ? AND s.user_id = ?
     LIMIT 1`,
    [teacherId, studentId],
  );
  return rows.length > 0;
}

const registerCourse = async (req, res) => {
  try {
    const courseId = parseInt(req.params.id, 10);
    if (!Number.isFinite(courseId)) {
      return res.status(400).json({ message: 'Khóa học không hợp lệ' });
    }

    const [courses] = await pool.query(
      'SELECT * FROM promo_courses WHERE id = ? AND is_active = 1 LIMIT 1',
      [courseId],
    );
    if (courses.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy khóa học' });
    }
    const course = courses[0];
    if (!Number(course.registration_enabled)) {
      return res.status(400).json({ message: 'Khóa học này tạm dừng nhận đăng ký' });
    }

    const { phone, zalo, note, student_user_id: studentUserId } = req.body;
    let targetStudentId = null;
    let fullname = req.user.fullname;

    if (req.user.role === 'student') {
      targetStudentId = req.user.id;
      const [u] = await pool.query('SELECT fullname, phone, zalo FROM users WHERE id = ?', [req.user.id]);
      fullname = u[0]?.fullname || fullname;
    } else if (req.user.role === 'teacher') {
      const sid = parseInt(studentUserId, 10);
      if (!Number.isFinite(sid)) {
        return res.status(400).json({ message: 'Vui lòng chọn học viên cần đăng ký' });
      }
      if (!(await assertTeacherOwnsStudent(req.user.id, sid))) {
        return res.status(403).json({ message: 'Học viên không thuộc lớp bạn phụ trách' });
      }
      targetStudentId = sid;
      const [u] = await pool.query('SELECT fullname, phone, zalo FROM users WHERE id = ?', [sid]);
      fullname = u[0]?.fullname || fullname;
    } else if (req.user.role === 'admin') {
      const sid = studentUserId ? parseInt(studentUserId, 10) : null;
      if (sid) {
        targetStudentId = sid;
        const [u] = await pool.query('SELECT fullname FROM users WHERE id = ?', [sid]);
        fullname = u[0]?.fullname || req.body.fullname || fullname;
      } else {
        fullname = req.body.fullname?.trim() || fullname;
      }
    } else {
      return res.status(403).json({ message: 'Không có quyền đăng ký khóa học' });
    }

    // Tránh đăng ký trùng đang chờ
    if (targetStudentId) {
      const [dup] = await pool.query(
        `SELECT id FROM promo_registrations
         WHERE course_id = ? AND student_user_id = ? AND status IN ('pending','contacted','approved')
         LIMIT 1`,
        [courseId, targetStudentId],
      );
      if (dup.length > 0) {
        return res.status(409).json({ message: 'Đã có yêu cầu đăng ký khóa học này' });
      }
    }

    const [userContact] = targetStudentId
      ? await pool.query('SELECT phone, zalo FROM users WHERE id = ?', [targetStudentId])
      : [[{}]];

    const [result] = await pool.query(
      `INSERT INTO promo_registrations
       (course_id, registrant_user_id, student_user_id, fullname, phone, zalo, note,
        status, original_price, sale_price)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [
        courseId,
        req.user.id,
        targetStudentId,
        fullname,
        phone?.trim() || userContact[0]?.phone || null,
        zalo?.trim() || userContact[0]?.zalo || null,
        note?.trim() || null,
        course.original_price,
        course.sale_price,
      ],
    );

    await logAction({
      actorId: req.user.id,
      action: 'create',
      resourceType: 'promo_registration',
      resourceId: result.insertId,
      resourceLabel: course.title,
      metadata: { student_user_id: targetStudentId },
    });

    res.status(201).json({
      message: 'Đã gửi yêu cầu đăng ký khóa học',
      id: result.insertId,
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const listRegistrations = async (req, res) => {
  try {
    let sql = `
      SELECT r.*,
             c.title AS course_title,
             c.branch_scope AS course_branch,
             u.fullname AS registrant_name,
             u.role AS registrant_role,
             s.fullname AS student_name,
             s.code AS student_code
      FROM promo_registrations r
      INNER JOIN promo_courses c ON c.id = r.course_id
      INNER JOIN users u ON u.id = r.registrant_user_id
      LEFT JOIN users s ON s.id = r.student_user_id
      WHERE 1=1`;
    const params = [];

    if (req.user.role === 'admin') {
      const scope = getUserScope(req.user);
      if (scope) {
        sql += ' AND c.branch_scope = ?';
        params.push(scope);
      }
      if (req.query.status) {
        sql += ' AND r.status = ?';
        params.push(req.query.status);
      }
    } else if (req.user.role === 'teacher') {
      sql += ' AND r.registrant_user_id = ?';
      params.push(req.user.id);
    } else if (req.user.role === 'student') {
      sql += ' AND (r.student_user_id = ? OR r.registrant_user_id = ?)';
      params.push(req.user.id, req.user.id);
    } else {
      return res.status(403).json({ message: 'Không có quyền xem đăng ký' });
    }

    sql += ' ORDER BY r.created_at DESC LIMIT 200';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const updateRegistrationStatus = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Chỉ admin được cập nhật trạng thái đăng ký' });
    }
    const allowed = ['pending', 'contacted', 'approved', 'rejected', 'cancelled'];
    const status = req.body.status;
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
    }

    const [rows] = await pool.query(
      `SELECT r.*, c.branch_scope, c.title
       FROM promo_registrations r
       INNER JOIN promo_courses c ON c.id = r.course_id
       WHERE r.id = ?`,
      [req.params.id],
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy yêu cầu đăng ký' });
    }
    const existing = rows[0];
    const scope = getUserScope(req.user);
    if (scope && existing.branch_scope !== scope) {
      return res.status(403).json({ message: 'Không có quyền xử lý đăng ký nhánh khác' });
    }

    await pool.query('UPDATE promo_registrations SET status = ? WHERE id = ?', [status, req.params.id]);
    await logAction({
      actorId: req.user.id,
      action: 'update',
      resourceType: 'promo_registration',
      resourceId: Number(req.params.id),
      resourceLabel: existing.title,
      metadata: { status },
    });
    res.json({ message: 'Đã cập nhật trạng thái', status });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const listTeacherStudents = async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Không có quyền' });
    }
    let sql;
    let params;
    if (req.user.role === 'teacher') {
      sql = `
        SELECT DISTINCT u.id, u.fullname, u.code, u.phone, u.zalo
        FROM class_members cm_t
        INNER JOIN class_members cm_s ON cm_s.class_id = cm_t.class_id
        INNER JOIN users u ON u.id = cm_s.user_id AND u.role = 'student'
        WHERE cm_t.user_id = ?
        ORDER BY u.fullname`;
      params = [req.user.id];
    } else {
      sql = `
        SELECT u.id, u.fullname, u.code, u.phone, u.zalo
        FROM users u
        WHERE u.role = 'student' AND u.status = TRUE
        ORDER BY u.fullname
        LIMIT 500`;
      params = [];
    }
    const [rows] = await pool.query(sql, params);
    res.json(rows);
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
  registerCourse,
  listRegistrations,
  updateRegistrationStatus,
  listTeacherStudents,
  resolveViewerBranch,
};
