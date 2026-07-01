const { formatMoney } = require('./tuitionHelpers');
const { numberToVietnameseWords } = require('./vietnameseNumberWords');

const ORG_BY_PREFIX = {
  EG: {
    unitName: 'ENGLISH GARDEN CENTRE',
    unitAddress: '47A Đường số 7, Hẻm 10 An Dương Vương, Kp. Long Mỹ, P. Long Hoa, Tây Ninh',
  },
  HG: {
    unitName: 'Trung tâm ngoại ngữ tin học Huỳnh Gia',
    unitAddress: 'Ấp 5, An Viễn, Thành phố Đồng Nai',
  },
};

function resolveReceiptOrg(studentCode) {
  const code = String(studentCode || '').trim().toUpperCase();
  if (code.startsWith('EG')) return ORG_BY_PREFIX.EG;
  return ORG_BY_PREFIX.HG;
}

function paymentReasonLabel(paymentType) {
  if (paymentType === 'book') return 'sách';
  if (paymentType === 'both') return 'cả 2';
  return 'học phí';
}

function formatReceiptDate(dateValue) {
  const d = dateValue ? new Date(dateValue) : new Date();
  if (Number.isNaN(d.getTime())) return { day: '...', month: '...', year: '...' };
  return {
    day: String(d.getDate()),
    month: String(d.getMonth() + 1),
    year: String(d.getFullYear()),
  };
}

function formatReceiptSerial(value, paymentId) {
  if (value != null && String(value).trim() !== '') {
    const s = String(value).trim();
    if (/^\d+$/.test(s)) return s.padStart(6, '0');
    return s;
  }
  return String(paymentId).padStart(6, '0');
}

function formatBookNo(value, paymentDate) {
  if (value != null && String(value).trim() !== '') {
    return String(value).trim();
  }
  return String(new Date(paymentDate || Date.now()).getFullYear());
}

function buildReceiptData(payment, profile, recorder) {
  const org = resolveReceiptOrg(profile.student_code);
  const date = formatReceiptDate(payment.payment_date);
  const amount = Number(payment.amount) || 0;

  return {
    receiptNo: formatReceiptSerial(payment.receipt_no, payment.id),
    bookNo: formatBookNo(payment.book_no, payment.payment_date),
    org,
    payerName: profile.fullname,
    payerAddress: profile.current_class || profile.class_label || '',
    reason: paymentReasonLabel(payment.payment_type),
    amount,
    amountFormatted: formatMoney(amount),
    amountInWords: numberToVietnameseWords(amount),
    paymentDate: date,
    payerSignatureName: profile.fullname,
    treasurerName: recorder?.fullname || recorder?.recorder_name || '',
    note: payment.note || '',
    method: payment.method,
    periodMonth: payment.period_month,
    studentCode: profile.student_code,
  };
}

module.exports = {
  resolveReceiptOrg,
  paymentReasonLabel,
  buildReceiptData,
  formatReceiptDate,
  formatReceiptSerial,
  formatBookNo,
};
