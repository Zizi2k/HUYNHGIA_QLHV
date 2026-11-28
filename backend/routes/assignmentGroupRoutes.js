const router = require('express').Router();
const pool = require('../config/db');
const { assertClassAccess, getAssignmentClassId } = require('../middleware/classAccess');

let schema;
function ensureGroups() {
  if (!schema) schema = (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS assignment_groups (
      id INT PRIMARY KEY AUTO_INCREMENT, class_id INT NOT NULL, name VARCHAR(100) NOT NULL,
      UNIQUE KEY (class_id, name), FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await pool.query(`CREATE TABLE IF NOT EXISTS assignment_group_items (
      assignment_id INT PRIMARY KEY, group_id INT NOT NULL,
      FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES assignment_groups(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
  })().catch((error) => { schema = undefined; throw error; });
  return schema;
}

const id = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 2147483647;
const handle = (action) => async (req, res) => {
  try { await action(req, res); }
  catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Tên nhóm đã có trong lớp này' });
    if (error.code === 'ER_NO_REFERENCED_ROW_2') return res.status(409).json({ message: 'Lớp, nhóm hoặc bài tập không còn tồn tại' });
    console.error('Assignment groups:', error.message);
    res.status(500).json({ message: 'Không thể xử lý nhóm bài tập' });
  }
};
const classRoute = (manage, action) => handle(async (req, res) => {
  if (!id(req.params.classId)) return res.status(400).json({ message: 'Lớp không hợp lệ' });
  if (!(await assertClassAccess(req.user, req.params.classId, res, { manage }))) return;
  await ensureGroups();
  await action(req, res);
});
router.get('/:classId', classRoute(false, async (req, res) => {
  const [rows] = await pool.query('SELECT id,name FROM assignment_groups WHERE class_id=? ORDER BY name,id', [req.params.classId]);
  res.json(rows);
}));
router.post('/:classId', classRoute(true, save));
router.put('/:classId/:groupId', classRoute(true, save));
async function save(req, res) {
  const { classId, groupId } = req.params;
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name || name.length > 100 || (groupId && !id(groupId))) return res.status(400).json({ message: 'Tên nhóm phải có từ 1 đến 100 ký tự' });
  if (groupId) {
    const [result] = await pool.query('UPDATE assignment_groups SET name=? WHERE id=? AND class_id=?', [name, groupId, classId]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Không tìm thấy nhóm trong lớp' });
    return res.json({ id: Number(groupId), name });
  }
  const [result] = await pool.query('INSERT INTO assignment_groups (class_id,name) VALUES (?,?)', [classId, name]);
  res.status(201).json({ id: result.insertId, name });
}
router.delete('/:classId/:groupId', classRoute(true, async (req, res) => {
  if (!id(req.params.groupId)) return res.status(400).json({ message: 'Nhóm không hợp lệ' });
  const [result] = await pool.query('DELETE FROM assignment_groups WHERE id=? AND class_id=?', [req.params.groupId, req.params.classId]);
  return result.affectedRows ? res.json({ success: true }) : res.status(404).json({ message: 'Không tìm thấy nhóm trong lớp' });
}));
const moveAssignment = handle(async (req, res) => {
  const assignmentId = req.params.id;
  const groupId = req.body?.group_id;
  if (!id(assignmentId) || (groupId !== null && !id(groupId))) return res.status(400).json({ message: 'Bài tập hoặc nhóm không hợp lệ' });
  const classId = await getAssignmentClassId(assignmentId);
  if (!classId) return res.status(404).json({ message: 'Không tìm thấy bài tập' });
  if (!(await assertClassAccess(req.user, classId, res, { manage: true }))) return;
  await ensureGroups();
  if (groupId === null) await pool.query('DELETE FROM assignment_group_items WHERE assignment_id=?', [assignmentId]);
  else {
    const [result] = await pool.query(`INSERT INTO assignment_group_items (assignment_id,group_id)
      SELECT a.id,g.id FROM assignments a JOIN assignment_groups g ON g.class_id=a.class_id WHERE a.id=? AND g.id=?
      ON DUPLICATE KEY UPDATE group_id=g.id`, [assignmentId, groupId]);
    if (!result.affectedRows) {
      const [[item]] = await pool.query('SELECT group_id FROM assignment_group_items WHERE assignment_id=?', [assignmentId]);
      if (Number(item?.group_id) !== Number(groupId)) return res.status(404).json({ message: 'Không tìm thấy nhóm trong lớp' });
    }
  }
  res.json({ group_id: groupId === null ? null : Number(groupId) });
});

module.exports = { router, ensureGroups, moveAssignment };
