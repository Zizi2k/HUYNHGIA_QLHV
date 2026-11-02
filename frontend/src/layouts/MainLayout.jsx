import { useState, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Spinner } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';
import { notificationService } from '../services';
import Topbar from '../components/layout/Topbar';
import ScrollRestoration from '../components/common/ScrollRestoration';
import LoginNotificationModal from '../components/notifications/LoginNotificationModal';

export default function MainLayout() {
  const { user, loading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loginNotifications, setLoginNotifications] = useState([]);
  const [showLoginNotifications, setShowLoginNotifications] = useState(false);

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
    return <div className="app-loading"><Spinner animation="border" variant="warning" /></div>;
  }
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className={`app-shell education-shell${mobileOpen ? ' mobile-nav-open' : ''}`}>
      <Topbar mobileOpen={mobileOpen} onToggleMobile={() => setMobileOpen((v) => !v)} onNavigate={() => setMobileOpen(false)} />
      <main className="app-main education-main">
        <div className="app-content education-content">
          <ScrollRestoration />
          <Outlet />
        </div>
      </main>
      <LoginNotificationModal
        show={showLoginNotifications}
        notifications={loginNotifications}
        onHide={() => setShowLoginNotifications(false)}
        onRead={() => setLoginNotifications([])}
      />
    </div>
  );
}
