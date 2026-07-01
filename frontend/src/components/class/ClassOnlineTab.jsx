import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button, Card, Modal, Form, Alert, Spinner, Badge,
} from 'react-bootstrap';
import { onlineSessionService } from '../../services';
import { notifyDeleteResult } from '../../utils/deleteHelpers';
import LoadingOverlay from '../common/LoadingOverlay';
import { useSoftLoading } from '../../hooks/useSoftLoading';

const JITSI_DOMAIN = import.meta.env.VITE_JITSI_DOMAIN || 'meet.jit.si';

const loadedScripts = new Set();

function loadJitsiScript(domain) {
  const src = `https://${domain}/external_api.js`;
  if (loadedScripts.has(src) && window.JitsiMeetExternalAPI) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing && window.JitsiMeetExternalAPI) {
      loadedScripts.add(src);
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      loadedScripts.add(src);
      resolve();
    };
    script.onerror = () => reject(new Error('Không thể tải Jitsi'));
    document.body.appendChild(script);
  });
}

function JitsiRoom({ session, displayName, isHost, onLeave }) {
  const containerRef = useRef(null);
  const apiRef = useRef(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed = false;

    const start = async () => {
      try {
        await loadJitsiScript(JITSI_DOMAIN);
        if (disposed || !containerRef.current) return;

        const api = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, {
          roomName: session.room_code,
          parentNode: containerRef.current,
          width: '100%',
          height: '100%',
          userInfo: { displayName },
          configOverwrite: {
            prejoinPageEnabled: false,
            startWithAudioMuted: !isHost,
            startWithVideoMuted: false,
            disableDeepLinking: true,
            enableWelcomePage: false,
            enableClosePage: false,
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            TOOLBAR_BUTTONS: [
              'microphone', 'camera', 'desktop', 'fullscreen',
              'fodeviceselection', 'hangup', 'chat', 'raisehand', 'tileview',
            ],
          },
        });

        apiRef.current = api;
        api.addListener('readyToClose', () => onLeave());
        api.addListener('videoConferenceLeft', () => onLeave());
        setLoading(false);
      } catch (err) {
        setError(err.message || 'Không thể kết nối phòng học');
        setLoading(false);
      }
    };

    start();

    return () => {
      disposed = true;
      if (apiRef.current) {
        apiRef.current.dispose();
        apiRef.current = null;
      }
    };
  }, [session.room_code, displayName, isHost, onLeave]);

  return (
    <div className="jitsi-wrapper border rounded overflow-hidden bg-dark position-relative">
      {loading && (
        <div className="jitsi-loading">
          <Spinner animation="border" variant="light" />
          <span className="ms-2 text-white">Đang kết nối phòng học...</span>
        </div>
      )}
      {error && <Alert variant="danger" className="m-3">{error}</Alert>}
      <div ref={containerRef} className="jitsi-container" />
    </div>
  );
}

