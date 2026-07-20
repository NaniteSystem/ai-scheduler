import type { GTDTask, Priority } from '../types';
import { createId } from '../domain/id.ts';

// ─── CSV import from Todoist / TickTick exports ─────────────────────────────

/** Minimal RFC-4180 CSV parser (quoted fields, embedded commas/newlines/quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); if (row.some(c => c.trim() !== '')) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') pushField();
    else if (c === '\n') pushRow();
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) pushRow();
  return rows;
}

export interface ImportedTask {
  title: string;
  notes?: string;
  priority: Priority;
  dueDate?: string;
  tags?: string[];
  project?: string;
  subtasks?: { id: string; title: string; done: boolean }[];
}

const toDate = (raw: string): string | undefined => {
  const s = (raw || '').trim();
  if (!s) return undefined;
  // Prefer an explicit yyyy-mm-dd anywhere in the string; else let Date try.
  const iso = s.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  return undefined;
};

const rid = () => createId('import');

/** Detect the source app and convert its CSV export into importable tasks. */
export function tasksFromCsv(text: string): ImportedTask[] | null {
  const rows = parseCsv(text);
  if (!rows.length) return null;
  // Todoist/TickTick backups may start with junk lines — find the header row.
  const headerIdx = rows.findIndex(r => {
    const low = r.map(c => c.trim().toLowerCase());
    return (low.includes('type') && low.includes('content')) || low.includes('title');
  });
  if (headerIdx === -1) return null;
  const header = rows[headerIdx].map(c => c.trim().toLowerCase());
  const body = rows.slice(headerIdx + 1);
  const col = (name: string) => header.indexOf(name);

  if (col('type') !== -1 && col('content') !== -1) {
    // ── Todoist template/export ──
    const iType = col('type'), iContent = col('content'), iDesc = col('description'),
      iPrio = col('priority'), iIndent = col('indent'), iDate = col('date');
    const out: ImportedTask[] = [];
    for (const r of body) {
      if ((r[iType] || '').trim().toLowerCase() !== 'task') continue;
      const title = (r[iContent] || '').trim();
      if (!title) continue;
      const indent = iIndent !== -1 ? parseInt(r[iIndent]) || 1 : 1;
      if (indent > 1 && out.length) {
        (out[out.length - 1].subtasks ||= []).push({ id: rid(), title, done: false });
        continue;
      }
      // Todoist API convention: 4 = urgent … 1 = none
      const p = iPrio !== -1 ? parseInt(r[iPrio]) || 1 : 1;
      out.push({
        title,
        notes: iDesc !== -1 ? (r[iDesc] || '').trim() || undefined : undefined,
        priority: (5 - Math.min(Math.max(p, 1), 4)) as Priority,
        dueDate: iDate !== -1 ? toDate(r[iDate]) : undefined,
      });
    }
    return out;
  }

  if (col('title') !== -1) {
    // ── TickTick backup ──
    const iTitle = col('title'), iContent = col('content'), iPrio = col('priority'),
      iDue = col('due date'), iStatus = col('status'), iTags = col('tags'), iList = col('list name');
    const out: ImportedTask[] = [];
    for (const r of body) {
      const title = (r[iTitle] || '').trim();
      if (!title) continue;
      if (iStatus !== -1 && (r[iStatus] || '').trim() === '2') continue; // completed
      // TickTick: 0 none, 1 low, 3 medium, 5 high
      const p = iPrio !== -1 ? parseInt(r[iPrio]) || 0 : 0;
      const priority: Priority = p >= 5 ? 1 : p >= 3 ? 2 : p >= 1 ? 3 : 4;
      out.push({
        title,
        notes: iContent !== -1 ? (r[iContent] || '').trim() || undefined : undefined,
        priority,
        dueDate: iDue !== -1 ? toDate(r[iDue]) : undefined,
        tags: iTags !== -1 && (r[iTags] || '').trim() ? r[iTags].split(/[,;]/).map(s => s.trim()).filter(Boolean) : undefined,
        project: iList !== -1 ? (r[iList] || '').trim() || undefined : undefined,
      });
    }
    return out;
  }

  return null;
}

/** Build full GTDTask objects (status: inbox) from imported rows. */
export function toGTDTasks(items: ImportedTask[]): GTDTask[] {
  const now = new Date().toISOString();
  return items.map(it => ({
    id: rid(),
    title: it.title,
    notes: it.notes,
    status: 'inbox' as const,
    priority: it.priority,
    createdAt: now,
    dueDate: it.dueDate,
    tags: it.tags || [],
    project: it.project,
    subtasks: it.subtasks,
  }));
}
