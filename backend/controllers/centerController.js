const { loadCenters } = require('../utils/centerCache');

const getCenters = async (_req, res) => {
  try {
    const centers = await loadCenters();
    res.json(centers);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

module.exports = { getCenters };
