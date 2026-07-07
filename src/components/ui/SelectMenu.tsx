import { useEffect, useRef, useState } from 'react';
import { useBackClose } from '../../hooks/useHardwareBack';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export function SelectMenu<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  size = 'md',
}: {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  size?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState(false);
  useBackClose(open, () => setOpen(false));
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) || options[0];

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`w-full rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--primary)] flex items-center justify-between gap-2 ${size === 'sm' ? 'h-7 px-2 text-[11px]' : 'h-8 px-3 text-[12px]'}`}
      >
        <span className="truncate">{selected?.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-[var(--text-dim)] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="listbox" className="absolute z-[400] mt-1 w-full min-w-max rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg">
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                type="button"
                role="option"
                aria-selected={active}
                key={option.value}
                onClick={() => { onChange(option.value); setOpen(false); }}
                className={`w-full h-9 px-2.5 rounded-lg text-left text-[12px] font-semibold flex items-center gap-2 ${active ? 'text-[var(--primary)] bg-[var(--primary)]/10' : 'text-[var(--text)] hover:bg-[var(--surface-2)]'}`}
              >
                <Check className={`w-3.5 h-3.5 shrink-0 ${active ? 'opacity-100' : 'opacity-0'}`} />
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
