const SUBJECTS = {
  chinese: 'Tiếng Trung',
  english: 'Tiếng Anh',
  computer: 'Tin học',
  vietnamese: 'Tiếng Việt',
};

const SUBJECT_ALIASES = {
  'tieng trung': 'chinese',
  'tieng anh': 'english',
  'tin hoc': 'computer',
  'tieng viet': 'vietnamese',
  chinese: 'chinese',
  english: 'english',
  computer: 'computer',
  vietnamese: 'vietnamese',
};

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ');
}

function parseSubject(value) {
  const key = normalizeHeader(value);
  return SUBJECT_ALIASES[key] || null;
}

function parseAmount(value) {
  if (value === null || value === undefined || value === '') return 0;
  const num = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(num) ? num : 0;
}

function calculateFeeAfterDiscount(feeBefore, discount) {
  const before = parseAmount(feeBefore);
  if (!discount) return before;

  const value = Number(discount.discount_value) || 0;
  if (discount.discount_type === 'percent') {
    const pct = Math.min(Math.max(value, 0), 100);
    return Math.max(0, Math.round(before - (before * pct) / 100));
  }
  return Math.max(0, before - value);
}

async function resolveFeeAfterWithDiscount(conn, feeBefore, discountId) {
  if (!discountId) return parseAmount(feeBefore);
  const [rows] = await conn.query(
    'SELECT discount_type, discount_value FROM fee_discounts WHERE id = ? AND is_active = TRUE',
    [discountId]
  );
  if (!rows.length) return parseAmount(feeBefore);
  return calculateFeeAfterDiscount(feeBefore, rows[0]);
}

async function resolveTuitionAmounts(conn, {
  fee_before_discount, fee_after_discount, discount_id,
}) {
  const feeBefore = parseAmount(fee_before_discount);
  if (discount_id) {
    const feeAfter = await resolveFeeAfterWithDiscount(conn, feeBefore, discount_id);
    return { feeBefore, feeAfter };
  }
  return {
    feeBefore,
    feeAfter: parseAmount(fee_after_discount ?? fee_before_discount),
  };
}

function computeDebt(profile, payments = []) {
  const tuitionPaid = payments
    .filter((p) => p.payment_type === 'tuition')
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const bookPaid = payments
    .filter((p) => p.payment_type === 'book')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const feeAfter = Number(profile.fee_after_discount) || 0;
  const bookFee = Number(profile.book_fee) || 0;
  const tuitionDebt = Math.max(0, feeAfter - tuitionPaid);
  const bookDebt = Math.max(0, bookFee - bookPaid);
  const totalDebt = tuitionDebt + bookDebt;
  const totalDue = feeAfter + bookFee;
  const totalPaid = tuitionPaid + bookPaid;

  let status = 'unpaid';
  if (totalDue > 0 && totalPaid >= totalDue) status = 'paid';
  else if (totalPaid > 0) status = 'partial';

  return {
    tuition_paid: tuitionPaid,
    book_paid: bookPaid,
    total_paid: totalPaid,
    tuition_debt: tuitionDebt,
    book_debt: bookDebt,
    total_debt: totalDebt,
    status,
  };
}

function enrichProfile(profile, payments = []) {
  const debt = computeDebt(profile, payments);
  const monthPayments = (month) => payments.filter((p) => p.period_month === month);

  return {
    ...profile,
    subject_label: SUBJECTS[profile.subject] || profile.subject,
    discount_name: profile.discount_name || null,
    ...debt,
    _payments: payments,
    monthPaid: (month) => {
      const mp = monthPayments(month);
      return {
        tuition: mp.filter((p) => p.payment_type === 'tuition').reduce((s, p) => s + Number(p.amount), 0),
        book: mp.filter((p) => p.payment_type === 'book').reduce((s, p) => s + Number(p.amount), 0),
      };
    },
  };
}

function formatMonthYear(month) {
  const [year, mon] = String(month).split('-');
  return `Tháng ${parseInt(mon, 10)}/${year}`;
}

function formatMoney(amount) {
  return Number(amount || 0).toLocaleString('vi-VN');
}

module.exports = {
  SUBJECTS,
  SUBJECT_ALIASES,
  normalizeHeader,
  parseSubject,
  parseAmount,
  calculateFeeAfterDiscount,
  resolveFeeAfterWithDiscount,
  resolveTuitionAmounts,
  computeDebt,
  enrichProfile,
  formatMonthYear,
  formatMoney,
};
