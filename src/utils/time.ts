import type { Lang } from '../i18n';

/** Locale-appropriate compact clock text for a minute offset within a day. */
export function formatClock(minutes: number, lang: Lang): string {
  const value = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  const suffix = String(minute).padStart(2, '0');
  if (lang !== 'en') return `${String(hour).padStart(2, '0')}:${suffix}`;
  const half = hour < 12 ? 'AM' : 'PM';
  return `${hour % 12 || 12}:${suffix} ${half}`;
}

