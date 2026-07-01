import { API_BASE } from '../config/apiBase';

export function getPaymentReceiptUrl(paymentId) {
  const token = localStorage.getItem('token');
  const base = API_BASE.replace(/\/$/, '');
  return `${base}/tuition/payments/${paymentId}/receipt?token=${encodeURIComponent(token || '')}`;
}

export async function openPaymentReceipt(paymentId) {
  const token = localStorage.getItem('token');
  const base = API_BASE.replace(/\/$/, '');
  const url = `${base}/tuition/payments/${paymentId}/receipt`;

  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể tải phiếu thu');
  }
  const blob = await res.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  window.open(objectUrl, '_blank', 'noopener,noreferrer');
  setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60000);
}
