import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Check } from 'lucide-react';
import { useT } from '../../i18n';

const pad = (n: number) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,…,55

/**
 * Custom time picker — replaces the native <input type="time"> whose OS dropdown
 * fights manual entry. Trigger shows HH:MM; tapping opens a modal with free
 * keyboard entry plus quick hour/minute columns.
 */
export function TimePicker({ value, onChange, label }: { value: number; onChange: (m: number) => void; label?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const h = Math.floor(value / 60);
  const m = value % 60;
  const [hh, setHh] = useState(pad(h));
  const [mm, setMm] = useState(pad(m));
  const hourCol = useRef<HTMLDivElement>(null);
  const minCol = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setHh(pad(Math.floor(value / 60)));
    setMm(pad(value % 60));
    // scroll selected rows into view
    requestAnimationFrame(() => {
      hourCol.current?.querySelector('[data-sel="true"]')?.scrollIntoView({ block: 'center' });
      minCol.current?.querySelector('[data-sel="true"]')?.scrollIntoView({ block: 'center' });
    });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const curH = Math.max(0, Math.min(23, parseInt(hh || '0', 10) || 0));
  const curM = Math.max(0, Math.min(59, parseInt(mm || '0', 10) || 0));

  const commit = (H: number, M: number) => onChange(Math.max(0, Math.min(23, H)) * 60 + Math.max(0, Math.min(59, M)));

  const onHh = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 2);
    setHh(d);
    if (d !== '') commit(parseInt(d, 10), curM);
  };
  const onMm = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 2);
    setMm(d);
    if (d !== '') commit(curH, parseInt(d, 10));
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="w-full h-11 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-4 flex items-center justify-between text-[14px] text-[var(--text)] mono hover:border-[var(--border)] transition-colors">
        <span>{pad(h)}:{pad(m)}</span>
        <Clock className="w-4 h-4 text-[var(--text-dim)]" />
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm anim-fade" onClick={() => setOpen(false)}>
          <div className="w-full max-w-xs card overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[var(--primary)]" />
              <span className="text-[13px] font-bold text-[var(--text)]">{label || t('tp.time')}</span>
            </div>

            {/* Manual entry */}
            <div className="flex items-center justify-center gap-2 py-5">
              <input value={hh} onChange={e => onHh(e.target.value)} onFocus={e => e.target.select()}
                inputMode="numeric" maxLength={2} aria-label={t('tp.hours')}
                className="w-20 h-16 rounded-2xl bg-[var(--surface)] border border-[var(--border)] text-center text-[34px] font-bold text-[var(--text)] mono focus:outline-none focus:border-[var(--primary)]/60" />
              <span className="text-[30px] font-bold text-[var(--text-dim)] mono">:</span>
              <input value={mm} onChange={e => onMm(e.target.value)} onFocus={e => e.target.select()}
                inputMode="numeric" maxLength={2} aria-label={t('tp.minutes')}
                className="w-20 h-16 rounded-2xl bg-[var(--surface)] border border-[var(--border)] text-center text-[34px] font-bold text-[var(--text)] mono focus:outline-none focus:border-[var(--primary)]/60" />
            </div>

            {/* Quick columns */}
            <div className="grid grid-cols-2 gap-px bg-[var(--border)] border-y border-[var(--border)]">
              <div ref={hourCol} className="max-h-[168px] overflow-y-auto no-scrollbar bg-[var(--surface)]">
                <div className="px-3 py-1.5 text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-wider sticky top-0 bg-[var(--surface)]">{t('tp.hourCol')}</div>
                {HOURS.map(H => {
                  const sel = curH === H;
                  return (
                    <button key={H} data-sel={sel} onClick={() => onHh(pad(H))}
                      className={`w-full px-3 py-2 text-left text-[15px] mono flex items-center justify-between transition-colors ${sel ? 'bg-[var(--primary)]/20 text-[var(--primary)] font-bold' : 'text-[var(--text-dim)] hover:bg-[var(--surface-2)]'}`}>
                      {pad(H)}{sel && <Check className="w-3.5 h-3.5 text-[var(--primary)]" />}
                    </button>
                  );
                })}
              </div>
              <div ref={minCol} className="max-h-[168px] overflow-y-auto no-scrollbar bg-[var(--surface)]">
                <div className="px-3 py-1.5 text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-wider sticky top-0 bg-[var(--surface)]">{t('tp.minCol')}</div>
                {MINUTES.map(M => {
                  const sel = curM === M;
                  return (
                    <button key={M} data-sel={sel} onClick={() => onMm(pad(M))}
                      className={`w-full px-3 py-2 text-left text-[15px] mono flex items-center justify-between transition-colors ${sel ? 'bg-[var(--primary)]/20 text-[var(--primary)] font-bold' : 'text-[var(--text-dim)] hover:bg-[var(--surface-2)]'}`}>
                      {pad(M)}{sel && <Check className="w-3.5 h-3.5 text-[var(--primary)]" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-3">
              <button onClick={() => setOpen(false)}
                className="w-full h-11 rounded-xl bg-[var(--primary)] text-white text-[13px] font-bold hover:bg-[var(--primary)] transition-colors">
                {t('common.done')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
