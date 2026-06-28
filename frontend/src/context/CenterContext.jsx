import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { centerService } from '../services';

const STORAGE_KEY = 'activeCenterId';

const CenterContext = createContext(null);

export function CenterProvider({ children }) {
  const { user } = useAuth();
  const [centers, setCenters] = useState([]);
  const [activeCenter, setActiveCenterState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [centerKey, setCenterKey] = useState(0);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!isAdmin) {
      setCenters([]);
      setActiveCenterState(null);
      return;
    }

    setLoading(true);
    centerService.getAll()
      .then((res) => {
        const list = res.data || [];
        setCenters(list);
        const savedId = localStorage.getItem(STORAGE_KEY);
        const saved = list.find((c) => String(c.id) === savedId);
        const initial = saved || list.find((c) => c.code === 'lhg') || list[0] || null;
        if (initial) {
          setActiveCenterState(initial);
          localStorage.setItem(STORAGE_KEY, String(initial.id));
        }
      })
      .finally(() => setLoading(false));
  }, [isAdmin]);

  const setActiveCenter = useCallback((center) => {
    if (!center) return;
    setActiveCenterState(center);
    localStorage.setItem(STORAGE_KEY, String(center.id));
    setCenterKey((k) => k + 1);
  }, []);

  return (
    <CenterContext.Provider value={{
      centers,
      activeCenter,
      setActiveCenter,
      centerKey,
      loading,
      isAdmin,
    }}>
      {children}
    </CenterContext.Provider>
  );
}

export const useCenter = () => useContext(CenterContext);
