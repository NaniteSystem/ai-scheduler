import { useEffect } from 'react';
import { useStore } from '../../store';
import { useT } from '../../i18n';
import { AlertTriangle } from 'lucide-react';

export function ConfirmModal() {
  const t = useT();
  const dialog = useStore(s => s.confirmDialog);
  const close = useStore(s => s.closeConfirm);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'Enter') { dialog.onConfirm(); close(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, close]);

  if (!dialog) return null;
  const { title = t('confirm.title'), message, confirmLabel = t('confirm.confirm'), cancelLabel = t('common.cancel'), danger, onConfirm } = dialog;

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-5 bg-black/45 backdrop-blur-[3px] anim-fade" onClick={close}>
      <div className="w-full max-w-sm card p-6 anim-pop" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3.5">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${danger ? 'bg-red-500/15 text-red-400' : 'bg-[var(--primary)]/15 text-[var(--primary)]'}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0 pt-0.5">
            <h3 className="text-[15px] font-bold text-[var(--text)] leading-tight">{title}</h3>
            <p className="text-[13px] text-[var(--text-dim)] leading-relaxed mt-1.5">{message}</p>
          </div>
        </div>
        <div className="flex gap-2.5 mt-6">
          <button onClick={close}
            className="flex-1 h-11 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[13px] font-bold text-[var(--text)] hover:text-[var(--text)] hover:bg-[var(--border)] transition-all">
            {cancelLabel}
          </button>
          <button autoFocus onClick={() => { onConfirm(); close(); }}
            className={`flex-1 h-11 rounded-xl text-[13px] font-bold text-white transition-all ${danger ? 'bg-red-500 hover:bg-red-400 shadow-lg shadow-red-500/20' : 'bg-[var(--primary)] hover:bg-[var(--primary)] shadow-lg shadow-[var(--primary)]/20'}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
