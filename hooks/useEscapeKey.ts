import { useEffect, useRef } from 'react';

const escapeHandlers: Array<() => void> = [];
let listenerAttached = false;

function ensureListener() {
  if (listenerAttached || typeof document === 'undefined') return;
  listenerAttached = true;
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const handler = escapeHandlers[escapeHandlers.length - 1];
    if (handler) handler();
  });
}

export function useEscapeKey(onEscape: () => void, enabled: boolean = true) {
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!enabled) return;
    ensureListener();

    const handler = () => onEscapeRef.current();
    escapeHandlers.push(handler);

    return () => {
      const index = escapeHandlers.lastIndexOf(handler);
      if (index !== -1) escapeHandlers.splice(index, 1);
    };
  }, [enabled]);
}
