const UNITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

function readTriple(num, full) {
  const hundred = Math.floor(num / 100);
  const ten = Math.floor((num % 100) / 10);
  const unit = num % 10;
  const parts = [];

  if (hundred > 0) {
    parts.push(`${UNITS[hundred]} trăm`);
    if (ten === 0 && unit > 0) parts.push('lẻ');
  } else if (full && ten + unit > 0) {
    parts.push('không trăm');
  }

  if (ten > 1) {
    parts.push(`${UNITS[ten]} mươi`);
    if (unit === 1) parts.push('mốt');
    else if (unit === 5) parts.push('lăm');
    else if (unit > 0) parts.push(UNITS[unit]);
  } else if (ten === 1) {
    parts.push('mười');
    if (unit === 5) parts.push('lăm');
    else if (unit > 0) parts.push(UNITS[unit]);
  } else if (unit > 0) {
    parts.push(UNITS[unit]);
  }

  return parts.join(' ');
}

function numberToVietnameseWords(amount) {
  const n = Math.round(Number(amount) || 0);
  if (n === 0) return 'Không đồng';

  const billion = Math.floor(n / 1_000_000_000);
  const million = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousand = Math.floor((n % 1_000_000) / 1_000);
  const remainder = n % 1_000;

  const parts = [];
  if (billion > 0) parts.push(`${readTriple(billion, false)} tỷ`);
  if (million > 0) parts.push(`${readTriple(million, billion > 0)} triệu`);
  if (thousand > 0) parts.push(`${readTriple(thousand, million > 0 || billion > 0)} nghìn`);
  if (remainder > 0 || parts.length === 0) {
    parts.push(readTriple(remainder, parts.length > 0));
  }

  const text = parts.join(' ').replace(/\s+/g, ' ').trim();
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} đồng`;
}

module.exports = { numberToVietnameseWords };
