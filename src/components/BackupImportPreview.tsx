import { useEffect, useRef } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { useT } from '../i18n';
import type {
  BackupInspection,
  BackupPreview,
  BackupPreviewAction,
  BackupPreviewKey,
} from '../services/backup';

interface BackupImportPreviewProps {
  fileName: string;
  inspection: BackupInspection;
  preview: BackupPreview;
  onCancel: () => void;
  onConfirm: () => void;
}

const ROWS: readonly BackupPreviewKey[] = [
  'goals', 'sessions', 'gtdTasks', 'projects', 'habits', 'habitGroups', 'reflections', 'metricDefs',
  'profile', 'preferences', 'notifications', 'generatedPlan', 'focusTimer',
];

const LABEL_KEYS: Record<BackupPreviewKey, string> = {
  goals: 'settings.backupPreview.goals',
  sessions: 'settings.backupPreview.sessions',
  gtdTasks: 'settings.backupPreview.tasks',
  projects: 'settings.backupPreview.projects',
  habits: 'settings.backupPreview.habits',
  habitGroups: 'settings.backupPreview.habitGroups',
  reflections: 'settings.backupPreview.reflectionDays',
  metricDefs: 'settings.backupPreview.metrics',
  profile: 'settings.backupPreview.profile',
  preferences: 'settings.backupPreview.preferences',
  notifications: 'settings.backupPreview.notifications',
  generatedPlan: 'settings.backupPreview.generatedPlan',
  focusTimer: 'settings.backupPreview.focusTimer',
};

const ACTION_KEYS: Record<BackupPreviewAction, string> = {
  update: 'settings.backupPreview.update',
  replace: 'settings.backupPreview.replace',
  clear: 'settings.backupPreview.clear',
};

export function BackupImportPreview({
  fileName,
  inspection,
  preview,
  onCancel,
  onConfirm,
}: BackupImportPreviewProps) {
  const t = useT();
  const confirmed = useRef(false);
  const dialogRef = useRef<HTMLElement>(null);
  const onCancelRef = useRef(onCancel);
  const previouslyFocusedRef = useRef<HTMLElement | null>(
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  onCancelRef.current = onCancel;

  useEffect(() => {
    dialogRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, []);

  const confirm = () => {
    if (confirmed.current) return;
    confirmed.current = true;
    onConfirm();
  };

  const source = inspection.source;
  const sourceText = source.kind === 'envelope'
    ? t('settings.backupPreview.envelope', {
      version: source.appVersion || '—',
      date: source.exportedAt?.slice(0, 10) || '—',
    })
    : source.kind === 'recovery'
      ? t('settings.backupPreview.recovery', { version: source.storeVersion })
      : t('settings.backupPreview.legacy');

  return (
    <div
      className="fixed inset-0 z-[410] flex items-center justify-center p-4 md:p-6 bg-black/50 backdrop-blur-[3px] anim-fade"
      role="presentation"
      onClick={onCancel}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-preview-title"
        aria-describedby="backup-preview-subtitle backup-preview-consequence"
        tabIndex={-1}
        className="w-full max-w-xl max-h-[min(760px,calc(100vh-2rem))] card overflow-hidden anim-pop flex flex-col"
        onClick={event => event.stopPropagation()}
      >
        <header className="p-5 md:px-6 md:py-5 border-b border-[var(--border)] flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="backup-preview-title" className="text-[17px] font-bold text-[var(--text)]">
              {t('settings.backupPreview.title')}
            </h2>
            <p id="backup-preview-subtitle" className="mt-1 text-[12px] leading-relaxed text-[var(--text-dim)]">
              {t('settings.backupPreview.subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t('common.close')}
            className="hit w-9 h-9 rounded-xl grid place-items-center text-[var(--text-dim)] hover:bg-[var(--surface-2)]"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="overflow-y-auto p-5 md:p-6 space-y-4">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[12px]">
            <dt className="font-medium text-[var(--text-dim)]">{t('settings.backupPreview.selectedFile')}</dt>
            <dd className="font-semibold text-[var(--text)] truncate text-right" title={fileName}>{fileName}</dd>
            <dt className="font-medium text-[var(--text-dim)]">{t('settings.backupPreview.source')}</dt>
            <dd className="text-[var(--text)] text-right">{sourceText}</dd>
          </dl>

          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-dim)] mb-2">
              {t('settings.backupPreview.changes')}
            </div>
            <div className="rounded-lg border border-[var(--border)] overflow-hidden">
              <table className="w-full table-fixed border-collapse text-left">
                <thead className="bg-[var(--surface-2)]">
                  <tr className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
                    <th scope="col" className="px-3 py-2">{t('settings.backupPreview.section')}</th>
                    <th scope="col" className="w-[96px] px-2 py-2 text-center">{t('settings.backupPreview.currentAfter')}</th>
                    <th scope="col" className="w-[84px] px-3 py-2 text-right">{t('settings.backupPreview.action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {ROWS.map(key => {
                    const row = preview[key];
                    if (!row) return null;
                    return (
                      <tr key={key} className="bg-[var(--surface)]">
                        <th scope="row" className="px-3 py-2.5 text-[12px] font-medium text-[var(--text)]">
                          {t(LABEL_KEYS[key])}
                        </th>
                        <td className="px-2 py-2.5 text-center">
                          {row.before !== undefined && row.after !== undefined
                            ? (
                              <span className="mono text-[11px] text-[var(--text-dim)] inline-flex items-center gap-1.5" aria-label={t('settings.backupPreview.countChange', { before: row.before, after: row.after })}>
                                {row.before}<ArrowRight className="w-3 h-3" aria-hidden="true" />{row.after}
                              </span>
                            )
                            : <span className="text-[var(--text-mute)]" aria-hidden="true">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`inline-block text-[9px] font-bold uppercase tracking-wider rounded-full px-2 py-1 ${row.action === 'clear' ? 'bg-red-500/12 text-red-400' : row.action === 'update' ? 'bg-amber-500/12 text-amber-500' : 'bg-[var(--primary)]/12 text-[var(--primary)]'}`}>
                            {t(ACTION_KEYS[row.action])}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p id="backup-preview-consequence" className="text-[11px] leading-relaxed text-[var(--text-dim)]">
            {t('settings.backupPreview.partialHint')}
          </p>
        </div>

        <footer className="p-5 md:px-6 border-t border-[var(--border)] flex gap-2.5 bg-[var(--surface)]">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 h-11 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[13px] font-bold text-[var(--text)]"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={confirm}
            className="flex-1 h-11 rounded-xl bg-[var(--primary)] text-white text-[13px] font-bold shadow-lg shadow-[var(--primary)]/20"
          >
            {t('settings.backupPreview.confirm')}
          </button>
        </footer>
      </section>
    </div>
  );
}
