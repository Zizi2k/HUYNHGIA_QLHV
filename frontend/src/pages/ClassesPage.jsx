import { useEffect, useState } from 'react';
import { Container, Row, Col, Card, Button, Modal, Form, Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { classService } from '../services';
import { useAuth } from '../context/AuthContext';

const emptyForm = { name: '', description: '' };

export default function ClassesPage() {
  const { user } = useAuth();
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isAdmin = user?.role === 'admin';
  const canManage = isAdmin;

  const loadClasses = () => {
    classService.getAll()
      .then((res) => setClasses(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadClasses(); }, []);

  const openCreateModal = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setShowModal(true);
  };

  const openEditModal = (cls) => {
    setEditingId(cls.id);
    setForm({ name: cls.name, description: cls.description || '' });
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
        await classService.update(editingId, form);
      } else {
        await classService.create(form);
      }
      closeModal();
      loadClasses();
    } catch (err) {
      setError(err.response?.data?.message || 'Có lỗi xảy ra');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cls) => {
    if (!window.confirm(`Xóa lớp học "${cls.name}"? Tất cả bài giảng, bài tập và thảo luận sẽ bị xóa.`)) {
      return;
    }
    try {
      await classService.delete(cls.id);
      loadClasses();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể xóa lớp học');
    }
  };

  if (loading) {
    return <Container className="text-center py-5"><Spinner animation="border" /></Container>;
  }

  return (
    <Container>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Lớp học</h2>
        {canManage && (
          <Button variant="primary" onClick={openCreateModal}>
            <i className="bi bi-plus-lg me-1" />Tạo lớp học
          </Button>
        )}
      </div>

      {classes.length === 0 && (
        <Alert variant="light">
          {user?.role === 'teacher'
            ? 'Bạn chưa được admin phân công lớp học nào.'
            : 'Chưa có lớp học nào.'}
        </Alert>
      )}

      <Row className="g-3">
        {classes.map((cls) => (
          <Col md={4} key={cls.id}>
            <Card className="h-100 border-0 shadow-sm">
              <Card.Body>
                <div className="d-flex justify-content-between align-items-start gap-2">
                  <h5 className="mb-2">{cls.name}</h5>
                  {canManage && (
                    <div className="d-flex gap-1 flex-shrink-0">
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        title="Sửa lớp học"
                        onClick={() => openEditModal(cls)}
                      >
                        <i className="bi bi-pencil" />
                      </Button>
                      <Button
                        variant="outline-danger"
                        size="sm"
                        title="Xóa lớp học"
                        onClick={() => handleDelete(cls)}
                      >
                        <i className="bi bi-trash" />
                      </Button>
                    </div>
                  )}
                </div>
                <p className="text-muted">{cls.description}</p>
                <span className="badge bg-primary bg-opacity-10 text-primary">
                  {cls.member_count} thành viên
                </span>
              </Card.Body>
              <Card.Footer className="bg-white border-0">
                <Button as={Link} to={`/classes/${cls.id}`} variant="outline-primary" size="sm">
                  Vào lớp học
                </Button>
              </Card.Footer>
            </Card>
          </Col>
        ))}
      </Row>

      <Modal show={showModal} onHide={closeModal}>
        <Modal.Header closeButton>
          <Modal.Title>{editingId ? 'Sửa lớp học' : 'Tạo lớp học mới'}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            {error && <div className="alert alert-danger py-2">{error}</div>}
            <Form.Group className="mb-3">
              <Form.Label>Tên lớp</Form.Label>
              <Form.Control
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group>
              <Form.Label>Mô tả</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Form.Group>
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
