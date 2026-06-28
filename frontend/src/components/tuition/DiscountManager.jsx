import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Badge, Spinner } from 'react-bootstrap';
import { tuitionService } from '../../services';

const emptyForm = {
  name: '', discount_type: 'fixed', discount_value: '', default_reason: '', is_active: true,
};

export default function DiscountManager() {
  const [discounts, setDiscounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    tuitionService.getDiscounts()
      .then((res) => setDiscounts(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setShowModal(true);
  };

  const openEdit = (d) => {
    setEditingId(d.id);
    setForm({
      name: d.name,
      discount_type: d.discount_type,
      discount_value: d.discount_value,
      default_reason: d.default_reason || '',
      is_active: Boolean(d.is_active),
    });
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        discount_value: Number(form.discount_value) || 0,
      };
      if (editingId) {
        await tuitionService.updateDiscount(editingId, payload);
      } else {
        await tuitionService.createDiscount(payload);
      }
      setShowModal(false);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Có lỗi xảy ra');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Xóa mức giảm này?')) return;
    await tuitionService.deleteDiscount(id);
    load();
  };

  if (loading) return <div className="text-center py-4"><Spinner animation="border" /></div>;

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="mb-0">Mức giảm giá</h5>
        <Button variant="primary" size="sm" onClick={openCreate}>
          <i className="bi bi-plus-lg me-1" />Thêm mức giảm
        </Button>
      </div>

      <Table responsive hover className="bg-white shadow-sm rounded">
        <thead className="table-light">
          <tr>
            <th>Tên mức giảm</th>
            <th>Loại</th>
            <th>Giá trị</th>
            <th>Lý do mặc định</th>
            <th>Trạng thái</th>
            <th style={{ width: 120 }}>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {discounts.length === 0 ? (
            <tr><td colSpan={6} className="text-center text-muted py-4">Chưa có mức giảm</td></tr>
          ) : discounts.map((d) => (
            <tr key={d.id}>
              <td>{d.name}</td>
              <td>{d.discount_type === 'percent' ? 'Phần trăm' : 'Cố định'}</td>
              <td>{d.discount_type === 'percent' ? `${d.discount_value}%` : Number(d.discount_value).toLocaleString('vi-VN')}</td>
              <td>{d.default_reason || '—'}</td>
              <td>
                <Badge bg={d.is_active ? 'success' : 'secondary'}>
                  {d.is_active ? 'Đang dùng' : 'Tắt'}
                </Badge>
              </td>
              <td>
                <Button variant="outline-primary" size="sm" className="me-1" onClick={() => openEdit(d)}>
                  <i className="bi bi-pencil" />
                </Button>
                <Button variant="outline-danger" size="sm" onClick={() => handleDelete(d.id)}>
                  <i className="bi bi-trash" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>{editingId ? 'Sửa mức giảm' : 'Thêm mức giảm'}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            {error && <div className="alert alert-danger py-2">{error}</div>}
            <Form.Group className="mb-3">
              <Form.Label>Tên mức giảm</Form.Label>
              <Form.Control value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Loại giảm</Form.Label>
              <Form.Select value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })}>
                <option value="fixed">Số tiền cố định</option>
                <option value="percent">Phần trăm</option>
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Giá trị</Form.Label>
              <Form.Control type="number" min="0" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} required />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Lý do mặc định</Form.Label>
              <Form.Control as="textarea" rows={2} value={form.default_reason} onChange={(e) => setForm({ ...form, default_reason: e.target.value })} />
            </Form.Group>
            <Form.Check type="switch" label="Đang sử dụng" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Hủy</Button>
            <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </>
  );
}
