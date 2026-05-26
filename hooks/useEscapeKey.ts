import { useEffect, useCallback } from 'react';

export function useEscapeKey(onEscape: () => void, enabled: boolean = true) {
  const handleEscape = useCallback(() => {
    if (enabled) {
      onEscape();
    }
  }, [onEscape, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleEscape();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handleEscape, enabled]);
}
