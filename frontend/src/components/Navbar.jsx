import { useState } from 'react';
import { Container, Navbar as BSNavbar, Nav, Dropdown } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import UserAvatar from './UserAvatar';
import ProfileModal from './ProfileModal';

const roleLabels = { admin: 'Quản trị viên', teacher: 'Giáo viên', student: 'Học sinh' };

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showProfile, setShowProfile] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      <BSNavbar bg="primary" variant="dark" expand="lg" className="shadow-sm">
        <Container>
          <BSNavbar.Brand as={Link} to="/" className="d-flex align-items-center gap-2">
            <img src="/logo-navbar.png" alt="LHG Logo" className="app-logo" />
            <span className="d-none d-md-inline">LHG</span>
          </BSNavbar.Brand>
          <BSNavbar.Toggle aria-controls="nav" />
          <BSNavbar.Collapse id="nav">
            <Nav className="me-auto">
              <Nav.Link as={Link} to="/">Tổng quan</Nav.Link>
              <Nav.Link as={Link} to="/classes">Lớp học</Nav.Link>
              {user?.role === 'admin' && (
                <Nav.Link as={Link} to="/users">Quản lý người dùng</Nav.Link>
              )}
              {(user?.role === 'admin' || user?.role === 'teacher') && (
                <Nav.Link as={Link} to="/attendance">Điểm danh</Nav.Link>
              )}
              <Nav.Link as={Link} to="/honor">Bảng vinh danh</Nav.Link>
            </Nav>
            <Nav className="align-items-center">
              <Dropdown align="end">
                <Dropdown.Toggle
                  as="button"
                  className="btn btn-link text-decoration-none text-white d-flex align-items-center gap-2 border-0 p-0"
                >
                  <UserAvatar user={user} size={38} />
                  <div className="text-start d-none d-sm-block">
                    <div className="small fw-semibold lh-1">{user?.fullname}</div>
                    <div className="text-white-50" style={{ fontSize: '0.75rem' }}>
                      {roleLabels[user?.role]}
                    </div>
                  </div>
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  <Dropdown.Item onClick={() => setShowProfile(true)}>
                    <i className="bi bi-person-gear me-2" />
                    Sửa thông tin cá nhân
                  </Dropdown.Item>
                  <Dropdown.Divider />
                  <Dropdown.Item onClick={handleLogout} className="text-danger">
                    <i className="bi bi-box-arrow-right me-2" />
                    Đăng xuất
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
            </Nav>
          </BSNavbar.Collapse>
        </Container>
      </BSNavbar>

      <ProfileModal show={showProfile} onHide={() => setShowProfile(false)} />
    </>
  );
}
