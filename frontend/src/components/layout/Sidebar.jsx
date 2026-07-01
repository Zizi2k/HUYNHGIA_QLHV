import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { isSuperAdmin } from '../../utils/adminScope';

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
  const isSuper = isSuperAdmin(user);
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
          {user?.role === 'student' && (
            <NavItem to="/my-receipts" icon="receipt" label="Phiếu thu" />
          )}
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
            {isSuper && <NavItem to="/admin-staff" icon="shield-lock" label="Phân quyền admin" />}
            {isAdmin && <NavItem to="/users" icon="people" label="Người dùng" />}
            <NavItem to="/students" icon="person-lines-fill" label="Quản lý học viên" />
            {isSuper && <NavItem to="/audit" icon="journal-text" label="Nhật ký & duyệt" />}
            <NavItem to="/tuition" icon="cash-coin" label="Học phí" />
            <NavItem to="/fee-debts" icon="wallet2" label="Nợ phí" />
          </div>
        )}
      </nav>

      <div className="app-sidebar-footer">
        {!collapsed && (
          <div className="app-sidebar-promo" aria-hidden="true">
            <p className="app-sidebar-promo-tagline">
              Learn to develop
              <br />
              your future.
            </p>
            <div className="app-sidebar-promo-visual">
              <div className="app-sidebar-promo-monitor">
                <div className="app-sidebar-promo-screen">
                  <span className="app-sidebar-promo-screen-cap">
                    <i className="bi bi-mortarboard-fill" />
                  </span>
                  <span className="app-sidebar-promo-screen-bars" />
                </div>
                <div className="app-sidebar-promo-stand" />
              </div>
              <div className="app-sidebar-promo-cap-front">
                <i className="bi bi-mortarboard-fill" />
              </div>
              <div className="app-sidebar-promo-floor" />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
