const { getCenterById, getDefaultCenterId } = require('../utils/centerCache');

const resolveCenter = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return next();
    }

    const header = req.headers['x-center-id'];
    let centerId;

    if (header) {
      centerId = parseInt(header, 10);
      if (!Number.isFinite(centerId)) {
        return res.status(400).json({ message: 'Trung tâm không hợp lệ' });
      }
    } else {
      centerId = await getDefaultCenterId();
    }

    if (!centerId) {
      return res.status(500).json({ message: 'Chưa cấu hình trung tâm' });
    }

    const center = await getCenterById(centerId);
    if (!center) {
      return res.status(400).json({ message: 'Không tìm thấy trung tâm' });
    }

    req.centerId = center.id;
    req.centerCode = center.code;
    req.center = center;
    return next();
  } catch (err) {
    return res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

module.exports = { resolveCenter };
