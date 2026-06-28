import { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Spinner, Badge, Alert,
} from 'react-bootstrap';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { userService } from '../services';
import PageHeader from '../components/layout/PageHeader';
import { isSuperAdmin } from '../utils/adminScope';

const scopeOptions = [
  { value: 'all', label: 'Admin tối cao (HG + EG)' },
  { value: 'HG', label: 'Admin LHG — chỉ tiền tố HG' },
  { value: 'EG', label: 'Admin EGC — chỉ tiền tố EG' },
];

const emptyForm = {
  fullname: '',
  username: '',
  code: '',
  admin_scope: 'HG',
  status: true,
};

function scopeBadge(scope) {
  if (scope === 'all' || !scope) return <Badge bg="danger">Tối cao</Badge>;
  if (scope === 'HG') return <Badge bg="primary">LHG (HG)</Badge>;
  if (scope === 'EG') return <Badge bg="success">EGC (EG)</Badge>;
  return <Badge bg="secondary">{scope}</Badge>;
}

export default function AdminStaffPage() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadAdmins = () => {
    setLoading(true);
    userService.listAdmins()
      .then((res) => setAdmins(res.data))
      .catch(() => setAdmins([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isSuperAdmin(user)) loadAdmins();
  }, [user]);

  if (!isSuperAdmin(user)) {
    return <Navigate to="/" replace />;
  }

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setShowModal(true);
  };

  const openEdit = (admin) => {
    setEditingId(admin.id);
    setForm({
      fullname: admin.fullname,
      username: admin.username,
      code: admin.code,
      admin_scope: admin.admin_scope || 'all',
      status: Boolean(admin.status),
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
        fullname: form.fullname,
        username: form.username,
        code: form.code,
        role: 'admin',
        admin_scope: form.admin_scope,
        status: form.status,
      };
      if (editingId) {
        await userService.update(editingId, payload);
      } else {
        await userService.create(payload);
      }
      setShowModal(false);
      loadAdmins();
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể lưu tài khoản admin');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (admin) => {
    if (admin.id === user.id) {
      alert('Không thể xóa tài khoản của chính bạn');
      return;
    }
    if (!window.confirm(`Xóa admin "${admin.fullname}"?`)) return;
    try {
      await userService.delete(admin.id);
      loadAdmins();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể xóa');
    }
  };

  return (
    <div className="page-container">
      <PageHeader
        title="Phân quyền admin"
        subtitle="Admin tối cao tạo admin phụ quản lý riêng học viên HG (LHG) hoặc EG (EGC)."
        actions={(
          <Button variant="primary" size="sm" onClick={openCreate}>
            <i className="bi bi-person-plus me-1" />
            Thêm admin phụ
          </Button>
        )}
      />

      <Alert variant="light" className="mb-4">
        <strong>HG</strong> và <strong>EG</strong> là hai nhóm học viên tách biệt — admin phụ chỉ thấy và quản lý đúng tiền tố được giao.
        Admin phụ HG/EG cũng có thể được phân công <strong>giáo viên phụ trách lớp</strong> tại tab Thành viên của lớp học.
      </Alert>

      {loading ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : (
        <Table responsive hover className="bg-white shadow-sm rounded">
          <thead className="table-light">
            <tr>
              <th>Họ tên</th>
              <th>Tên đăng nhập</th>
              <th>Mã đăng nhập</th>
              <th>Phạm vi</th>
              <th>Trạng thái</th>
              <th style={{ width: 140 }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id}>
                <td className="fw-semibold">{a.fullname}</td>
                <td>{a.username}</td>
                <td><code>{a.code}</code></td>
                <td>{scopeBadge(a.admin_scope)}</td>
                <td>
                  <Badge bg={a.status ? 'success' : 'secondary'}>
                    {a.status ? 'Hoạt động' : 'Khóa'}
                  </Badge>
                </td>
                <td>
                  <Button variant="outline-primary" size="sm" className="me-1" onClick={() => openEdit(a)}>
                    Sửa
                  </Button>
                  {a.id !== user.id && (
                    <Button variant="outline-danger" size="sm" onClick={() => handleDelete(a)}>
                      Xóa
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>{editingId ? 'Sửa admin' : 'Thêm admin phụ'}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            {error && <Alert variant="danger" className="py-2">{error}</Alert>}
            <Form.Group className="mb-3">
              <Form.Label>Phạm vi quản lý</Form.Label>
              <Form.Select
                value={form.admin_scope}
                onChange={(e) => setForm({ ...form, admin_scope: e.target.value })}
                disabled={editingId === user.id}
              >
                {scopeOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Họ tên</Form.Label>
              <Form.Control
                value={form.fullname}
                onChange={(e) => setForm({ ...form, fullname: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Tên đăng nhập</Form.Label>
              <Form.Control
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Mã đăng nhập</Form.Label>
              <Form.Control
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                required
              />
            </Form.Group>
            {editingId && (
              <Form.Check
                type="switch"
                id="admin-status"
                label="Tài khoản hoạt động"
                checked={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.checked })}
              />
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Hủy</Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}
