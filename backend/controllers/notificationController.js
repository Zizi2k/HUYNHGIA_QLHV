const pool = require('../config/db');
const {
  getUnreadForUser, getUnreadCount, listForUser, markRead, markAllRead,
} = require('../utils/notificationDb');

const getUnread = async (req, res) => {
  try {
    const rows = await getUnreadForUser(req.user.id, 50);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const getCount = async (req, res) => {
  try {
    const count = await getUnreadCount(req.user.id);
    res.json({ count });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const getList = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const offset = Number(req.query.offset) || 0;
    const rows = await listForUser(req.user.id, { limit, offset });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const readOne = async (req, res) => {
  try {
    const ok = await markRead(req.user.id, req.params.id);
    if (!ok) return res.status(404).json({ message: 'Không tìm thấy thông báo' });
    res.json({ message: 'Đã đánh dấu đã đọc' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const readAll = async (req, res) => {
  try {
    const count = await markAllRead(req.user.id);
    res.json({ message: 'Đã đánh dấu tất cả đã đọc', count });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

module.exports = { getUnread, getCount, getList, readOne, readAll };
