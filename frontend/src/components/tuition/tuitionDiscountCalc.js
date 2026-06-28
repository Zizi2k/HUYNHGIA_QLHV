export function calculateFeeAfterDiscount(feeBefore, discount) {
  const before = Number(feeBefore) || 0;
  if (!discount) return before;

  const value = Number(discount.discount_value) || 0;
  if (discount.discount_type === 'percent') {
    const pct = Math.min(Math.max(value, 0), 100);
    return Math.max(0, Math.round(before - (before * pct) / 100));
  }
  return Math.max(0, before - value);
}

export function findDiscount(discounts, discountId) {
  if (!discountId) return null;
  return discounts.find((d) => String(d.id) === String(discountId)) || null;
}

/** Cập nhật form học phí khi đổi HP / mức giảm */
export function applyTuitionFieldChange(prev, field, value, discounts = []) {
  const next = { ...prev, [field]: value };

  if (field === 'base_fee') {
    next.fee_before_discount = value;
    const discount = findDiscount(discounts, next.discount_id);
    next.fee_after_discount = discount
      ? String(calculateFeeAfterDiscount(value, discount))
      : value;
    return next;
  }

  if (field === 'fee_before_discount') {
    const discount = findDiscount(discounts, next.discount_id);
    next.fee_after_discount = discount
      ? String(calculateFeeAfterDiscount(value, discount))
      : value;
    return next;
  }

  if (field === 'discount_id') {
    const discount = findDiscount(discounts, value);
    if (discount) {
      next.fee_after_discount = String(
        calculateFeeAfterDiscount(next.fee_before_discount, discount)
      );
      if (discount.default_reason && !String(next.discount_reason || '').trim()) {
        next.discount_reason = discount.default_reason;
      }
    } else {
      next.fee_after_discount = next.fee_before_discount;
    }
    return next;
  }

  return next;
}

export function isFeeAfterAutoCalculated(discountId) {
  return !!discountId;
}
