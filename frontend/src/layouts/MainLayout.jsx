import { useState, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Spinner } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';

export default function MainLayout() {
  const { user, loading } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    document.body.classList.toggle('app-nav-locked', mobileOpen);
    return () => document.body.classList.remove('app-nav-locked');
  }, [mobileOpen]);

  if (loading) {
    return (
      <div className="app-loading">
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div
      className={`app-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}${mobileOpen ? ' mobile-nav-open' : ''}`}
    >
      <div
        className="app-sidebar-backdrop d-lg-none"
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />
      <Sidebar
        collapsed={sidebarCollapsed}
        mobileOpen={mobileOpen}
        onNavigate={() => setMobileOpen(false)}
      />
      <div className="app-main">
        <Topbar
          onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
          onToggleMobile={() => setMobileOpen((v) => !v)}
        />
        <div className="app-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
