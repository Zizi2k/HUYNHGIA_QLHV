import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function AuthSessionHandler() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  useEffect(() => {
    const onUnauthorized = () => {
      logout();
      if (!window.location.pathname.startsWith('/login')) {
        navigate('/login', { replace: true });
      }
    };
    window.addEventListener('auth:unauthorized', onUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized);
  }, [logout, navigate]);

  return null;
}
