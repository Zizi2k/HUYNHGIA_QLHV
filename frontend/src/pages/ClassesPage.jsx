import { useEffect, useState, useCallback } from 'react';
import { Row, Col, Button, Modal, Form, Spinner, Alert, InputGroup, ButtonGroup } from 'react-bootstrap';
import { classService } from '../services';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/layout/PageHeader';
import ClassCard, { ClassMediaTile } from '../components/class/ClassCard';
import { SUBJECT_OPTIONS } from '../components/tuition/tuitionConstants';
import { isSuperAdmin } from '../utils/adminScope';
import { getAvatarUrl } from '../utils/avatar';
import { LESSON_IMAGE_ACCEPT, isLessonImageAllowed } from '../utils/fileTypes';

const emptyForm = { name: '', description: '', subject: '', avatarFile: null };

const PREFIX_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'HG', label: 'LHG (HG)' },
  { value: 'EG', label: 'EGC (EG)' },
];

export default function ClassesPage() {
  const { user } = useAuth();
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [prefixFilter, setPrefixFilter] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [debouncedTeacherSearch, setDebouncedTeacherSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isAdmin = user?.role === 'admin';
  const canManage = isAdmin;
  const showSuperFilters = isSuperAdmin(user);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTeacherSearch(teacherSearch.trim()), 300);
    return () => clearTimeout(timer);
  }, [teacherSearch]);

  const loadClasses = useCallback(() => {
    setLoading(true);
    const params = {};
    if (debouncedSearch) params.search = debouncedSearch;
    if (showSuperFilters && debouncedTeacherSearch) params.teacher = debouncedTeacherSearch;
    if (showSuperFilters && prefixFilter) params.prefix = prefixFilter;
    classService.getAll(Object.keys(params).length ? params : {})
      .then((res) => setClasses(res.data))
      .finally(() => setLoading(false));
  }, [debouncedSearch, debouncedTeacherSearch, prefixFilter, showSuperFilters]);

  useEffect(() => { loadClasses(); }, [loadClasses]);

  const openCreateModal = () => {
    setEditingId(null);
    setForm(emptyForm);
    setAvatarPreview(null);
    setError('');
    setShowModal(true);
  };

  const openEditModal = (cls) => {
    setEditingId(cls.id);
    setForm({
      name: cls.name,
      description: cls.description || '',
      subject: cls.subject || '',
      avatarFile: null,
    });
    setAvatarPreview(cls.avatar_url ? getAvatarUrl(cls.avatar_url) : null);
    setError('');
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setForm(emptyForm);
    setAvatarPreview(null);
    setError('');
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isLessonImageAllowed(file)) {
      setError('Chỉ chấp nhận ảnh JPG, PNG, GIF hoặc WEBP');
      return;
    }
    setError('');
    setForm({ ...form, avatarFile: file });
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await classService.update(editingId, {
          name: form.name,
          description: form.description,
          subject: form.subject,
        });
        if (form.avatarFile) {
          const fd = new FormData();
          fd.append('avatar', form.avatarFile);
          await classService.uploadAvatar(editingId, fd);
        }
      } else {
        const res = await classService.create({
          name: form.name,
          description: form.description,
          subject: form.subject,
        });
        if (form.avatarFile && res.data?.id) {
          const fd = new FormData();
          fd.append('avatar', form.avatarFile);
          await classService.uploadAvatar(res.data.id, fd);
        }
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

      <Row className="mb-4 g-3">
        <Col md={showSuperFilters ? 4 : 6} lg={showSuperFilters ? 4 : 5}>
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
        {showSuperFilters && (
          <>
            <Col md={4} lg={3}>
              <InputGroup>
                <InputGroup.Text><i className="bi bi-person-badge" /></InputGroup.Text>
                <Form.Control
                  type="search"
                  placeholder="Tìm theo giáo viên đảm nhiệm..."
                  value={teacherSearch}
                  onChange={(e) => setTeacherSearch(e.target.value)}
                />
                {teacherSearch && (
                  <Button variant="outline-secondary" onClick={() => setTeacherSearch('')}>
                    <i className="bi bi-x-lg" />
                  </Button>
                )}
              </InputGroup>
            </Col>
            <Col md={4} lg={5} className="d-flex align-items-center">
              <span className="text-muted small me-2 flex-shrink-0">Lọc nhánh:</span>
              <ButtonGroup size="sm" className="flex-wrap">
                {PREFIX_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value || 'all'}
                    variant={prefixFilter === opt.value ? 'primary' : 'outline-primary'}
                    onClick={() => setPrefixFilter(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </ButtonGroup>
            </Col>
          </>
        )}
      </Row>

      {loading ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : classes.length === 0 ? (
        <Alert variant="light">
          {debouncedSearch || debouncedTeacherSearch || prefixFilter
            ? 'Không tìm thấy lớp nào khớp bộ lọc hiện tại.'
            : user?.role === 'teacher'
              ? 'Bạn chưa được admin phân công lớp học nào.'
              : 'Chưa có lớp học nào.'}
        </Alert>
      ) : (
        <Row className="g-3">
          {classes.map((cls) => (
            <Col md={4} key={cls.id}>
              <ClassCard
                cls={cls}
                canManage={canManage}
                onEdit={openEditModal}
                onDelete={handleDelete}
              />
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
            <Form.Group className="mb-3">
              <Form.Label>Ảnh đại diện lớp học</Form.Label>
              <div className="d-flex align-items-center gap-3">
                <ClassMediaTile
                  variant="class"
                  src={avatarPreview || undefined}
                  alt="Preview"
                  icon="mortarboard"
                  label="Lớp học"
                  className="class-card-preview-tile"
                />
                <Form.Control
                  type="file"
                  accept={LESSON_IMAGE_ACCEPT}
                  onChange={handleAvatarChange}
                />
              </div>
              <Form.Text className="text-muted">JPG, PNG, GIF hoặc WEBP — tối đa 3MB</Form.Text>
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
