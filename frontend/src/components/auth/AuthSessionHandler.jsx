import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services';

export default function AuthSessionHandler() {
  const navigate = useNavigate();
  const { logout, updateUser } = useAuth();
  const checkingRef = useRef(false);

  useEffect(() => {
    const onUnauthorized = () => {
      logout();
      if (!window.location.pathname.startsWith('/login')) {
        navigate('/login', { replace: true });
      }
    };

    const onCheckSession = async () => {
      if (checkingRef.current) return;
      const token = localStorage.getItem('token');
      if (!token) {
        onUnauthorized();
        return;
      }

      checkingRef.current = true;
      try {
        const res = await authService.getMe();
        updateUser(res.data);
      } catch (err) {
        if (err.response?.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          onUnauthorized();
        }
      } finally {
        checkingRef.current = false;
      }
    };

    window.addEventListener('auth:unauthorized', onUnauthorized);
    window.addEventListener('auth:check-session', onCheckSession);
    return () => {
      window.removeEventListener('auth:unauthorized', onUnauthorized);
      window.removeEventListener('auth:check-session', onCheckSession);
    };
  }, [logout, navigate, updateUser]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!localStorage.getItem('token')) return;
      window.dispatchEvent(new CustomEvent('auth:check-session'));
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  return null;
}
