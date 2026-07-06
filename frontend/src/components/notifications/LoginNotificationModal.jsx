import { Modal, Button, Alert } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { notificationService } from '../../services';

export default function LoginNotificationModal({ show, notifications, onHide, onRead }) {
  if (!notifications?.length) return null;

  const handleReadAll = async () => {
    try {
      await notificationService.markAllRead();
      onRead?.();
      onHide();
    } catch {
      onHide();
    }
  };

  const handleReadOne = async (id) => {
    try {
      await notificationService.markRead(id);
      onRead?.();
    } catch {
      // ignore
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered scrollable>
      <Modal.Header closeButton className="border-0 pb-0">
        <Modal.Title className="d-flex align-items-center gap-2">
          <i className="bi bi-bell-fill text-warning" />
          Bạn có {notifications.length} thông báo mới
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Alert variant="info" className="py-2 small mb-3">
          Giáo viên đã gửi nhắc nhở về các bài chưa hoàn thành. Vui lòng kiểm tra và làm bài sớm.
        </Alert>
        {notifications.map((n) => (
          <div key={n.id} className="border rounded-3 p-3 mb-2 bg-light">
            <div className="fw-semibold mb-1">{n.title}</div>
            <pre className="small mb-2 text-muted" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
              {n.body}
            </pre>
            {n.link_path && (
              <Button
                as={Link}
                to={n.link_path}
                variant="primary"
                size="sm"
                onClick={() => handleReadOne(n.id)}
              >
                Vào lớp học
              </Button>
            )}
          </div>
        ))}
      </Modal.Body>
      <Modal.Footer className="border-0">
        <Button variant="outline-secondary" onClick={onHide}>
          Để sau
        </Button>
        <Button variant="primary" onClick={handleReadAll}>
          Đã hiểu
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
