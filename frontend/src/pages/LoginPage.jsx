import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Button, Alert } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [showCode, setShowCode] = useState(false);

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

          <span className="forgot-code">
            Quên mã?
          </span>

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

      <div className="login-footer">
        Trung tâm Ngoại ngữ - Tin học
        <strong> Huỳnh Gia</strong>
      </div>

    </div>
  </div>
);
}
