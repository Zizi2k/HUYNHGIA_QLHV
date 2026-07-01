const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const excelUpload = require('../middleware/excelUpload');
const {
  getDiscounts, createDiscount, updateDiscount, deleteDiscount,
} = require('../controllers/tuitionDiscountController');
const {
  getProfiles, getProfileById, createProfile, updateProfile, deleteProfile,
  createPayment, updatePayment, deletePayment, getPeriods, createPeriod,
  getMonthlyReport, exportMonthlyPdf,
  getPaymentReceiptPdf, getStudentReceipts,
} = require('../controllers/tuitionController');
const { importProfiles, downloadImportTemplate } = require('../controllers/tuitionImportController');
const {
  importPayments, downloadPaymentImportTemplate,
} = require('../controllers/tuitionPaymentImportController');

const router = express.Router();

router.use(authenticate);

router.get('/student/receipts', authorize('student'), getStudentReceipts);
router.get('/payments/:id/receipt', authorize('admin', 'student'), getPaymentReceiptPdf);

router.use(authorize('admin'));

router.get('/discounts', getDiscounts);
router.post('/discounts', createDiscount);
router.put('/discounts/:id', updateDiscount);
router.delete('/discounts/:id', deleteDiscount);

router.get('/profiles', getProfiles);
router.get('/profiles/import-template', downloadImportTemplate);
router.post('/profiles/import', excelUpload.single('file'), importProfiles);
router.get('/profiles/:id', getProfileById);
router.post('/profiles', createProfile);
router.put('/profiles/:id', updateProfile);
router.delete('/profiles/:id', deleteProfile);

router.post('/payments', createPayment);
router.get('/payments/import-template', downloadPaymentImportTemplate);
router.post('/payments/import', excelUpload.single('file'), importPayments);
router.put('/payments/:id', updatePayment);
router.delete('/payments/:id', deletePayment);

router.get('/periods', getPeriods);
router.post('/periods', createPeriod);

router.get('/report/monthly', getMonthlyReport);
router.get('/report/monthly/pdf', exportMonthlyPdf);

module.exports = router;
