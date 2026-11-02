import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { isSuperAdmin } from '../../utils/adminScope';

function NavItem({ to, icon, label, end = false }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `app-sidebar-link${isActive ? ' active' : ''}`}>
      <i className={`bi bi-${icon}`} />
      <span>{label}</span>
    </NavLink>
  );
}

export default function Sidebar({ collapsed, mobileOpen, onNavigate }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isSuper = isSuperAdmin(user);
  const isTeacherOrAdmin = user?.role === 'admin' || user?.role === 'teacher';
  const handleClick = () => onNavigate?.();

  return (
    <aside className={`app-sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`}>
      <div className="app-sidebar-brand">
        <img src="/logo-navbar.png" alt="Huỳnh Gia" className="app-sidebar-logo" />
        {!collapsed && (
          <div className="app-sidebar-brand-copy">
            <strong>HUỲNH GIA</strong>
            <span>Education Center</span>
          </div>
        )}
      </div>
      <nav className="app-sidebar-nav" onClick={handleClick}>
        <div className="app-sidebar-section">
          {!collapsed && <div className="app-sidebar-section-label">HỌC TẬP</div>}
          <NavItem to="/" icon="house-door" label="Tổng quan" end />
          <NavItem to="/classes" icon="book" label="Lớp học" />
          <NavItem to="/promo" icon="mortarboard" label="Khóa học" />
          <NavItem to="/honor" icon="trophy" label="Bảng vinh danh" />
          {user?.role === 'student' && <NavItem to="/my-receipts" icon="receipt" label="Phiếu thu" />}
        </div>
        {isTeacherOrAdmin && (
          <div className="app-sidebar-section">
            {!collapsed && <div className="app-sidebar-section-label">GIẢNG DẠY</div>}
            <NavItem to="/attendance" icon="calendar-check" label="Điểm danh" />
          </div>
        )}
        {isAdmin && (
          <div className="app-sidebar-section">
            {!collapsed && <div className="app-sidebar-section-label">QUẢN TRỊ</div>}
            {isSuper && <NavItem to="/admin-staff" icon="shield-lock" label="Phân quyền admin" />}
            <NavItem to="/users" icon="people" label="Người dùng" />
            <NavItem to="/students" icon="person-lines-fill" label="Quản lý học viên" />
            {isSuper && <NavItem to="/audit" icon="journal-text" label="Nhật ký & duyệt" />}
            <NavItem to="/tuition" icon="cash-coin" label="Học phí" />
            <NavItem to="/fee-debts" icon="wallet2" label="Nợ phí" />
          </div>
        )}
      </nav>
      {!collapsed && (
        <div className="app-sidebar-footer">
          <div className="app-sidebar-education-note">
            <span className="app-sidebar-note-icon"><i className="bi bi-lightbulb" /></span>
            <div><strong>Learn • Practice • Grow</strong><small>Học tập mỗi ngày cùng Huỳnh Gia</small></div>
          </div>
        </div>
      )}
    </aside>
  );
}