export default function ClassOnlineTab({
  classId, className, canManageClass, user,
}) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const { showInitialSpinner, showOverlay } = useSoftLoading(loading);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [joinedSession, setJoinedSession] = useState(null);

  const loadSessions = useCallback(() => {
    setLoading(true);
    onlineSessionService.getByClass(classId)
      .then((res) => setSessions(res.data))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [classId]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Vui lòng nhập tiêu đề buổi học');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const sessionTitle = title.trim();
      const res = await onlineSessionService.create({
        class_id: parseInt(classId, 10),
        title: sessionTitle,
      });
      setShowCreate(false);
      setTitle('');
      loadSessions();
      setJoinedSession({
        id: res.data.id,
        room_code: res.data.room_code,
        title: sessionTitle,
        is_active: true,
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tạo phòng học');
    } finally {
      setSaving(false);
    }
  };

  const handleEnd = async (sessionId) => {
    if (!window.confirm('Kết thúc phòng học online? Học viên sẽ không tham gia được nữa.')) return;
    try {
      await onlineSessionService.end(sessionId);
      if (joinedSession?.id === sessionId) setJoinedSession(null);
      loadSessions();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể kết thúc phòng học');
    }
  };

  const handleDelete = async (sessionId) => {
    if (!window.confirm('Xóa lịch sử phòng học này?')) return;
    try {
      const res = await onlineSessionService.delete(sessionId);
      if (notifyDeleteResult(res)) return;
      if (joinedSession?.id === sessionId) setJoinedSession(null);
      loadSessions();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể xóa');
    }
  };

  const activeSessions = sessions.filter((s) => s.is_active);
  const pastSessions = sessions.filter((s) => !s.is_active);

  if (showInitialSpinner) {
    return <div className="text-center py-4"><Spinner animation="border" /></div>;
  }

  return (
    <LoadingOverlay loading={showOverlay}>
    <>
      <Alert variant="info" className="small py-2">
        <i className="bi bi-camera-video me-1" />
        Phòng học online hỗ trợ <strong>video</strong>, <strong>micro</strong> và{' '}
        <strong>chia sẻ màn hình</strong>. Trình duyệt sẽ hỏi quyền camera/micro khi tham gia.
      </Alert>

      {canManageClass && (
        <Button className="mb-3" onClick={() => { setError(''); setShowCreate(true); }}>
          <i className="bi bi-plus-circle me-1" />
          Tạo phòng học online
        </Button>
      )}

      {joinedSession && (
        <Card className="mb-4 border-primary shadow-sm">
          <Card.Header className="d-flex justify-content-between align-items-center bg-primary text-white">
            <span>
              <i className="bi bi-broadcast me-1" />
              Đang tham gia: {joinedSession.title}
            </span>
            <Button
              variant="outline-light"
              size="sm"
              onClick={() => setJoinedSession(null)}
            >
              Rời phòng
            </Button>
          </Card.Header>
          <Card.Body className="p-0">
            <JitsiRoom
              session={joinedSession}
              displayName={user?.fullname || 'Học viên'}
              isHost={canManageClass}
              onLeave={() => setJoinedSession(null)}
            />
          </Card.Body>
        </Card>
      )}

      {activeSessions.length === 0 && !joinedSession ? (
        <Alert variant="light">
          {canManageClass
            ? 'Chưa có phòng học online đang mở. Bấm "Tạo phòng học online" để bắt đầu.'
            : 'Chưa có phòng học online. Vui lòng chờ giáo viên mở phòng.'}
        </Alert>
      ) : (
        activeSessions.map((s) => (
          <Card key={s.id} className="mb-3 border-0 shadow-sm">
            <Card.Body className="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div>
                <h6 className="mb-1">
                  {s.title}
                  <Badge bg="success" className="ms-2">Đang diễn ra</Badge>
                </h6>
                <div className="text-muted small">
                  Giáo viên: {s.host_name} · {new Date(s.created_at).toLocaleString('vi-VN')}
                </div>
              </div>
              <div className="d-flex gap-2">
                {joinedSession?.id !== s.id && (
                  <Button variant="primary" onClick={() => setJoinedSession(s)}>
                    <i className="bi bi-camera-video me-1" />
                    Tham gia
                  </Button>
                )}
                {canManageClass && (
                  <Button variant="outline-danger" onClick={() => handleEnd(s.id)}>
                    Kết thúc
                  </Button>
                )}
              </div>
            </Card.Body>
          </Card>
        ))
      )}

      {pastSessions.length > 0 && (
        <>
          <h6 className="text-muted mt-4 mb-3">Lịch sử phòng học</h6>
          {pastSessions.map((s) => (
            <Card key={s.id} className="mb-2 border-0 shadow-sm">
              <Card.Body className="d-flex justify-content-between align-items-center py-2">
                <div>
                  <span className="fw-semibold">{s.title}</span>
                  <Badge bg="secondary" className="ms-2">Đã kết thúc</Badge>
                  <div className="text-muted small">
                    {s.host_name} · {new Date(s.created_at).toLocaleString('vi-VN')}
                  </div>
                </div>
                {canManageClass && (
                  <Button variant="outline-danger" size="sm" onClick={() => handleDelete(s.id)}>
                    <i className="bi bi-trash" />
                  </Button>
                )}
              </Card.Body>
            </Card>
          ))}
        </>
      )}

      <Modal show={showCreate} onHide={() => setShowCreate(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Tạo phòng học online</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleCreate}>
          <Modal.Body>
            {error && <Alert variant="danger" className="py-2">{error}</Alert>}
            <Alert variant="light" className="small">
              Lớp: <strong>{className}</strong>. Phòng mới sẽ tự động kết thúc các phòng đang mở khác trong lớp.
            </Alert>
            <Form.Group>
              <Form.Label>Tiêu đề buổi học</Form.Label>
              <Form.Control
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Buổi 1 - Ôn tập HTML"
                required
                autoFocus
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Hủy</Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? <><Spinner size="sm" className="me-2" />Đang tạo...</> : 'Tạo và tham gia'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </>
    </LoadingOverlay>
  );
}
