import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Button, Alert, Modal } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [showCode, setShowCode] = useState(false);
  const [recovery, setRecovery] = useState(null);

  async function recoverCode(event) {
    event.preventDefault();
    if (!recovery || recovery.busy || recovery.sent || !recovery.username.trim()) return;
    setRecovery({ ...recovery, busy: true, message: '' });
    try {
      const { data } = await api.post('/auth/forgot-code', { username: recovery.username.trim() });
      setRecovery({ ...recovery, busy: false, sent: true, message: data.message });
    } catch (err) {
      setRecovery({ ...recovery, busy: false, message: err.response?.data?.message || 'Không gửi được yêu cầu. Vui lòng liên hệ trung tâm.' });
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, code);
      navigate('/');
    } catch (err) {
      const serverMsg = err.response?.data?.message;
      const status = err.response?.status;
      if (!err.response) {
        setError('Không kết nối được máy chủ. Vui lòng thử lại sau vài giây.');
      } else if (status === 502 || status === 503 || status === 504) {
        setError('Máy chủ đang bận hoặc chưa sẵn sàng. Vui lòng thử lại sau 1–2 phút.');
      } else if (serverMsg) {
        setError(serverMsg);
      } else {
        setError('Đăng nhập thất bại');
      }
    } finally {
      setLoading(false);
    }
  };

  // return (
  //   <div className="login-page">
  //     <div className="login-card">
  //       <aside className="login-card-visual" aria-hidden="true">
  //         <div className="login-visual-bg">
  //           <span className="login-shape login-shape-1" />
  //           <span className="login-shape login-shape-2" />
  //           <span className="login-shape login-shape-3" />
  //         </div>
  //         <div className="login-visual-tab">ĐĂNG NHẬP</div>
  //         <div className="login-visual-brand">
  //           <img src="/logo-navbar.png" alt="" className="login-visual-logo" />
  //           <span className="login-visual-name">LHG</span>
  //         </div>
  //       </aside>

  //       <section className="login-card-form">
  //         <div className="login-form-avatar">
  //           <i className="bi bi-person-fill" aria-hidden />
  //         </div>
  //         <h1 className="login-form-heading">ĐĂNG NHẬP</h1>

  //         {error && <Alert variant="danger" className="login-alert">{error}</Alert>}

  //         <Form onSubmit={handleSubmit} className="login-form">
  //           <Form.Group className="login-field-line">
  //             <div className="login-line-input">
  //               <i className="bi bi-person login-line-icon" aria-hidden />
  //               <Form.Control
  //                 type="text"
  //                 placeholder="Tên đăng nhập"
  //                 value={username}
  //                 onChange={(e) => setUsername(e.target.value)}
  //                 className="login-line-control"
  //                 autoComplete="username"
  //                 required
  //               />
  //             </div>
  //           </Form.Group>

  //           <Form.Group className="login-field-line">
  //             <div className="login-line-input">
  //               <i className="bi bi-shield-lock login-line-icon" aria-hidden />
  //               <Form.Control
  //                 type="text"
  //                 placeholder="Mã người dùng"
  //                 value={code}
  //                 onChange={(e) => setCode(e.target.value)}
  //                 className="login-line-control"
  //                 autoComplete="off"
  //                 required
  //               />
  //             </div>
  //           </Form.Group>

  //           <div className="login-form-actions">
  //             <Button type="submit" className="login-pill-btn" disabled={loading}>
  //               {loading ? (
  //                 <>
  //                   <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden />
  //                   ĐANG XỬ LÝ...
  //                 </>
  //               ) : (
  //                 'ĐĂNG NHẬP'
  //               )}
  //             </Button>
  //           </div>
  //         </Form>
  //       </section>
  //     </div>
  //   </div>
  // );

  return (
  <div className="login-page">
    <div className="login-circle">

      <div className="login-logo">
        <img src="/logo-navbar.png" alt="Huỳnh Gia" />
      </div>

      <h1 className="login-title">Đăng nhập</h1>

      <p className="login-subtitle">
        Đăng nhập vào tài khoản của bạn
      </p>

      {error && (
        <Alert variant="danger" className="login-alert">
          {error}
        </Alert>
      )}

      <Form onSubmit={handleSubmit} className="login-form">

       <Form.Group className="login-input-box">
  <i className="bi bi-person-fill"></i>

  <Form.Control
    type="text"
    placeholder="Tên đăng nhập"
    value={username}
    onChange={(e) => setUsername(e.target.value)}
    autoComplete="username"
    required
  />
</Form.Group>

       <Form.Group className="login-input-box">
  <i className="bi bi-lock-fill"></i>

  <Form.Control
    type={showCode ? "text" : "password"}
    placeholder="Mã người dùng"
    value={code}
    onChange={(e) => setCode(e.target.value)}
    autoComplete="off"
    required
  />

  <button
    type="button"
    className="login-eye-btn"
    onClick={() => setShowCode(!showCode)}
    aria-label={showCode ? "Ẩn mã người dùng" : "Hiện mã người dùng"}
  >
    <i
      className={
        showCode
          ? "bi bi-eye-slash"
          : "bi bi-eye"
      }
    ></i>
  </button>
</Form.Group>

        <div className="login-options">

          <label>
            <input type="checkbox" />
            <span> Ghi nhớ tôi</span>
          </label>

          <button type="button" className="forgot-code border-0 bg-transparent p-0"
            onClick={() => setRecovery({ username: username.trim(), busy: false, sent: false, message: '' })}>
            Quên mã?
          </button>

        </div>

        <Button
          type="submit"
          className="login-submit"
          disabled={loading}
        >
          {loading ? (
            <>
              <span
                className="spinner-border spinner-border-sm me-2"
                aria-hidden
              />
              ĐANG XỬ LÝ...
            </>
          ) : (
            'ĐĂNG NHẬP'
          )}
        </Button>

      </Form>

      <Modal centered show={recovery !== null} onHide={() => { if (!recovery?.busy) setRecovery(null); }}>
        <Form onSubmit={recoverCode}>
          <Modal.Header closeButton={!recovery?.busy}><Modal.Title>Quên mã đăng nhập</Modal.Title></Modal.Header>
          <Modal.Body>
            {recovery?.message && <Alert variant={recovery.sent ? 'success' : 'danger'}>{recovery.message}</Alert>}
            {!recovery?.sent && <>
              <p>Nhập tên đăng nhập để gửi yêu cầu cấp lại mã. Quản trị viên sẽ xác minh danh tính trước khi hỗ trợ.</p>
              <Form.Group controlId="recover-login-username">
                <Form.Label>Tên đăng nhập</Form.Label>
                <Form.Control required autoFocus autoComplete="username" maxLength={100} disabled={recovery?.busy}
                  value={recovery?.username || ''} onChange={(e) => setRecovery({ ...recovery, username: e.target.value })} />
              </Form.Group>
            </>}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" disabled={recovery?.busy} onClick={() => setRecovery(null)}>Đóng</Button>
            {!recovery?.sent && <Button type="submit" disabled={recovery?.busy}>{recovery?.busy ? 'Đang gửi…' : 'Gửi yêu cầu'}</Button>}
          </Modal.Footer>
        </Form>
      </Modal>

      <div className="login-footer">
        Trung tâm Ngoại ngữ - Tin học
        <strong> Huỳnh Gia</strong>
      </div>

    </div>
  </div>
);
}
