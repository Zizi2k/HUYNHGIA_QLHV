import { useRef } from 'react';

/**
 * Distinguish first load (placeholder) vs reload (overlay) so scroll position is preserved.
 */
export function useSoftLoading(isLoading) {
  const hasLoadedOnce = useRef(false);
  if (!isLoading) {
    hasLoadedOnce.current = true;
  }
  return {
    showInitialSpinner: isLoading && !hasLoadedOnce.current,
    showOverlay: isLoading && hasLoadedOnce.current,
  };
}
