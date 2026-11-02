import { useState, useEffect } from 'react';
import { Dropdown, Badge } from 'react-bootstrap';
import { useNavigate, NavLink, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { auditService } from '../../services';
import { isSuperAdmin, scopeLabel, getAdminScope } from '../../utils/adminScope';
import UserAvatar from '../UserAvatar';
import ProfileModal from '../ProfileModal';
import NotificationBell from '../notifications/NotificationBell';

const NavItem = ({ to, children, end = false, onClick }) => (
  <NavLink to={to} end={end} onClick={onClick} className={({ isActive }) => `education-nav-link${isActive ? ' active' : ''}`}>
    {children}
  </NavLink>
);

export default function Topbar({ mobileOpen, onToggleMobile, onNavigate }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showProfile, setShowProfile] = useState(false);
  const [pendingDeletes, setPendingDeletes] = useState(0);
  const isAdmin = user?.role === 'admin';
  const isSuper = isSuperAdmin(user);
  const isTeacherOrAdmin = isAdmin || user?.role === 'teacher';
  const adminScope = getAdminScope(user);

  useEffect(() => {
    if (!isSuper) return undefined;
    const load = () => auditService.getPendingCount().then((res) => setPendingDeletes(res.data.count || 0)).catch(() => {});
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [isSuper]);

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <>
      <div className="education-contactbar">
        <div className="education-container education-contactbar-inner">
          <div className="education-contact-items">
            <span><i className="bi bi-mortarboard-fill" /> Trung tâm Ngoại ngữ - Tin học Huỳnh Gia</span>
            <span className="d-none d-md-inline"><i className="bi bi-stars" /> Học tập • Phát triển • Thành công</span>
          </div>
          <div className="education-contact-social d-none d-sm-flex">
            <i className="bi bi-facebook" /><i className="bi bi-youtube" /><i className="bi bi-chat-dots-fill" />
          </div>
        </div>
      </div>
      <header className="app-topbar education-navbar">
        <div className="education-container education-navbar-inner">
          <Link to="/" className="education-brand" onClick={onNavigate}>
            <img src="/logo-navbar.png" alt="Huỳnh Gia" />
            <div><strong>HUỲNH GIA</strong><span>FOR EDUCATION</span></div>
          </Link>
          <button type="button" className="education-menu-toggle d-lg-none" onClick={onToggleMobile} aria-label="Mở menu">
            <i className={`bi ${mobileOpen ? 'bi-x-lg' : 'bi-list'}`} />
          </button>
          <nav className={`education-nav${mobileOpen ? ' open' : ''}`}>
            <NavItem to="/" end onClick={onNavigate}>Trang chủ</NavItem>
            <NavItem to="/classes" onClick={onNavigate}>Lớp học</NavItem>
            <NavItem to="/promo" onClick={onNavigate}>Khóa học</NavItem>
            <NavItem to="/honor" onClick={onNavigate}>Vinh danh</NavItem>
            {isTeacherOrAdmin && <NavItem to="/attendance" onClick={onNavigate}>Điểm danh</NavItem>}
            {user?.role === 'student' && <NavItem to="/my-receipts" onClick={onNavigate}>Phiếu thu</NavItem>}
            {isAdmin && (
              <Dropdown className="education-manage-dropdown">
                <Dropdown.Toggle as="button" className="education-nav-link education-dropdown-toggle">Quản lý <i className="bi bi-chevron-down" /></Dropdown.Toggle>
                <Dropdown.Menu>
                  {isSuper && <Dropdown.Item as={Link} to="/admin-staff" onClick={onNavigate}><i className="bi bi-shield-lock" /> Phân quyền admin</Dropdown.Item>}
                  <Dropdown.Item as={Link} to="/users" onClick={onNavigate}><i className="bi bi-people" /> Người dùng</Dropdown.Item>
                  <Dropdown.Item as={Link} to="/students" onClick={onNavigate}><i className="bi bi-person-lines-fill" /> Học viên</Dropdown.Item>
                  <Dropdown.Item as={Link} to="/tuition" onClick={onNavigate}><i className="bi bi-cash-coin" /> Học phí</Dropdown.Item>
                  <Dropdown.Item as={Link} to="/fee-debts" onClick={onNavigate}><i className="bi bi-wallet2" /> Nợ phí</Dropdown.Item>
                  {isSuper && <Dropdown.Item as={Link} to="/audit" onClick={onNavigate}><i className="bi bi-journal-text" /> Nhật ký & duyệt</Dropdown.Item>}
                </Dropdown.Menu>
              </Dropdown>
            )}
          </nav>
          <div className="education-user-actions">
            {adminScope && <span className="education-scope-badge d-none d-xl-inline-flex">{scopeLabel(adminScope)}</span>}
            {isSuper && (
              <Link to="/audit" className="education-icon-btn position-relative" title="Yêu cầu xóa chờ duyệt">
                <i className="bi bi-shield-check" />
                {pendingDeletes > 0 && <Badge bg="danger" pill className="education-count-badge">{pendingDeletes > 99 ? '99+' : pendingDeletes}</Badge>}
              </Link>
            )}
            <NotificationBell />
            <Dropdown align="end">
              <Dropdown.Toggle as="button" className="education-user-button">
                <UserAvatar user={user} size={36} />
                <span className="d-none d-xl-inline">{user?.fullname}</span>
                <i className="bi bi-chevron-down d-none d-xl-inline" />
              </Dropdown.Toggle>
              <Dropdown.Menu className="app-dropdown-menu">
                <Dropdown.Item as={Link} to={`/profile/${user?.id}`}><i className="bi bi-person-badge me-2" />Trang cá nhân</Dropdown.Item>
                <Dropdown.Item onClick={() => setShowProfile(true)}><i className="bi bi-person-gear me-2" />Sửa thông tin cá nhân</Dropdown.Item>
                <Dropdown.Divider />
                <Dropdown.Item onClick={handleLogout} className="text-danger"><i className="bi bi-box-arrow-right me-2" />Đăng xuất</Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </div>
        </div>
      </header>
      <ProfileModal show={showProfile} onHide={() => setShowProfile(false)} />
    </>
  );
}
