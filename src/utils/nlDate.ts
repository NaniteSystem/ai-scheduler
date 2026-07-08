import { format } from 'date-fns';
import type { RecurringPattern } from '../types';

// ─── Natural-language date extraction (EN / RU / JA) ───────────────────────
// Pulls a due date, an optional time (→ remindAt) and a recurrence out of a
// quick-add string, returning the cleaned title. Pure & testable.

export interface NLDateResult {
  title: string;
  dueDate?: string;    // 'yyyy-MM-dd'
  remindAt?: string;   // 'yyyy-MM-ddTHH:mm'
  recurring?: RecurringPattern;
}

const WEEKDAYS: { re: RegExp; day: number }[] = [
  { re: /(?:^|\s)(?:(?:on|next)\s+)?(monday)(?=[\s,.]|$)/i, day: 1 },
  { re: /(?:^|\s)(?:(?:on|next)\s+)?(tuesday)(?=[\s,.]|$)/i, day: 2 },
  { re: /(?:^|\s)(?:(?:on|next)\s+)?(wednesday)(?=[\s,.]|$)/i, day: 3 },
  { re: /(?:^|\s)(?:(?:on|next)\s+)?(thursday)(?=[\s,.]|$)/i, day: 4 },
  { re: /(?:^|\s)(?:(?:on|next)\s+)?(friday)(?=[\s,.]|$)/i, day: 5 },
  { re: /(?:^|\s)(?:(?:on|next)\s+)?(saturday)(?=[\s,.]|$)/i, day: 6 },
  { re: /(?:^|\s)(?:(?:on|next)\s+)?(sunday)(?=[\s,.]|$)/i, day: 0 },
  { re: /(?:^|\s)(?:во?\s+)?(понедельник)(?=[\s,.]|$)/i, day: 1 },
  { re: /(?:^|\s)(?:во?\s+)?(вторник)(?=[\s,.]|$)/i, day: 2 },
  { re: /(?:^|\s)(?:во?\s+)?(сред[ау])(?=[\s,.]|$)/i, day: 3 },
  { re: /(?:^|\s)(?:во?\s+)?(четверг)(?=[\s,.]|$)/i, day: 4 },
  { re: /(?:^|\s)(?:во?\s+)?(пятниц[ау])(?=[\s,.]|$)/i, day: 5 },
  { re: /(?:^|\s)(?:во?\s+)?(суббот[ау])(?=[\s,.]|$)/i, day: 6 },
  { re: /(?:^|\s)(?:во?\s+)?(воскресенье)(?=[\s,.]|$)/i, day: 0 },
  { re: /(月曜日?)(?=[\sに,.]|$)/, day: 1 },
  { re: /(火曜日?)(?=[\sに,.]|$)/, day: 2 },
  { re: /(水曜日?)(?=[\sに,.]|$)/, day: 3 },
  { re: /(木曜日?)(?=[\sに,.]|$)/, day: 4 },
  { re: /(金曜日?)(?=[\sに,.]|$)/, day: 5 },
  { re: /(土曜日?)(?=[\sに,.]|$)/, day: 6 },
  { re: /(日曜日?)(?=[\sに,.]|$)/, day: 0 },
];

const MONTHS_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const fmt = (d: Date) => format(d, 'yyyy-MM-dd');
const addD = (base: Date, days: number) => { const d = new Date(base); d.setDate(d.getDate() + days); return d; };

/** Next calendar date with the given weekday (0=Sun). Today counts if it matches. */
function nextWeekday(now: Date, day: number, forceNext = false): Date {
  let diff = (day - now.getDay() + 7) % 7;
  if (forceNext && diff === 0) diff = 7;
  return addD(now, diff);
}

