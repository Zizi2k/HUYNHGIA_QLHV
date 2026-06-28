import { useState } from 'react';
import { Dropdown } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import UserAvatar from '../UserAvatar';
import ProfileModal from '../ProfileModal';

const roleLabels = { admin: 'Quản trị viên', teacher: 'Giáo viên', student: 'Học sinh' };

export default function Topbar({ onToggleSidebar, onToggleMobile }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showProfile, setShowProfile] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      <header className="app-topbar">
        <div className="app-topbar-left">
          <button
            type="button"
            className="app-topbar-btn d-lg-none"
            onClick={onToggleMobile}
            aria-label="Mở menu"
          >
            <i className="bi bi-list" />
          </button>
          <button
            type="button"
            className="app-topbar-btn d-none d-lg-inline-flex"
            onClick={onToggleSidebar}
            aria-label="Thu gọn menu"
          >
            <i className="bi bi-layout-sidebar" />
          </button>
        </div>

        <div className="app-topbar-right">
          <Dropdown align="end">
            <Dropdown.Toggle as="button" className="app-topbar-user">
              <UserAvatar user={user} size={36} />
              <div className="app-topbar-user-info d-none d-sm-block">
                <span className="app-topbar-user-name">{user?.fullname}</span>
                <span className="app-topbar-user-role">{roleLabels[user?.role]}</span>
              </div>
              <i className="bi bi-chevron-down app-topbar-chevron d-none d-sm-inline" />
            </Dropdown.Toggle>
            <Dropdown.Menu className="app-dropdown-menu">
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
        </div>
      </header>

      <ProfileModal show={showProfile} onHide={() => setShowProfile(false)} />
    </>
  );
}
