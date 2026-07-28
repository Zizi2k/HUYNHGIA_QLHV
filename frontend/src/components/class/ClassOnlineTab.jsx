import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button, Card, Modal, Form, Alert, Spinner, Badge,
} from 'react-bootstrap';
import { onlineSessionService } from '../../services';
import { notifyDeleteResult } from '../../utils/deleteHelpers';
import LoadingOverlay from '../common/LoadingOverlay';
import { useSoftLoading } from '../../hooks/useSoftLoading';
import { preserveScrollDuring } from '../../utils/scrollPreserve';

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

function disposeJitsiApi(api) {
  if (!api) return;
  try {
    api.removeAllListeners?.();
  } catch {
    // ignore
  }
  try {
    api.dispose();
  } catch {
    // ignore
  }
}

function JitsiRoom({
  session, displayName, userId, isHost, onLeave,
}) {
  const containerRef = useRef(null);
  const apiRef = useRef(null);
  const onLeaveRef = useRef(onLeave);
  const leftRef = useRef(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    onLeaveRef.current = onLeave;
  }, [onLeave]);

  useEffect(() => {
    let disposed = false;
    leftRef.current = false;

    const notifyLeft = () => {
      if (leftRef.current || disposed) return;
      leftRef.current = true;
      const api = apiRef.current;
      apiRef.current = null;
      disposeJitsiApi(api);
      onLeaveRef.current?.();
    };

    const start = async () => {
      try {
        await loadJitsiScript(JITSI_DOMAIN);
        if (disposed || !containerRef.current) return;

        // Unique identity each join so host can re-enter after leaving
        // (avoids Jitsi treating the old ghost session as still online).
        const joinToken = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const safeName = (displayName || 'Học viên').trim() || 'Học viên';
        const api = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, {
          roomName: session.room_code,
          parentNode: containerRef.current,
          width: '100%',
          height: '100%',
          userInfo: {
            displayName: safeName,
            email: `lhg-${userId || 'guest'}-${joinToken}@noreply.lhg.local`,
          },
          configOverwrite: {
            prejoinPageEnabled: false,
            startWithAudioMuted: !isHost,
            startWithVideoMuted: !isHost,
            disableDeepLinking: true,
            enableWelcomePage: false,
            enableClosePage: false,
            enableLobbyChat: false,
            requireDisplayName: false,
            enableInsecureRoomNameWarning: false,
            analytics: { disabled: true },
            // Host can rejoin without waiting for "moderator" lockouts
            p2p: { enabled: true },
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            MOBILE_APP_PROMO: false,
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
            TOOLBAR_BUTTONS: [
              'microphone', 'camera', 'desktop', 'fullscreen',
              'fodeviceselection', 'hangup', 'chat', 'raisehand', 'tileview',
            ],
          },
        });

        apiRef.current = api;
        // Hangup / close — only readyToClose to avoid double-leave races
        api.addListener('readyToClose', notifyLeft);
        setLoading(false);
      } catch (err) {
        if (!disposed) {
          setError(err.message || 'Không thể kết nối phòng học');
          setLoading(false);
        }
      }
    };

    start();

    return () => {
      disposed = true;
      const api = apiRef.current;
      apiRef.current = null;
      disposeJitsiApi(api);
    };
    // Intentionally omit onLeave — use ref to avoid remount loop
  }, [session.room_code, displayName, userId, isHost]);

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
  const [joinNonce, setJoinNonce] = useState(0);
  const [rejoining, setRejoining] = useState(false);
  const hasLoadedOnceRef = useRef(false);
  const leaveTimerRef = useRef(null);

  const loadSessions = useCallback(() => {
    const run = async () => {
      setLoading(true);
      try {
        const res = await onlineSessionService.getByClass(classId);
        setSessions(res.data);
        hasLoadedOnceRef.current = true;
      } catch {
        setSessions([]);
      } finally {
        setLoading(false);
      }
    };

    if (hasLoadedOnceRef.current) {
      preserveScrollDuring(run);
    } else {
      run();
    }
  }, [classId]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  useEffect(() => () => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
  }, []);

  const leaveRoom = useCallback(() => {
    setJoinedSession(null);
    setRejoining(true);
    // Allow Jitsi iframe / WebRTC to fully release before next join
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = setTimeout(() => {
      setJoinNonce((n) => n + 1);
      setRejoining(false);
    }, 800);
  }, []);

  const joinRoom = useCallback((session) => {
    if (rejoining) return;
    setJoinNonce((n) => n + 1);
    setJoinedSession(session);
  }, [rejoining]);

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
      joinRoom({
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
      if (joinedSession?.id === sessionId) leaveRoom();
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
      if (joinedSession?.id === sessionId) leaveRoom();
      loadSessions();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể xóa');
    }
  };

  const activeSessions = sessions.filter((s) => s.is_active);
  const pastSessions = sessions.filter((s) => !s.is_active);

  if (showInitialSpinner) {
    return (
      <LoadingOverlay loading minHeight={280}>
        <div style={{ minHeight: 280 }} aria-hidden="true" />
      </LoadingOverlay>
    );
  }

  return (
    <LoadingOverlay loading={showOverlay}>
    <>
      <Alert variant="info" className="small py-2">
        <i className="bi bi-camera-video me-1" />
        Phòng học online hỗ trợ <strong>video</strong>, <strong>micro</strong> và{' '}
        <strong>chia sẻ màn hình</strong>. Trình duyệt sẽ hỏi quyền camera/micro khi tham gia.
        Bạn có thể rời phòng rồi tham gia lại bằng cùng tài khoản LHG.
      </Alert>

      {canManageClass && (
        <Button className="mb-3" onClick={() => { setError(''); setShowCreate(true); }}>
          <i className="bi bi-plus-circle me-1" />
          Tạo phòng học online
        </Button>
      )}

      {rejoining && !joinedSession && (
        <Alert variant="secondary" className="py-2 small">
          <Spinner size="sm" className="me-2" />
          Đang giải phóng phòng cũ — vui lòng đợi giây lát rồi bấm Tham gia lại...
        </Alert>
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
              onClick={leaveRoom}
            >
              Rời phòng
            </Button>
          </Card.Header>
          <Card.Body className="p-0">
            <JitsiRoom
              key={`jitsi-${joinedSession.id}-${joinNonce}`}
              session={joinedSession}
              displayName={user?.fullname || 'Học viên'}
              userId={user?.id}
              isHost={canManageClass}
              onLeave={leaveRoom}
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
                  <Button
                    variant="primary"
                    disabled={rejoining}
                    onClick={() => joinRoom(s)}
                  >
                    <i className="bi bi-camera-video me-1" />
                    {rejoining ? 'Đang chờ...' : 'Tham gia'}
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
