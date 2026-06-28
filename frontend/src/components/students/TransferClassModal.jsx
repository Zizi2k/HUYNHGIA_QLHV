import { useEffect, useMemo, useState } from 'react';
import { Modal, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { studentService } from '../../services';
import { subjectLabel } from './studentConstants';

export default function TransferClassModal({
  show,
  onHide,
  student,
  classes,
  onSuccess,
}) {
  const [targetClassId, setTargetClassId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const availableClasses = useMemo(() => {
    if (!student) return [];
    return classes.filter(
      (c) => c.subject === student.subject && Number(c.id) !== Number(student.class_id),
    );
  }, [classes, student]);

  useEffect(() => {
    if (!show) return;
    setError('');
    setTargetClassId('');
  }, [show, student]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!targetClassId) {
      setError('Vui lòng chọn lớp đích');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await studentService.transferClass(student.id, {
        class_id: parseInt(targetClassId, 10),
      });
      alert(res.data.message);
      onSuccess();
      onHide();
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể chuyển lớp');
    } finally {
      setSaving(false);
    }
  };

  if (!student) return null;

  const currentClassName = student.linked_class_name || student.class_label || '—';

  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Chuyển lớp học viên</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          {error && <Alert variant="danger" className="py-2">{error}</Alert>}

          <Alert variant="light" className="border small">
            <div><strong>Học viên:</strong> {student.fullname} ({student.student_code})</div>
            <div><strong>Môn:</strong> {student.subject_label || subjectLabel(student.subject)}</div>
            <div><strong>Lớp hiện tại:</strong> {currentClassName}</div>
          </Alert>

          {availableClasses.length === 0 ? (
            <Alert variant="warning" className="mb-0">
              Không có lớp khác cùng môn để chuyển. Tạo thêm lớp hoặc cập nhật môn cho lớp.
            </Alert>
          ) : (
            <Form.Group>
              <Form.Label>Chuyển sang lớp <span className="text-danger">*</span></Form.Label>
              <Form.Select
                value={targetClassId}
                onChange={(e) => setTargetClassId(e.target.value)}
                required
              >
                <option value="">— Chọn lớp đích —</option>
                {availableClasses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Form.Select>
              <Form.Text className="text-muted">
                Học viên sẽ rời lớp cũ và được thêm vào lớp mới. Hồ sơ học phí cập nhật theo lớp mới.
              </Form.Text>
            </Form.Group>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide}>Hủy</Button>
          <Button
            type="submit"
            variant="primary"
            disabled={saving || availableClasses.length === 0}
          >
            {saving ? <><Spinner size="sm" className="me-2" />Đang chuyển...</> : 'Xác nhận chuyển lớp'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
