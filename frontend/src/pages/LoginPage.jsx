import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Card, Form, Button, Alert } from 'react-bootstrap';
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
      setError(err.response?.data?.message || 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page min-vh-100 d-flex align-items-center bg-light">
      <Container style={{ maxWidth: 420 }}>
        <Card className="shadow border-0">
          <Card.Body className="p-4">
            <div className="text-center mb-4">
              <img src="/logo-login.png" alt="LHG Logo" className="login-logo mb-3" />
              <h3 className="mt-2 fw-bold">LHG - Học trực tuyến</h3>
              <p className="text-muted">Mở khóa thế giới bằng ngôn ngữ</p>
            </div>

            {error && <Alert variant="danger">{error}</Alert>}

            <Form onSubmit={handleSubmit}>
              <Form.Group className="mb-3">
                <Form.Label>Tên đăng nhập</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="nguyenvana"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </Form.Group>
              <Form.Group className="mb-4">
                <Form.Label>Mã người dùng</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="HS001"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </Form.Group>
              <Button type="submit" variant="primary" className="w-100" disabled={loading}>
                {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
              </Button>
            </Form>

            <div className="mt-4 p-3 bg-light rounded small">
              <strong>Tài khoản dùng thử:</strong>
              <div>Quản trị viên: admin / ADMIN001</div>
              <div>Giáo viên: nguyenvangiao / GV001</div>
              <div>Học sinh: nguyenvana / HS001</div>
            </div>
          </Card.Body>
        </Card>
      </Container>
    </div>
  );
}
