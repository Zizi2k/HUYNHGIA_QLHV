import { useEffect, useState, useCallback } from 'react';
import { Row, Col, Card, Button, Modal, Form, Spinner, Alert, InputGroup } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { classService } from '../services';
import { useAuth } from '../context/AuthContext';
import { useCenter } from '../context/CenterContext';
import PageHeader from '../components/layout/PageHeader';
import { SUBJECT_OPTIONS } from '../components/tuition/tuitionConstants';

const emptyForm = { name: '', description: '', subject: '' };

export default function ClassesPage() {
  const { user } = useAuth();
  const { centerKey } = useCenter() || {};
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isAdmin = user?.role === 'admin';
  const canManage = isAdmin;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadClasses = useCallback(() => {
    setLoading(true);
    classService.getAll(debouncedSearch ? { search: debouncedSearch } : {})
      .then((res) => setClasses(res.data))
      .finally(() => setLoading(false));
  }, [debouncedSearch]);

  useEffect(() => { loadClasses(); }, [loadClasses, centerKey]);

  const openCreateModal = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setShowModal(true);
  };

  const openEditModal = (cls) => {
    setEditingId(cls.id);
    setForm({
      name: cls.name,
      description: cls.description || '',
      subject: cls.subject || '',
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

  return (
    <div className="page-container">
      <PageHeader
        title="Lớp học"
        subtitle="Danh sách và quản lý các lớp học trên hệ thống."
        actions={
          canManage ? (
            <Button variant="success" size="sm" className="page-header-btn" onClick={openCreateModal}>
              <i className="bi bi-plus-lg me-1" />Tạo lớp học
            </Button>
          ) : null
        }
      />

      <Row className="mb-4">
        <Col md={6} lg={5}>
          <InputGroup>
            <InputGroup.Text><i className="bi bi-search" /></InputGroup.Text>
            <Form.Control
              type="search"
              placeholder="Tìm theo tên, mã hoặc mô tả lớp..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <Button variant="outline-secondary" onClick={() => setSearch('')}>
                <i className="bi bi-x-lg" />
              </Button>
            )}
          </InputGroup>
        </Col>
      </Row>

      {loading ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : classes.length === 0 ? (
        <Alert variant="light">
          {debouncedSearch
            ? `Không tìm thấy lớp nào khớp "${debouncedSearch}".`
            : user?.role === 'teacher'
              ? 'Bạn chưa được admin phân công lớp học nào.'
              : 'Chưa có lớp học nào.'}
        </Alert>
      ) : (
        <Row className="g-3">
          {classes.map((cls) => (
            <Col md={4} key={cls.id}>
              <Card className="h-100 border-0 shadow-sm">
                <Card.Body>
                  <div className="d-flex justify-content-between align-items-start gap-2">
                    <div>
                      <h5 className="mb-1 text-break">{cls.name}</h5>
                      {cls.code && (
                        <span className="badge bg-secondary bg-opacity-10 text-secondary mb-2">{cls.code}</span>
                      )}
                    </div>
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
                  <p className="text-muted mb-2">{cls.description || '—'}</p>
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
      )}

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
            <Form.Group className="mb-3">
              <Form.Label>Môn học</Form.Label>
              <Form.Select
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                required
              >
                <option value="">-- Chọn môn học --</option>
                {SUBJECT_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </Form.Select>
              <Form.Text className="text-muted">
                Dùng để tự sinh mã học viên và liên kết học phí khi thêm học viên.
              </Form.Text>
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
    </div>
  );
}
