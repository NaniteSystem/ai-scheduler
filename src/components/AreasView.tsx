import { useState } from 'react';
import { Archive, ChevronLeft, Folder, Layers, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import { activeAreas, areaStats } from '../domain/areas';
import { PROJECT_COLORS } from '../domain/projects';
import { localDateKey } from '../domain/date';
import { useT } from '../i18n';
import { useStore } from '../store';
import type { Area } from '../types';

export function AreasView({ onBack, onOpenProject }: { onBack: () => void; onOpenProject: (id: string) => void }) {
  const t = useT();
  const { areas, projects, gtdTasks, addArea, updateArea, askConfirm } = useStore();
  const [title, setTitle] = useState('');
  const [createError, setCreateError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editColor, setEditColor] = useState(PROJECT_COLORS[0]);
  const [editNotes, setEditNotes] = useState('');
  const [editError, setEditError] = useState('');
  const today = localDateKey();

  const active = activeAreas(areas);
  const archived = areas.filter(area => !!area.archivedAt);

  const hasDuplicateTitle = (value: string, exceptId?: string) => areas.some(area => (
    area.id !== exceptId && area.title.toLocaleLowerCase() === value.toLocaleLowerCase()
  ));

  const create = () => {
    const trimmed = title.trim();
    if (!trimmed) { setCreateError(t('areas.nameRequired')); return; }
    if (hasDuplicateTitle(trimmed)) { setCreateError(t('areas.duplicateName')); return; }
    addArea(trimmed);
    setTitle('');
    setCreateError('');
  };

  const startEdit = (area: Area) => {
    setEditingId(area.id);
    setEditTitle(area.title);
    setEditColor(area.color);
    setEditNotes(area.notes || '');
    setEditError('');
  };
  const closeEdit = () => { setEditingId(null); setEditError(''); };
  const saveEdit = (area: Area) => {
    const trimmed = editTitle.trim();
    if (!trimmed) { setEditError(t('areas.nameRequired')); return; }
    if (hasDuplicateTitle(trimmed, area.id)) { setEditError(t('areas.duplicateName')); return; }
    updateArea(area.id, { title: trimmed, color: editColor, notes: editNotes });
    closeEdit();
  };

  const toggleArchive = (area: Area) => {
    if (area.archivedAt) { updateArea(area.id, { archivedAt: undefined }); return; }
    askConfirm({
      title: t('areas.archiveAction'),
      message: area.title,
      confirmLabel: t('areas.archiveAction'),
      onConfirm: () => updateArea(area.id, { archivedAt: new Date().toISOString() }),
    });
  };

  const renderArea = (area: Area) => {
    const stats = areaStats(area, projects, gtdTasks, today);
    const linkedProjects = projects.filter(project => project.areaId === area.id);
    const editing = editingId === area.id;
    return (
      <article key={area.id} className="tcard p-5 overflow-hidden" style={{ borderTop: `3px solid ${area.color}` }}>
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl grid place-items-center shrink-0 text-[18px]" style={{ background: `${area.color}18`, color: area.color }}>
            {area.icon || <Layers className="w-5 h-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-bold text-[var(--text)] truncate">{area.title}</h2>
            <p className="text-[11px] text-[var(--text-dim)] mt-1">{t('areas.projectCount', { n: stats.projectCount })} · {t('areas.taskSummary', { open: stats.openTaskCount, overdue: stats.overdueTaskCount })}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => editing ? closeEdit() : startEdit(area)}
              className="hit w-9 h-9 rounded-xl grid place-items-center text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              aria-label={editing ? t('common.cancel') : t('areas.edit')}
            >
              {editing ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => toggleArchive(area)}
              className="hit h-9 px-2.5 rounded-xl flex items-center gap-1.5 text-[11px] font-bold text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              aria-label={area.archivedAt ? t('areas.restoreAction') : t('areas.archiveAction')}
            >
              {area.archivedAt ? <RotateCcw className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {editing ? (
          <form onSubmit={event => { event.preventDefault(); saveEdit(area); }} className="mt-4 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] p-3">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]" htmlFor={`area-title-${area.id}`}>{t('areas.nameLabel')}</label>
            <input
              id={`area-title-${area.id}`}
              value={editTitle}
              onChange={event => { setEditTitle(event.target.value); setEditError(''); }}
              className="mt-1.5 h-9 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
              autoFocus
            />
            <label className="mt-3 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]" htmlFor={`area-notes-${area.id}`}>{t('areas.notesLabel')}</label>
            <textarea
              id={`area-notes-${area.id}`}
              value={editNotes}
              onChange={event => setEditNotes(event.target.value)}
              rows={2}
              placeholder={t('areas.notesPlaceholder')}
              className="mt-1.5 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
            />
            <div className="mt-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('areas.colorLabel')}</span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {PROJECT_COLORS.map((color, index) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setEditColor(color)}
                    className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-105"
                    style={{ background: color, borderColor: editColor === color ? 'var(--text)' : 'transparent' }}
                    aria-label={t('areas.colorOption', { n: index + 1 })}
                    aria-pressed={editColor === color}
                  />
                ))}
              </div>
            </div>
            {editError && <p className="mt-2 text-[10px] text-red-500" role="alert">{editError}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={closeEdit} className="h-8 px-3 rounded-lg text-[11px] font-bold text-[var(--text-dim)] hover:bg-[var(--surface)]">{t('common.cancel')}</button>
              <button className="h-8 px-3 rounded-lg bg-[var(--primary)] text-white text-[11px] font-bold">{t('common.save')}</button>
            </div>
          </form>
        ) : (
          <>
            {area.notes && <p className="mt-3 text-[12px] text-[var(--text-dim)]">{area.notes}</p>}
            <div className="mt-3 space-y-1.5">
              {linkedProjects.length > 0 ? linkedProjects.map(project => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => onOpenProject(project.id)}
                  className="w-full min-h-9 rounded-xl px-2.5 flex items-center gap-2 text-left hover:bg-[var(--surface-2)]"
                  aria-label={t('areas.openProject', { title: project.title })}
                >
                  <Folder className="w-3.5 h-3.5 shrink-0" style={{ color: project.color }} />
                  <span className="text-[12px] text-[var(--text)] truncate flex-1">{project.title}</span>
                </button>
              )) : (
                <p className="px-2.5 text-[11px] text-[var(--text-dim)]">{t('areas.noProjects')}</p>
              )}
            </div>
          </>
        )}
      </article>
    );
  };

  return (
    <div className="px-4 md:px-10 py-6 md:py-8 max-w-[1040px] space-y-7 pb-32">
      <header className="anim-fade">
        <button onClick={onBack} className="hit mb-4 h-9 px-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[12px] font-bold text-[var(--text-dim)] flex items-center gap-1.5 hover:text-[var(--text)]">
          <ChevronLeft className="w-4 h-4" />{t('overview.manage')}
        </button>
        <h1 className="display text-[30px] md:text-[48px] text-[var(--text)]">{t('areas.title')}</h1>
        <p className="text-[14px] text-[var(--text-dim)] mt-1">{t('areas.subtitle')}</p>
      </header>

      <form onSubmit={event => { event.preventDefault(); create(); }} className="tcard p-4 space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
          <input
            value={title}
            onChange={event => { setTitle(event.target.value); setCreateError(''); }}
            placeholder={t('areas.namePlaceholder')}
            aria-label={t('areas.namePlaceholder')}
            aria-invalid={!!createError}
            className="h-11 min-w-0 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] px-3 text-[13px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
          />
          <button className="h-11 px-4 rounded-xl bg-[var(--primary)] text-white text-[12px] font-bold flex items-center justify-center gap-1.5 active:scale-[.99] transition-transform">
            <Plus className="w-4 h-4" />{t('areas.create')}
          </button>
        </div>
        {createError && <p className="mt-1 text-[10px] text-red-500" role="alert">{createError}</p>}
      </form>

      {active.length > 0 ? (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">{active.map(renderArea)}</section>
      ) : (
        <section className="rounded-2xl border border-dashed border-[var(--border)] p-10 text-center">
          <Layers className="w-10 h-10 mx-auto text-[var(--primary)]/30" />
          <h2 className="mt-3 text-[15px] font-bold text-[var(--text)]">{t('areas.emptyTitle')}</h2>
          <p className="mt-1 text-[12px] text-[var(--text-dim)]">{t('areas.emptySubtitle')}</p>
        </section>
      )}

      {archived.length > 0 && (
        <section>
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[var(--text-dim)]">{t('areas.archived')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 opacity-75">{archived.map(renderArea)}</div>
        </section>
      )}
    </div>
  );
}
