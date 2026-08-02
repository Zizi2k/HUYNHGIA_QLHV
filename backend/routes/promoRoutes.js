const express = require('express');
const {
  listBanners,
  listCourses,
  createBanner,
  updateBanner,
  deleteBanner,
  createCourse,
  updateCourse,
  deleteCourse,
} = require('../controllers/promoController');
const { authenticate, authorize } = require('../middleware/auth');
const { uploadMemory } = require('../middleware/upload');

const router = express.Router();

router.use(authenticate);

router.get('/banners', listBanners);
router.get('/courses', listCourses);

router.post('/banners', authorize('admin'), uploadMemory.single('image'), createBanner);
router.put('/banners/:id', authorize('admin'), uploadMemory.single('image'), updateBanner);
router.delete('/banners/:id', authorize('admin'), deleteBanner);

router.post('/courses', authorize('admin'), uploadMemory.single('image'), createCourse);
router.put('/courses/:id', authorize('admin'), uploadMemory.single('image'), updateCourse);
router.delete('/courses/:id', authorize('admin'), deleteCourse);

module.exports = router;
