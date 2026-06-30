import { useEffect, useState } from 'react';
import { Modal, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { classService } from '../../services';

const TYPE_LABELS = {
  lesson: 'bài giảng',
  assignment: 'bài tập',
  quiz: 'bài kiểm tra',
};

export default function ShareContentModal({
  show,
  onHide,
  contentType,
  contentTitle,
  sourceClassId,
  onShare,
}) {
  const [classes, setClasses] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!show) return;

    setSelected([]);
    setError('');
    setLoading(true);
    classService.getShareTargets(sourceClassId)
      .then((res) => setClasses(res.data || []))
      .catch((err) => {
        setClasses([]);
        setError(err.response?.data?.message || 'Không thể tải danh sách lớp');
      })
      .finally(() => setLoading(false));
  }, [show, sourceClassId]);

  const toggleClass = (classId) => {
    setSelected((prev) => (
      prev.includes(classId)
        ? prev.filter((id) => id !== classId)
        : [...prev, classId]
    ));
  };

  const handleShare = async () => {
    if (!selected.length) {
      setError('Vui lòng chọn ít nhất một lớp đích');
      return;
    }
    setSharing(true);
    setError('');
    try {
      await onShare(selected);
      onHide();
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể chia sẻ nội dung');
    } finally {
      setSharing(false);
    }
  };

  const typeLabel = TYPE_LABELS[contentType] || 'nội dung';

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Chia sẻ {typeLabel}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger" className="py-2">{error}</Alert>}
        <p className="text-muted small mb-3">
          Sao chép <strong className="text-break">{contentTitle}</strong> sang lớp khác.
          Hạn nộp, lịch hiển thị, tệp đính kèm và câu hỏi (nếu có) sẽ được giữ nguyên.
        </p>

        {loading ? (
          <div className="text-center py-3">
            <Spinner animation="border" size="sm" />
          </div>
        ) : classes.length === 0 ? (
          <Alert variant="light" className="mb-0">
            Không có lớp nào khác mà bạn được quản lý để chia sẻ.
          </Alert>
        ) : (
          <Form>
            <div className="d-flex flex-column gap-2" style={{ maxHeight: 280, overflowY: 'auto' }}>
              {classes.map((cls) => (
                <Form.Check
                  key={cls.id}
                  type="checkbox"
                  id={`share-class-${cls.id}`}
                  label={cls.code ? `${cls.name} (${cls.code})` : cls.name}
                  checked={selected.includes(cls.id)}
                  onChange={() => toggleClass(cls.id)}
                />
              ))}
            </div>
          </Form>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide} disabled={sharing}>
          Hủy
        </Button>
        <Button
          variant="primary"
          onClick={handleShare}
          disabled={sharing || loading || classes.length === 0}
        >
          {sharing ? 'Đang chia sẻ...' : 'Chia sẻ'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
