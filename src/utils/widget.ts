import { Capacitor, registerPlugin } from '@capacitor/core';
import { format } from 'date-fns';
import { ru, ja } from 'date-fns/locale';
import type { Session, GTDTask, Habit } from '../types';
import { useStore, habitDueOn } from '../store';
import { translate } from '../i18n';

interface WidgetBridgePlugin {
  setToday(opts: { date: string; lines: string; empty: string }): Promise<void>;
}

const WidgetBridge = registerPlugin<WidgetBridgePlugin>('WidgetBridge');

const pad = (n: number) => String(n).padStart(2, '0');

/** Push a snapshot of today's agenda to the Android home-screen widget. Best-effort no-op on web. */
export async function syncWidget(sessions: Session[], tasks: GTDTask[], habits: Habit[]): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const lang = useStore.getState().lang;
    const now = new Date();
    const todayKey = format(now, 'yyyy-MM-dd');
    const items: string[] = [];

    const timed = sessions
      .filter(s => s.date === todayKey && !s.allDay && s.status !== 'done' && Number.isFinite(s.startHour))
      .sort((a, b) => (a.startHour * 60 + (a.startMinute || 0)) - (b.startHour * 60 + (b.startMinute || 0)));
    for (const s of timed) items.push(`${pad(s.startHour)}:${pad(s.startMinute || 0)}  ${s.title}`);

    const due = tasks.filter(t =>
      t.status !== 'done' && t.status !== 'trash' && !t.isArchived &&
      (t.isTodayFocus || (t.dueDate && t.dueDate.slice(0, 10) <= todayKey)));
    for (const t of due) items.push(`•  ${t.title}`);

    for (const h of habits) {
      if (h.archived || !habitDueOn(h, now)) continue;
      if (h.log[todayKey]?.status === 'done') continue;
      items.push(`${h.emoji || '✓'}  ${h.title}`);
    }

    const lines = items.slice(0, 7).join('\n') + (items.length > 7 ? `\n+${items.length - 7}…` : '');
    const locale = lang === 'ru' ? ru : lang === 'ja' ? ja : undefined;
    await WidgetBridge.setToday({
      date: format(now, 'EEEE, d MMM', { locale }),
      lines,
      empty: translate(lang, 'widget.empty'),
    });
  } catch {
    /* widget is best-effort */
  }
}