export function extractNLDate(input: string, now: Date = new Date()): NLDateResult {
  let title = input;
  let dueDate: string | undefined;
  let recurring: RecurringPattern | undefined;
  let remindAt: string | undefined;

  const eat = (m: RegExpMatchArray) => { title = (title.slice(0, m.index!) + ' ' + title.slice(m.index! + m[0].length)).trim(); };

  // ── Recurrence ──────────────────────────────────────────────────────────
  const recRules: [RegExp, RecurringPattern][] = [
    [/(?:^|\s)(every\s?day|daily|каждый день|ежедневно|毎日)(?=[\s,.]|$)/i, 'daily'],
    [/(?:^|\s)(every\s+weekday|по будням|平日毎)(?=[\s,.]|$)/i, 'weekdays'],
    [/(?:^|\s)(every\s+weekend|по выходным|毎週末)(?=[\s,.]|$)/i, 'weekends'],
    [/(?:^|\s)(every\s+week|weekly|каждую неделю|еженедельно|毎週)(?=[\s,.]|$)/i, 'weekly'],
    [/(?:^|\s)(every\s+month|monthly|каждый месяц|ежемесячно|毎月)(?=[\s,.]|$)/i, 'monthly'],
  ];
  for (const [re, pat] of recRules) {
    const m = title.match(re);
    if (m) { recurring = pat; eat(m); break; }
  }
  // "every friday" / "каждую пятницу" / "毎週金曜" → weekly anchored on that weekday
  if (!recurring) {
    const evRe = /(?:^|\s)(?:every|кажд(?:ый|ую|ое)|毎週)\s*/i;
    const ev = title.match(evRe);
    if (ev) {
      const rest = title.slice(ev.index! + ev[0].length);
      const wdNames: [RegExp, number][] = [
        [/^(monday|понедельник|月曜日?)/i, 1], [/^(tuesday|вторник|火曜日?)/i, 2],
        [/^(wednesday|среду|水曜日?)/i, 3], [/^(thursday|четверг|木曜日?)/i, 4],
        [/^(friday|пятницу|金曜日?)/i, 5], [/^(saturday|субботу|土曜日?)/i, 6],
        [/^(sunday|воскресенье|日曜日?)/i, 0],
      ];
      for (const [re, day] of wdNames) {
        const m = rest.match(re);
        if (m) {
          recurring = 'weekly';
          dueDate = fmt(nextWeekday(now, day));
          title = (title.slice(0, ev.index!) + ' ' + rest.slice(m[0].length)).trim();
          break;
        }
      }
    }
  }

  // ── Relative words ──────────────────────────────────────────────────────
  if (!dueDate) {
    const relWords: [RegExp, number][] = [
      [/(?:^|\s)(day after tomorrow|послезавтра|明後日)(?=[\s,.]|$)/i, 2],
      [/(?:^|\s)(today|сегодня|今日)(?=[\s,.]|$)/i, 0],
      [/(?:^|\s)(tomorrow|завтра|明日)(?=[\s,.]|$)/i, 1],
      [/(?:^|\s)(next week|на следующей неделе|через неделю|来週)(?=[\s,.]|$)/i, 7],
    ];
    for (const [re, offset] of relWords) {
      const m = title.match(re);
      if (m) { dueDate = fmt(addD(now, offset)); eat(m); break; }
    }
  }

  // "in 3 days" / "через 3 дня" / "3日後"; "in 2 weeks" / "через 2 недели"
  if (!dueDate) {
    const m = title.match(/(?:^|\s)(?:in|через)\s+(\d+)\s*(days?|day|дн(?:я|ей|ь)|weeks?|недел[юиь])(?=[\s,.]|$)/i)
      || title.match(/(?:^|\s)(\d+)(日後|週間後)(?=[\s,.]|$)/);
    if (m) {
      const n = parseInt(m[1], 10);
      const unit = m[2].toLowerCase();
      const days = /week|недел|週間/.test(unit) ? n * 7 : n;
      dueDate = fmt(addD(now, days));
      eat(m);
    }
  }

  // ── Weekday names ("friday", "в пятницу", "金曜日") ─────────────────────
  if (!dueDate) {
    for (const { re, day } of WEEKDAYS) {
      const m = title.match(re);
      if (m) { dueDate = fmt(nextWeekday(now, day)); eat(m); break; }
    }
  }

  // ── Explicit dates ──────────────────────────────────────────────────────
  // "15 july" / "july 15" / "15 июля" / "7月15日" / "15.07" / "15/07/2026"
  if (!dueDate) {
    const monthAlt = [...MONTHS_EN, ...MONTHS_EN.map(mn => mn.slice(0, 3)), ...MONTHS_RU].join('|');
    let day: number | undefined, mon: number | undefined, year: number | undefined;
    let m = title.match(new RegExp(`(?:^|\\s)(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthAlt})(?:\\s+(\\d{4}))?(?=[\\s,.]|$)`, 'i'))
      || title.match(new RegExp(`(?:^|\\s)(${monthAlt})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?=[\\s,.]|$)`, 'i'));
    if (m) {
      const a = m[1], b = m[2];
      if (/^\d+$/.test(a)) { day = +a; mon = monthIndex(b); } else { mon = monthIndex(a); day = +b; }
      if (m[3]) year = +m[3];
    }
    if (day == null) {
      const j = title.match(/(?:^|\s)(\d{1,2})月(\d{1,2})日?(?=[\sに,.]|$)/);
      if (j) { mon = +j[1] - 1; day = +j[2]; m = j; }
    }
    if (day == null) {
      const n = title.match(/(?:^|\s)(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=[\s,.]|$)/);
      if (n && +n[1] >= 1 && +n[1] <= 31 && +n[2] >= 1 && +n[2] <= 12) {
        day = +n[1]; mon = +n[2] - 1;
        if (n[3]) year = +n[3] < 100 ? 2000 + +n[3] : +n[3];
        m = n;
      }
    }
    if (day != null && mon != null && mon >= 0 && day >= 1 && day <= 31 && m) {
      let d = new Date(year ?? now.getFullYear(), mon, day);
      if (!year && d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d = new Date(now.getFullYear() + 1, mon, day);
      if (d.getMonth() === mon) { dueDate = fmt(d); eat(m); }
    }
  }

  // ── Time → reminder ("at 18:00", "в 18:00", "at 6pm", "18時") ───────────
  {
    let hh: number | undefined, mm = 0;
    let m = title.match(/(?:^|\s)(?:at|в|@)\s*(\d{1,2}):(\d{2})(?=[\s,.]|$)/i) || title.match(/(?:^|\s)(\d{1,2}):(\d{2})(?=[\s,.]|$)/);
    if (m) { hh = +m[1]; mm = +m[2]; }
    if (hh == null) {
      const ampm = title.match(/(?:^|\s)(?:at\s+)?(\d{1,2})\s*(am|pm)(?=[\s,.]|$)/i);
      if (ampm) { hh = (+ampm[1] % 12) + (ampm[2].toLowerCase() === 'pm' ? 12 : 0); m = ampm; }
    }
    if (hh == null) {
      const jp = title.match(/(?:^|\s)(\d{1,2})時(?=[\sに,.]|$)/);
      if (jp) { hh = +jp[1]; m = jp; }
    }
    if (hh != null && hh <= 23 && mm <= 59 && m) {
      const base = dueDate ?? fmt(now);
      remindAt = `${base}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      if (!dueDate) dueDate = base;
      eat(m);
    }
  }

  title = title.replace(/\s{2,}/g, ' ').trim();
  return { title: title || input, dueDate, remindAt, recurring };
}

function monthIndex(name: string): number {
  const n = name.toLowerCase();
  let i = MONTHS_EN.findIndex(mn => mn === n || mn.slice(0, 3) === n);
  if (i === -1) i = MONTHS_RU.indexOf(n);
  return i;
}
