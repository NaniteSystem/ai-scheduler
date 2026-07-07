import { useEffect, useState } from 'react';
import { useStore } from '../store';

const query = '(prefers-color-scheme: dark)';

/** Resolves the stored theme preference ('system' follows the OS live). */
export function useEffectiveTheme(): 'light' | 'dark' {
  const theme = useStore((s) => s.theme);
  const [sysDark, setSysDark] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setSysDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return theme === 'system' ? (sysDark ? 'dark' : 'light') : theme;
}
