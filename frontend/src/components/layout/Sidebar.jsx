import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

function NavItem({ to, icon, label, end = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `app-sidebar-link${isActive ? ' active' : ''}`
      }
    >
      <i className={`bi bi-${icon}`} />
      <span>{label}</span>
    </NavLink>
  );
}

export default function Sidebar({ collapsed, mobileOpen, onNavigate }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isTeacherOrAdmin = user?.role === 'admin' || user?.role === 'teacher';

  const handleClick = () => {
    if (onNavigate) onNavigate();
  };

  return (
    <aside
      className={`app-sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`}
    >
      <div className="app-sidebar-brand">
        <img src="/logo-navbar.png" alt="LHG" className="app-sidebar-logo" />
        {!collapsed && <span className="app-sidebar-brand-text">LHG</span>}
      </div>

      <nav className="app-sidebar-nav" onClick={handleClick}>
        <div className="app-sidebar-section">
          {!collapsed && <div className="app-sidebar-section-label">Điều hướng chính</div>}
          <NavItem to="/" icon="speedometer2" label="Tổng quan" end />
          <NavItem to="/classes" icon="collection" label="Lớp học" />
          <NavItem to="/honor" icon="trophy" label="Bảng vinh danh" />
        </div>

        {isTeacherOrAdmin && (
          <div className="app-sidebar-section">
            {!collapsed && <div className="app-sidebar-section-label">Giảng dạy</div>}
            <NavItem to="/attendance" icon="calendar-check" label="Điểm danh" />
          </div>
        )}

        {isAdmin && (
          <div className="app-sidebar-section">
            {!collapsed && <div className="app-sidebar-section-label">Quản trị</div>}
            <NavItem to="/users" icon="people" label="Người dùng" />
            <NavItem to="/tuition" icon="cash-coin" label="Học phí" />
          </div>
        )}
      </nav>

      <div className="app-sidebar-footer">
        {!collapsed && (
          <div className="app-sidebar-footer-text">
            <small>Hệ thống học trực tuyến</small>
          </div>
        )}
      </div>
    </aside>
  );
}
