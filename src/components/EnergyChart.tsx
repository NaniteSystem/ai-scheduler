import { useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';

const PERIODS = [['day', 'chart.day'], ['week', 'chart.week'], ['month', 'chart.month'], ['year', 'chart.year']] as const;
type Period = typeof PERIODS[number][0];

/** Time-per-task breakdown (done sessions) as a donut, with day/week/month/year toggle. */
export function EnergyChart() {
  const t = useT();
  const h = t('common.hourShort');
  const fmtH = (min: number) => min === 0 ? `0${h}` : (min / 60) % 1 === 0 ? `${min / 60}${h}` : `${(min / 60).toFixed(1)}${h}`;
  const { sessions, goals, schedulePrefs } = useStore();
  const [period, setPeriod] = useState<Period>('week');
  const wk = schedulePrefs.weekStartsOn ?? 1;
  const now = new Date();

  let start: Date, end: Date;
  if (period === 'day') { start = new Date(now); start.setHours(0, 0, 0, 0); end = new Date(now); end.setHours(23, 59, 59, 999); }
  else if (period === 'week') { start = startOfWeek(now, { weekStartsOn: wk }); end = endOfWeek(now, { weekStartsOn: wk }); }
  else if (period === 'month') { start = startOfMonth(now); end = endOfMonth(now); }
  else { start = startOfYear(now); end = endOfYear(now); }
  const sStr = format(start, 'yyyy-MM-dd'), eStr = format(end, 'yyyy-MM-dd');

  const done = sessions.filter(s => s.status === 'done' && !!s.date && s.date >= sStr && s.date <= eStr && s.durationMinutes > 0);
  const map = new Map<string, { mins: number; color: string }>();
  for (const s of done) {
    const key = s.title.trim() || t('ec.untitled');
    const g = goals.find(x => x.id === s.goalId);
    const color = s.color || g?.color || '#22c55e';
    const e = map.get(key) || { mins: 0, color };
    e.mins += s.durationMinutes;
    map.set(key, e);
  }
  const rows = [...map.entries()].map(([title, v]) => ({ title, ...v })).sort((a, b) => b.mins - a.mins);
  const total = rows.reduce((a, r) => a + r.mins, 0);

  // Donut geometry
  const R = 30, C = 2 * Math.PI * R;
  let acc = 0;
  const segs = rows.map(r => {
    const frac = total ? r.mins / total : 0;
    const seg = { color: r.color, dash: frac * C, offset: -acc * C };
    acc += frac;
    return seg;
  });

  return (
    <div className="text-left">
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-widest">{t('dash.timeOnTasks')}</span>
        <div className="flex gap-0.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-0.5">
          {PERIODS.map(([p, labelKey]) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`min-w-[40px] h-10 rounded-md text-[12px] font-bold transition-all ${period === p ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-dim)] hover:text-[var(--text)]'}`}>
              {t(labelKey)}
            </button>
          ))}
        </div>
      </div>

      {total === 0 ? (
        <div className="h-[72px] flex items-center text-[11px] text-[var(--text-dim)]">{t('chart.noSessions')}</div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="relative shrink-0" style={{ width: 72, height: 72 }}>
            <svg width={72} height={72} className="-rotate-90">
              <circle cx={36} cy={36} r={R} fill="none" stroke="var(--border)" strokeWidth={8} />
              {segs.map((s, i) => (
                <circle key={i} cx={36} cy={36} r={R} fill="none" stroke={s.color} strokeWidth={8}
                  strokeDasharray={`${s.dash} ${C - s.dash}`} strokeDashoffset={s.offset} />
              ))}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[13px] font-bold text-[var(--text)] mono leading-none">{fmtH(total)}</span>
            </div>
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            {rows.slice(0, 4).map(r => (
              <div key={r.title} className="flex items-center gap-2 text-[11px]">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />
                <span className="text-[var(--text)] truncate flex-1">{r.title}</span>
                <span className="text-[var(--text-dim)] mono shrink-0">{fmtH(r.mins)}</span>
              </div>
            ))}
            {rows.length > 4 && <div className="text-[10px] text-[var(--text-dim)] pl-4">{t('chart.more', { n: rows.length - 4 })}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
