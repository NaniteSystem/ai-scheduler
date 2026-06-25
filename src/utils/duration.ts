// Format an amount of effort (in hours) as days + hours.
// < 24h  → "5h" / "2.5h"
// >= 24h → "1d 5h" / "21d 16h" / "1d" (when remainder rounds to 0)
export function fmtHours(hours: number): string {
  const h = Math.round((hours || 0) * 10) / 10;
  if (h < 24) return `${h % 1 === 0 ? h : h.toFixed(1)}h`;
  const days = Math.floor(h / 24);
  const rem = Math.round(h % 24);
  return rem > 0 ? `${days}d ${rem}h` : `${days}d`;
}

// Format a session length (in minutes) in hours, with minutes only for odd remainders.
//  90 → "1,5 ч" / "1.5 h" / "1.5 時間"   ·  60 → "1 ч"  ·  45 → "45 мин"  ·  75 → "1 ч 15 мин"
export function fmtDur(min: number, lang: 'en' | 'ru' | 'ja' = 'en'): string {
  if (!min || min <= 0) return lang === 'ru' ? '0 мин' : lang === 'ja' ? '0分' : '0 min';
  const h = Math.floor(min / 60), m = min % 60;
  const U = lang === 'ru' ? { h: 'ч', m: 'мин' } : lang === 'ja' ? { h: '時間', m: '分' } : { h: 'h', m: 'min' };
  const dec = lang === 'ru' ? ',' : '.';
  if (h === 0) return `${m} ${U.m}`;
  if (m === 0) return `${h} ${U.h}`;
  if (m === 30) return `${h}${dec}5 ${U.h}`;
  return `${h} ${U.h} ${m} ${U.m}`;
}
