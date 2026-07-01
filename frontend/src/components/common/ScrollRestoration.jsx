import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const scrollPositions = new Map();

/**
 * Remember scroll per route; restore on back/forward and when revisiting a page.
 */
export default function ScrollRestoration() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const prevPathRef = useRef(null);

  useEffect(() => {
    const prevPath = prevPathRef.current;
    if (prevPath && prevPath !== location.pathname) {
      scrollPositions.set(prevPath, window.scrollY);
    }

    const saved = scrollPositions.get(location.pathname);
    if (navigationType === 'POP' && saved != null) {
      requestAnimationFrame(() => window.scrollTo(0, saved));
    } else if (saved != null) {
      requestAnimationFrame(() => window.scrollTo(0, saved));
    }

    prevPathRef.current = location.pathname;
  }, [location.pathname, navigationType]);

  return null;
}
