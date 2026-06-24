import { useEffect, useState } from 'react';
import { Container, Table, Button, Modal, Form, Spinner, Badge, Alert, Row, Col } from 'react-bootstrap';
import { userService, classService } from '../services';

const roleOptions = [
  { value: 'admin', label: 'Quản trị viên' },
  { value: 'teacher', label: 'Giáo viên' },
  { value: 'student', label: 'Học sinh' },
];

const emptyForm = { fullname: '', username: '', code: '', role: 'student', status: true };

export default function UsersPage() {
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [users, setUsers] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    classService.getAll()
      .then((res) => setClasses(res.data))
      .finally(() => setLoadingClasses(false));
  }, []);

  const loadUsers = (classId) => {
    if (!classId) {
      setUsers([]);
      return;
    }
    setLoadingUsers(true);
    userService.getAll(classId)
      .then((res) => setUsers(res.data))
      .finally(() => setLoadingUsers(false));
  };

  useEffect(() => {
    loadUsers(selectedClassId);
  }, [selectedClassId]);

  const openCreateModal = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setShowModal(true);
  };

  const openEditModal = (user) => {
    setEditingId(user.id);
    setForm({
      fullname: user.fullname,
      username: user.username,
      code: user.code,
      role: user.role,
      status: Boolean(user.status),
    });
    setError('');
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setForm(emptyForm);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await userService.update(editingId, form);
      } else {
        await userService.create(form);
      }
      closeModal();
      loadUsers(selectedClassId);
    } catch (err) {
      setError(err.response?.data?.message || 'Có lỗi xảy ra');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Xóa người dùng này?')) {
      await userService.delete(id);
      loadUsers(selectedClassId);
    }
  };

  if (loadingClasses) {
    return <Container className="text-center py-5"><Spinner animation="border" /></Container>;
  }

  const selectedClass = classes.find((c) => String(c.id) === selectedClassId);

  return (
    <Container>
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <h2 className="mb-0">Quản lý người dùng</h2>
        <Button variant="primary" onClick={openCreateModal}>
          <i className="bi bi-person-plus me-1" />Tạo tài khoản
        </Button>
      </div>

      <Row className="mb-4">
        <Col md={5} lg={4}>
          <Form.Group>
            <Form.Label className="fw-semibold">Chọn lớp học</Form.Label>
            <Form.Select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
            >
              <option value="">-- Chọn lớp để xem tài khoản --</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}{cls.code ? ` (${cls.code})` : ''}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        </Col>
      </Row>

      {!selectedClassId ? (
        <Alert variant="light" className="text-center py-4">
          <i className="bi bi-funnel d-block fs-3 text-muted mb-2" />
          Vui lòng chọn lớp học để xem danh sách tài khoản trong lớp.
        </Alert>
      ) : loadingUsers ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : (
        <>
          <div className="mb-3 text-muted small">
            Lớp: <strong>{selectedClass?.name}</strong>
            <span className="ms-2 badge bg-primary bg-opacity-10 text-primary">
              {users.length} tài khoản
            </span>
          </div>

          {users.length === 0 ? (
            <Alert variant="light" className="text-center py-4">
              Lớp này chưa có tài khoản nào. Thêm học viên tại tab Thành viên trong lớp học.
            </Alert>
          ) : (
            <Table responsive hover className="bg-white shadow-sm rounded">
              <thead className="table-light">
                <tr>
                  <th>Họ tên</th>
                  <th>Tên đăng nhập</th>
                  <th>Mã</th>
                  <th>Vai trò</th>
                  <th>Trạng thái</th>
                  <th style={{ width: 140 }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.fullname}</td>
                    <td>{u.username}</td>
                    <td>{u.code}</td>
                    <td>
                      <Badge bg={u.role === 'admin' ? 'danger' : u.role === 'teacher' ? 'primary' : 'secondary'}>
                        {roleOptions.find((r) => r.value === u.role)?.label}
                      </Badge>
                    </td>
                    <td>
                      <Badge bg={u.status ? 'success' : 'secondary'}>
                        {u.status ? 'Hoạt động' : 'Đã khóa'}
                      </Badge>
                    </td>
                    <td>
                      <Button
                        variant="outline-primary"
                        size="sm"
                        className="me-1"
                        onClick={() => openEditModal(u)}
                      >
                        <i className="bi bi-pencil me-1" />Sửa
                      </Button>
                      <Button variant="outline-danger" size="sm" onClick={() => handleDelete(u.id)}>
                        Xóa
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </>
      )}

      <Modal show={showModal} onHide={closeModal}>
        <Modal.Header closeButton>
          <Modal.Title>{editingId ? 'Sửa thông tin người dùng' : 'Tạo tài khoản mới'}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            {error && <div className="alert alert-danger py-2">{error}</div>}
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
              <Form.Label>Mã</Form.Label>
              <Form.Control
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Vai trò</Form.Label>
              <Form.Select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                {roleOptions.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </Form.Select>
            </Form.Group>
            {editingId && (
              <Form.Group>
                <Form.Check
                  type="switch"
                  id="user-status"
                  label="Tài khoản hoạt động"
                  checked={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.checked })}
                />
              </Form.Group>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={closeModal}>Hủy</Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Đang lưu...' : editingId ? 'Cập nhật' : 'Tạo'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
}
