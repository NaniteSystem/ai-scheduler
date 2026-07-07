import { useEffect, useRef } from 'react';

/**
 * LIFO stack of hardware-back handlers. Every open layer (modal, drawer,
 * picker, wizard step) registers a handler while it is visible; the Android
 * back button closes the most recently opened layer first. Only when the
 * stack is empty does App.tsx fall through to view-history navigation.
 */
type Handler = () => void;
const stack: Handler[] = [];

/** Invoke the topmost registered handler. Returns false when none is open. */
export function popHardwareBack(): boolean {
  const h = stack[stack.length - 1];
  if (!h) return false;
  h();
  return true;
}

/** While `active`, hardware Back triggers `onBack` (closing this layer) instead of navigating. */
export function useBackClose(active: boolean, onBack: Handler) {
  const ref = useRef(onBack);
  ref.current = onBack;
  useEffect(() => {
    if (!active) return;
    const h = () => ref.current();
    stack.push(h);
    return () => {
      const i = stack.lastIndexOf(h);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}
