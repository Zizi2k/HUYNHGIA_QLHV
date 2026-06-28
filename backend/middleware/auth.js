const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Chưa đăng nhập' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ' });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Không có quyền truy cập' });
  }
  next();
};

const requireSuperAdmin = (req, res, next) => {
  const { isSuperAdmin } = require('../utils/adminScope');
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({ message: 'Chỉ admin tối cao mới có quyền này' });
  }
  next();
};

module.exports = { authenticate, authorize, requireSuperAdmin };
