import { useEffect, useState } from 'react';
import {
  Modal, Form, Button, Alert, Spinner, Table, Badge,
} from 'react-bootstrap';
import { studentService } from '../../services';
import { SUBJECT_OPTIONS } from './studentConstants';

const emptyForm = {
  name: '',
  subject: 'english',
  duration_months: 3,
  description: '',
  is_active: true,
};

export default function CourseManager({ show, onHide, onChanged }) {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const loadCourses = () => {
    setLoading(true);
    studentService.getCourses()
      .then((res) => setCourses(res.data))
      .catch(() => setError('Không thể tải danh sách khóa học'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (show) {
      setError('');
      setEditingId(null);
      setForm(emptyForm);
      loadCourses();
    }
  }, [show]);

  const openEdit = (course) => {
    setEditingId(course.id);
    setForm({
      name: course.name,
      subject: course.subject,
      duration_months: course.duration_months,
      description: course.description || '',
      is_active: !!course.is_active,
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await studentService.updateCourse(editingId, form);
      } else {
        await studentService.createCourse(form);
      }
      setEditingId(null);
      setForm(emptyForm);
      loadCourses();
      if (onChanged) onChanged();
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể lưu khóa học');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Xóa khóa "${name}"?`)) return;
    try {
      await studentService.deleteCourse(id);
      loadCourses();
      if (onChanged) onChanged();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể xóa khóa học');
    }
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" className="scrollable-form-modal">
      <Modal.Header closeButton>
        <Modal.Title>Quản lý khóa học</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger" className="py-2">{error}</Alert>}

        <Form onSubmit={handleSubmit} className="mb-4 p-3 border rounded bg-light">
          <h6 className="fw-bold mb-3">{editingId ? 'Sửa khóa học' : 'Thêm khóa học mới'}</h6>
          <div className="row g-3">
            <div className="col-md-6">
              <Form.Group>
                <Form.Label>Tên khóa <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="VD: Khóa 3 tháng cơ bản"
                  required
                />
              </Form.Group>
            </div>
            <div className="col-md-3">
              <Form.Group>
                <Form.Label>Môn học</Form.Label>
                <Form.Select
                  value={form.subject}
                  onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
                >
                  {SUBJECT_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </Form.Select>
              </Form.Group>
            </div>
            <div className="col-md-3">
              <Form.Group>
                <Form.Label>Thời lượng (tháng)</Form.Label>
                <Form.Control
                  type="number"
                  min="1"
                  value={form.duration_months}
                  onChange={(e) => setForm((p) => ({ ...p, duration_months: e.target.value }))}
                  required
                />
              </Form.Group>
            </div>
            <div className="col-12">
              <Form.Group>
                <Form.Label>Mô tả</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                />
              </Form.Group>
            </div>
            <div className="col-md-6">
              <Form.Check
                type="switch"
                id="course-active"
                label="Đang áp dụng"
                checked={form.is_active}
                onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
              />
            </div>
            <div className="col-12 d-flex gap-2">
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? 'Đang lưu...' : editingId ? 'Cập nhật' : 'Thêm khóa'}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant="outline-secondary"
                  onClick={() => { setEditingId(null); setForm(emptyForm); }}
                >
                  Hủy sửa
                </Button>
              )}
            </div>
          </div>
        </Form>

        {loading ? (
          <div className="text-center py-4"><Spinner animation="border" /></div>
        ) : (
          <Table responsive hover size="sm" className="bg-white mb-0">
            <thead className="table-light">
              <tr>
                <th>Khóa học</th>
                <th>Môn</th>
                <th>Thời lượng</th>
                <th>Trạng thái</th>
                <th className="text-end">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="fw-semibold">{c.name}</div>
                    {c.description && <small className="text-muted">{c.description}</small>}
                  </td>
                  <td>{c.subject_label}</td>
                  <td>{c.duration_months} tháng</td>
                  <td>
                    <Badge bg={c.is_active ? 'success' : 'secondary'}>
                      {c.is_active ? 'Đang dùng' : 'Tắt'}
                    </Badge>
                  </td>
                  <td className="text-end">
                    <Button variant="light" size="sm" className="me-1" onClick={() => openEdit(c)}>
                      <i className="bi bi-pencil text-primary" />
                    </Button>
                    <Button variant="light" size="sm" onClick={() => handleDelete(c.id, c.name)}>
                      <i className="bi bi-trash text-danger" />
                    </Button>
                  </td>
                </tr>
              ))}
              {courses.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-muted py-4">
                    Chưa có khóa học nào
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>Đóng</Button>
      </Modal.Footer>
    </Modal>
  );
}
