import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  width?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
  headerExtra?: React.ReactNode;
  noPadding?: boolean;
}

const WIDTHS = { sm: 'md:w-96', md: 'md:w-[480px]', lg: 'md:w-[560px]', xl: 'md:w-[640px]' };

export function Drawer({ open, onClose, title, subtitle, width = 'md', children, headerExtra, noPadding }: DrawerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] pointer-events-none">
      {/* Backdrop — subtle */}
      <div onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-[2px] pointer-events-auto transition-opacity" />

      {/* Panel — mobile: bottom sheet hugging content (capped); desktop: right-side panel */}
      <div
        ref={ref}
        className={`absolute inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+24px)] max-h-[calc(88vh-env(safe-area-inset-bottom)-24px)] md:inset-x-auto md:top-2 md:right-2 md:bottom-2 md:left-auto md:max-h-none w-auto ${WIDTHS[width]} bg-[var(--surface)] border border-[var(--border)] rounded-2xl pointer-events-auto flex flex-col anim-sheet overflow-hidden`}
        style={{ boxShadow: '0 18px 60px rgba(20,25,50,0.35)' }}
      >
        {/* Grab handle (mobile only) */}
        <div className="md:hidden mx-auto mt-2 -mb-1 h-1 w-10 rounded-full bg-[var(--border)] shrink-0" />
        {title && (
          <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-4 border-b border-[var(--surface-2)] shrink-0">
            <div className="min-w-0">
              <div className="text-[15px] font-bold text-[var(--text)] truncate">{title}</div>
              {subtitle && <div className="text-[11px] text-[var(--text-dim)] mt-0.5 truncate">{subtitle}</div>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {headerExtra}
              <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--surface-2)] grid place-items-center text-[var(--text-dim)] hover:text-[var(--text)] transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        <div className={`flex-1 overflow-y-auto ${noPadding ? '' : 'p-5'}`}>
          {children}
        </div>
      </div>
    </div>
  );
}
