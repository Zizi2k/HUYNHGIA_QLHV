import { useState } from 'react';
import { Modal, Form, Button } from 'react-bootstrap';
import { tuitionService } from '../../services';
import { currentMonthValue } from './tuitionConstants';

export default function PaymentModal({ show, onHide, profile, onSuccess }) {
  const [form, setForm] = useState({
    payment_type: 'tuition',
    amount: '',
    method: 'cash',
    payment_date: new Date().toISOString().slice(0, 10),
    period_month: currentMonthValue(),
    note: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setError('');
    try {
      await tuitionService.createPayment({
        profile_id: profile.id,
        ...form,
        amount: Number(form.amount),
      });
      onSuccess?.();
      onHide();
      setForm({
        payment_type: 'tuition',
        amount: '',
        method: 'cash',
        payment_date: new Date().toISOString().slice(0, 10),
        period_month: currentMonthValue(),
        note: '',
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể ghi nhận thanh toán');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Thu học phí / sách</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          {profile && (
            <p className="text-muted small mb-3">
              {profile.fullname} — <strong>{profile.student_code}</strong>
            </p>
          )}
          {error && <div className="alert alert-danger py-2">{error}</div>}
          <Form.Group className="mb-3">
            <Form.Label>Loại thu</Form.Label>
            <Form.Select value={form.payment_type} onChange={(e) => setForm({ ...form, payment_type: e.target.value })}>
              <option value="tuition">Học phí</option>
              <option value="book">Phí sách</option>
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
          <Button type="submit" variant="success" disabled={saving}>{saving ? 'Đang lưu...' : 'Ghi nhận'}</Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
