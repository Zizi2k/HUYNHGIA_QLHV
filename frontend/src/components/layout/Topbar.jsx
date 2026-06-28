import { useState, useEffect } from 'react';
import { Dropdown, Badge, Form } from 'react-bootstrap';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCenter } from '../../context/CenterContext';
import { auditService } from '../../services';
import UserAvatar from '../UserAvatar';
import ProfileModal from '../ProfileModal';

export default function Topbar({ onToggleSidebar, onToggleMobile }) {
  const { user, logout } = useAuth();
  const { centers, activeCenter, setActiveCenter, isAdmin: isCenterAdmin } = useCenter() || {};
  const navigate = useNavigate();
  const [showProfile, setShowProfile] = useState(false);
  const [pendingDeletes, setPendingDeletes] = useState(0);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!isAdmin) return undefined;
    const load = () => {
      auditService.getPendingCount()
        .then((res) => setPendingDeletes(res.data.count || 0))
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [isAdmin, activeCenter?.id]);

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
          {isCenterAdmin && centers?.length > 1 && (
            <Form.Select
              size="sm"
              className="app-topbar-center-select"
              value={activeCenter?.id || ''}
              onChange={(e) => {
                const next = centers.find((c) => String(c.id) === e.target.value);
                if (next) setActiveCenter(next);
              }}
              style={{ width: 160 }}
              aria-label="Chọn trung tâm"
            >
              {centers.map((c) => (
                <option key={c.id} value={c.id}>{c.short_name}</option>
              ))}
            </Form.Select>
          )}
          {isAdmin && (
            <Link
              to="/audit"
              className="app-topbar-btn position-relative text-decoration-none"
              title="Yêu cầu xóa chờ duyệt"
            >
              <i className="bi bi-bell" />
              {pendingDeletes > 0 && (
                <Badge
                  bg="danger"
                  pill
                  className="position-absolute top-0 start-100 translate-middle"
                  style={{ fontSize: '0.65rem' }}
                >
                  {pendingDeletes > 99 ? '99+' : pendingDeletes}
                </Badge>
              )}
            </Link>
          )}
          <Dropdown align="end">
            <Dropdown.Toggle as="button" className="app-topbar-user">
              <UserAvatar user={user} size={36} />
              <div className="app-topbar-user-info d-none d-sm-block">
                <span className="app-topbar-user-name">{user?.fullname}</span>
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
