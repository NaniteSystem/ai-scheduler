import { useState, useEffect } from 'react';
import { format, parseISO, startOfMonth, startOfWeek, addDays, addMonths, isSameDay, isSameMonth, setDay } from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useT, useDateLocale } from '../../i18n';

/**
 * Custom calendar date picker — replaces the native <input type="date"> popup.
 * `value` / `onChange` use yyyy-MM-dd strings.
 */
export function DatePicker({ value, onChange, weekStartsOn = 1 }: { value: string; onChange: (d: string) => void; weekStartsOn?: 0 | 1 }) {
  const t = useT();
  const locale = useDateLocale();
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : new Date();
  const [viewDate, setViewDate] = useState(selected);
  const today = new Date();

  useEffect(() => { if (open) setViewDate(value ? parseISO(value) : new Date()); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const gridStart = startOfWeek(startOfMonth(viewDate), { weekStartsOn });
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const weekdays = Array.from({ length: 7 }, (_, i) => format(setDay(new Date(), (weekStartsOn + i) % 7), 'EEEEEE', { locale }));

  const pick = (d: Date) => { onChange(format(d, 'yyyy-MM-dd')); setOpen(false); };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="w-full h-11 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 flex items-center gap-2 text-[14px] text-[var(--text)] hover:border-[var(--border)] transition-colors">
        <CalendarDays className="w-4 h-4 text-[var(--text-dim)] shrink-0" />
        <span className="mono">{value || '—'}</span>
        <span className="ml-auto text-[12px] text-[var(--text-dim)]">{value ? format(parseISO(value), 'EEE', { locale }) : ''}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm anim-fade" onClick={() => setOpen(false)}>
          <div className="w-full max-w-xs card overflow-hidden p-4" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="text-[15px] font-bold text-[var(--text)]">{format(viewDate, 'LLLL', { locale })} {viewDate.getFullYear()}</div>
              <div className="flex gap-1">
                <button onClick={() => setViewDate(addMonths(viewDate, -1))} className="w-8 h-8 rounded-lg hover:bg-[var(--border)] grid place-items-center text-[var(--text)]"><ChevronLeft className="w-4 h-4" /></button>
                <button onClick={() => setViewDate(addMonths(viewDate, 1))} className="w-8 h-8 rounded-lg hover:bg-[var(--border)] grid place-items-center text-[var(--text)]"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>

            {/* Weekday labels */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {weekdays.map(w => <div key={w} className="h-7 grid place-items-center text-[10px] font-bold text-[var(--text-dim)] uppercase">{w}</div>)}
            </div>

            {/* Days */}
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                const inMonth = isSameMonth(d, viewDate);
                const isSel = value && isSameDay(d, selected);
                const isToday = isSameDay(d, today);
                return (
                  <button key={i} onClick={() => pick(d)}
                    className={`h-9 rounded-lg text-[13px] font-medium mono transition-all
                      ${isSel ? 'bg-[var(--primary)] text-white font-bold' : inMonth ? 'text-[var(--text)] hover:bg-[var(--border)]' : 'text-[var(--text-mute)] hover:bg-[var(--surface-2)]'}
                      ${isToday && !isSel ? 'border border-[var(--primary)]/50' : ''}`}>
                    {d.getDate()}
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
              <button onClick={() => setOpen(false)} className="text-[12px] font-bold text-[var(--text-dim)] hover:text-[var(--text)] px-2 py-1">{t('common.close')}</button>
              <button onClick={() => pick(new Date())} className="text-[12px] font-bold text-[var(--primary)] hover:text-[var(--primary)] px-2 py-1">{t('common.today')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
