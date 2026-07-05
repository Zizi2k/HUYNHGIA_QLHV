import { useEffect, useState } from 'react';
import {
  Modal, Form, Alert, Spinner, Button, Badge,
} from 'react-bootstrap';
import { assignmentService, quizService } from '../../services';

export default function StudentAccessModal({
  show, onHide, contentType, contentId, contentTitle, onSaved,
}) {
  const service = contentType === 'quiz' ? quizService : assignmentService;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('all');
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!show || !contentId) return;
    setLoading(true);
    setError('');
    setSearch('');
    service.getStudentAccess(contentId)
      .then((res) => {
        setMode(res.data.mode || 'all');
        setStudents(res.data.students || []);
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Không thể tải danh sách học sinh');
        setStudents([]);
      })
      .finally(() => setLoading(false));
  }, [show, contentId, contentType]);

  const filteredStudents = students.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return s.fullname?.toLowerCase().includes(q) || s.code?.toLowerCase().includes(q);
  });

  const selectedCount = students.filter((s) => s.selected).length;

  const toggleStudent = (id) => {
    setStudents((prev) => prev.map((s) => (
      s.id === id ? { ...s, selected: !s.selected } : s
    )));
  };

  const selectAll = () => {
    setStudents((prev) => prev.map((s) => ({ ...s, selected: true })));
  };

  const clearAll = () => {
    setStudents((prev) => prev.map((s) => ({ ...s, selected: false })));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const studentIds = students.filter((s) => s.selected).map((s) => s.id);
      const res = await service.setStudentAccess(contentId, {
        mode,
        student_ids: studentIds,
      });
      onSaved?.();
      onHide();
      alert(res.data?.message || 'Đã lưu phân quyền học sinh');
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể lưu phân quyền');
    } finally {
      setSaving(false);
    }
  };

  const label = contentType === 'quiz' ? 'bài kiểm tra' : 'bài tập';

  return (
    <Modal show={show} onHide={onHide} size="lg" scrollable>
      <Modal.Header closeButton>
        <Modal.Title>Phân quyền học sinh — {contentTitle}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger" className="py-2">{error}</Alert>}

        <Form.Group className="mb-3">
          <Form.Check
            type="radio"
            id="access-all"
            name="access-mode"
            label="Tất cả học sinh trong lớp"
            checked={mode === 'all'}
            onChange={() => setMode('all')}
          />
          <Form.Check
            type="radio"
            id="access-selected"
            name="access-mode"
            label="Chỉ học sinh được chọn"
            checked={mode === 'selected'}
            onChange={() => setMode('selected')}
            className="mt-2"
          />
        </Form.Group>

        {mode === 'selected' && (
          <>
            <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
              <Form.Control
                type="search"
                size="sm"
                placeholder="Tìm học sinh..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ maxWidth: 240 }}
              />
              <Button variant="outline-secondary" size="sm" onClick={selectAll}>Chọn tất cả</Button>
              <Button variant="outline-secondary" size="sm" onClick={clearAll}>Bỏ chọn</Button>
              <Badge bg="primary">{selectedCount} đã chọn</Badge>
            </div>

            {loading ? (
              <div className="text-center py-4"><Spinner animation="border" /></div>
            ) : students.length === 0 ? (
              <Alert variant="light" className="mb-0">Lớp chưa có học sinh.</Alert>
            ) : (
              <div className="border rounded" style={{ maxHeight: 320, overflowY: 'auto' }}>
                {filteredStudents.map((s) => (
                  <Form.Check
                    key={s.id}
                    type="checkbox"
                    id={`student-access-${contentType}-${s.id}`}
                    className="px-3 py-2 border-bottom mb-0"
                    label={(
                      <span>
                        <strong>{s.fullname}</strong>
                        <span className="text-muted ms-2 small">{s.code}</span>
                      </span>
                    )}
                    checked={!!s.selected}
                    onChange={() => toggleStudent(s.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {mode === 'all' && (
          <Alert variant="info" className="mb-0 small py-2">
            Mọi học sinh trong lớp đều nhìn thấy và làm được {label} này (nếu không bị ẩn).
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>Hủy</Button>
        <Button variant="primary" onClick={handleSave} disabled={saving || loading}>
          {saving ? 'Đang lưu...' : 'Lưu'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
