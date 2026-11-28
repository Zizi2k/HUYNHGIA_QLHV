import { useState, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Spinner } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';
import { notificationService } from '../services';
import Sidebar from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';
import ScrollRestoration from '../components/common/ScrollRestoration';
import LoginNotificationModal from '../components/notifications/LoginNotificationModal';
import './appearance.css';
import { accountThemes, isDarkTheme } from './themes';

const themes = accountThemes.map(([id]) => id);
const layouts = ['standard', 'compact', 'focused'];
function readAppearance(key) {
  try { return JSON.parse(localStorage.getItem(key)) || {}; }
  catch { return {}; }
}

export default function MainLayout() {
  const { user, loading } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loginNotifications, setLoginNotifications] = useState([]);
  const [showLoginNotifications, setShowLoginNotifications] = useState(false);
  const [preference, setPreference] = useState(null);
  const key = user?.id == null ? null : `hg-appearance:${user.id}`;
  const saved = key ? (preference?.key === key ? preference.value : readAppearance(key)) : {};
  const theme = themes.includes(saved.theme) ? saved.theme : 'blue';
  const layout = user?.role === 'admin' && layouts.includes(saved.layout) ? saved.layout : 'standard';
  function setAppearance(next) {
    if (!key) return;
    const value = { theme: themes.includes(next.theme) ? next.theme : theme,
      layout: user.role === 'admin' && layouts.includes(next.layout) ? next.layout : 'standard' };
    setPreference({ key, value });
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* keep changes for this session */ }
  }
  useEffect(() => {
    if (!key) return;
    const root = document.documentElement;
    root.dataset.hgTheme = theme;
    root.dataset.bsTheme = isDarkTheme(theme) ? 'dark' : 'light';
    return () => {
      delete root.dataset.hgTheme;
      delete root.dataset.bsTheme;
    };
  }, [key, theme]);

  useEffect(() => {
    document.body.classList.toggle('app-nav-locked', mobileOpen);
    return () => document.body.classList.remove('app-nav-locked');
  }, [mobileOpen]);

  useEffect(() => {
    if (!user || user.role !== 'student') return;
    notificationService.getUnread()
      .then((res) => {
        const items = res.data || [];
        if (items.length) {
          setLoginNotifications(items);
          setShowLoginNotifications(true);
        }
      })
      .catch(() => {});
  }, [user]);

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
      data-hg-layout={layout}
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
          appearance={{ theme, layout }}
          onAppearanceChange={setAppearance}
          onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
          onToggleMobile={() => setMobileOpen((v) => !v)}
        />
        <div className="app-content">
          <ScrollRestoration />
          <Outlet />
        </div>
      </div>

      <LoginNotificationModal
        show={showLoginNotifications}
        notifications={loginNotifications}
        onHide={() => setShowLoginNotifications(false)}
        onRead={() => setLoginNotifications([])}
      />
    </div>
  );
}
