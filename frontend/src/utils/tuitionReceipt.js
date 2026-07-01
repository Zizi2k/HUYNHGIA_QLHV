import { API_URL } from '../config/apiBase';
import { tuitionService } from '../services';

export function getPaymentReceiptUrl(paymentId) {
  const token = localStorage.getItem('token');
  const base = API_URL.replace(/\/$/, '');
  return `${base}/tuition/payments/${paymentId}/receipt?token=${encodeURIComponent(token || '')}`;
}

async function messageFromBlobError(data) {
  if (data instanceof Blob && data.type?.includes('json')) {
    const text = await data.text();
    try {
      const json = JSON.parse(text);
      return json.message || 'Không thể tải phiếu thu';
    } catch {
      return 'Không thể tải phiếu thu';
    }
  }
  return 'Không thể tải phiếu thu';
}

export async function openPaymentReceipt(paymentId) {
  try {
    const res = await tuitionService.getPaymentReceipt(paymentId);
    const blob = new Blob([res.data], { type: 'application/pdf' });
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => window.URL.revokeObjectURL(objectUrl), 120000);
  } catch (err) {
    const msg = err.response?.data
      ? await messageFromBlobError(err.response.data)
      : (err.message || 'Không thể tải phiếu thu');
    throw new Error(msg);
  }
}
