import { useEffect, useState } from 'react';
import { Modal, Form, Button } from 'react-bootstrap';
import { tuitionService } from '../../services';
import { currentMonthValue } from './tuitionConstants';
import { openPaymentReceipt } from '../../utils/tuitionReceipt';

const defaultForm = () => ({
  payment_type: 'tuition',
  amount: '',
  method: 'cash',
  payment_date: new Date().toISOString().slice(0, 10),
  period_month: currentMonthValue(),
  note: '',
});

function formatDateInput(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function formatMonthInput(value) {
  if (!value) return currentMonthValue();
  const s = String(value);
  return s.length >= 7 ? s.slice(0, 7) : s;
}

export default function PaymentModal({
  show, onHide, profile, payment, onSuccess,
}) {
  const isEdit = Boolean(payment);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!show) return;
    if (payment) {
      setForm({
        payment_type: payment.payment_type || 'tuition',
        amount: String(payment.amount ?? ''),
        method: payment.method || 'cash',
        payment_date: formatDateInput(payment.payment_date),
        period_month: formatMonthInput(payment.period_month),
        note: payment.note || '',
      });
    } else {
      setForm(defaultForm());
    }
    setError('');
  }, [show, payment]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        amount: Number(form.amount),
      };
      const res = isEdit
        ? await tuitionService.updatePayment(payment.id, payload)
        : await tuitionService.createPayment({ profile_id: profile.id, ...payload });
      onSuccess?.(res.data);
      if (res.data?.id) {
        try {
          await openPaymentReceipt(res.data.id);
        } catch {
          // receipt preview optional
        }
      }
      onHide();
      if (!isEdit) setForm(defaultForm());
    } catch (err) {
      setError(err.response?.data?.message || (isEdit ? 'Không thể cập nhật phiếu thu' : 'Không thể ghi nhận thanh toán'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>{isEdit ? 'Sửa phiếu thu' : 'Thu học phí / sách'}</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          {profile && (
            <p className="text-muted small mb-3">
              {profile.fullname} — <strong>{profile.student_code}</strong>
              {isEdit && payment?.id && (
                <> — Phiếu thu <strong>#{String(payment.id).padStart(6, '0')}</strong></>
              )}
            </p>
          )}
          {error && <div className="alert alert-danger py-2">{error}</div>}
          <Form.Group className="mb-3">
            <Form.Label>Loại thu</Form.Label>
            <Form.Select value={form.payment_type} onChange={(e) => setForm({ ...form, payment_type: e.target.value })}>
              <option value="tuition">Học phí</option>
              <option value="book">Sách</option>
              <option value="both">Học phí + Sách</option>
            </Form.Select>
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Số tiền (đ)</Form.Label>
            <Form.Control type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Phương thức</Form.Label>
            <Form.Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              <option value="cash">Tiền mặt</option>
              <option value="transfer">Chuyển khoản</option>
            </Form.Select>
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Ngày thu</Form.Label>
            <Form.Control type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} required />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Tháng áp dụng</Form.Label>
            <Form.Control type="month" value={form.period_month} onChange={(e) => setForm({ ...form, period_month: e.target.value })} required />
          </Form.Group>
          <Form.Group>
            <Form.Label>Ghi chú</Form.Label>
            <Form.Control as="textarea" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide}>Hủy</Button>
          <Button type="submit" variant="success" disabled={saving}>
            {saving ? 'Đang lưu...' : (isEdit ? 'Lưu thay đổi' : 'Ghi nhận')}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
