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

  return (
    <div className="login-page">
      <div className="login-page-inner">
        <div className="login-brand-panel">
          <img src="/logo-login.png" alt="LHG Logo" className="login-brand-logo" />
          <h1 className="login-brand-title">LHG & EGC</h1>
          <p className="login-brand-tagline">Hệ thống học trực tuyến</p>
          <p className="login-brand-desc">Quản lý hai trung tâm LHG và EGC trên một nền tảng — lớp học, bài tập, học phí và điểm danh tách biệt theo trung tâm.</p>
        </div>

        <div className="login-form-panel">
          <div className="login-form-card">
            <h2 className="login-form-title">Đăng nhập</h2>
            <p className="login-form-subtitle">Nhập tên đăng nhập và mã người dùng để tiếp tục.</p>

            {error && <Alert variant="danger" className="login-alert">{error}</Alert>}

            <Form onSubmit={handleSubmit}>
              <Form.Group className="mb-3">
                <Form.Label className="login-label">Tên đăng nhập</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="nguyenvana"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="login-input"
                  required
                />
              </Form.Group>
              <Form.Group className="mb-4">
                <Form.Label className="login-label">Mã người dùng</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="HS001"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="login-input"
                  required
                />
              </Form.Group>
              <Button type="submit" variant="primary" className="login-submit-btn" disabled={loading}>
                {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
              </Button>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
}
