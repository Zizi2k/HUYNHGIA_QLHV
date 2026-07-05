export function getScrollY() {
  return window.scrollY || document.documentElement.scrollTop || 0;
}

export function restoreScrollY(y) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: y, left: 0, behavior: 'instant' });
    });
  });
}

export async function preserveScrollDuring(fn) {
  const y = getScrollY();
  try {
    return await fn();
  } finally {
    restoreScrollY(y);
  }
}
