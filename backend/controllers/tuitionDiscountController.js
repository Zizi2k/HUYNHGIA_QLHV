const pool = require('../config/db');
const { logAction } = require('../utils/auditLog');

const getDiscounts = async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM fee_discounts ORDER BY is_active DESC, name'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const createDiscount = async (req, res) => {
  try {
    const { name, discount_type, discount_value, default_reason, is_active } = req.body;
    if (!name) return res.status(400).json({ message: 'Thiếu tên mức giảm' });

    const [result] = await pool.query(
      `INSERT INTO fee_discounts (name, discount_type, discount_value, default_reason, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [
        name,
        discount_type || 'fixed',
        discount_value || 0,
        default_reason || null,
        is_active !== false,
      ]
    );
    res.status(201).json({ id: result.insertId, message: 'Tạo mức giảm thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const updateDiscount = async (req, res) => {
  try {
    const { name, discount_type, discount_value, default_reason, is_active } = req.body;
    const [result] = await pool.query(
      `UPDATE fee_discounts SET name=?, discount_type=?, discount_value=?, default_reason=?, is_active=?
       WHERE id=?`,
      [name, discount_type, discount_value, default_reason, is_active !== false, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Không tìm thấy mức giảm' });
    }
    res.json({ message: 'Cập nhật mức giảm thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const deleteDiscount = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name FROM fee_discounts WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy mức giảm' });
    }
    await pool.query('DELETE FROM fee_discounts WHERE id = ?', [req.params.id]);
    await logAction({
      actorId: req.user.id,
      action: 'delete',
      resourceType: 'tuition_discount',
      resourceId: rows[0].id,
      resourceLabel: rows[0].name,
    });
    res.json({ message: 'Xóa mức giảm thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

module.exports = { getDiscounts, createDiscount, updateDiscount, deleteDiscount };
