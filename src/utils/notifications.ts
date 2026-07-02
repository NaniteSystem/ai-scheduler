import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Session, GTDTask, Habit } from '../types';
import { useStore, habitDueOn } from '../store';
import { translate, type Lang } from '../i18n';

const isNative = () => Capacitor.isNativePlatform();

// Stable positive 31-bit numeric id derived from a session id string.
function notifId(sessionId: string): number {
  let h = 0;
  for (let i = 0; i < sessionId.length; i++) h = (h * 31 + sessionId.charCodeAt(i)) | 0;
  return Math.abs(h) % 2147483646 + 1;
}

const TIMER_NOTIFICATION_IDS = new Set([99001, 99002]);

function reminderTime(s: Session): Date | null {
  if (s.reminderMinutes == null || s.reminderMinutes < 0) return null;
  if (s.allDay) {
    // For all-day events, fire at 09:00 on the day, minus reminder offset.
    const [y, m, d] = s.date.split('-').map(Number);
    const t = new Date(y, m - 1, d, 9, 0, 0, 0);
    t.setMinutes(t.getMinutes() - s.reminderMinutes);
    return t;
  }
  const [y, m, d] = s.date.split('-').map(Number);
  const t = new Date(y, m - 1, d, s.startHour, s.startMinute || 0, 0, 0);
  t.setMinutes(t.getMinutes() - s.reminderMinutes);
  return t;
}

export async function ensureNotifPermission(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') perm = await LocalNotifications.requestPermissions();
    return perm.display === 'granted';
  } catch {
    return false;
  }
}

/**
 * Re-sync every scheduled reminder to match the current sessions and tasks.
 * Cancels all app-scheduled notifications, then schedules future ones that
 * have a reminder set and are not done. Safe to call on any data change.
 */
/**
 * Upcoming habit reminders: for each active habit with a reminderTime, schedule
 * one-off notifications on its next due days (so all recurrence rules work). We
 * cap the look-ahead per habit to keep the total under the OS pending limit.
 */
function habitReminderNotifs(habits: Habit[], now: number, lang: Lang, lookAheadDays = 14, maxPerHabit = 7) {
  const out: { id: number; title: string; body: string; schedule: { at: Date; allowWhileIdle: boolean } }[] = [];
  for (const h of habits) {
    if (h.archived || !h.reminderTime) continue;
    const [hh, mm] = h.reminderTime.split(':').map(Number);
    if (isNaN(hh) || isNaN(mm)) continue;
    let scheduled = 0;
    for (let i = 0; i < lookAheadDays && scheduled < maxPerHabit; i++) {
      const day = new Date();
      day.setDate(day.getDate() + i);
      day.setHours(hh, mm, 0, 0);
      if (day.getTime() <= now) continue;
      if (!habitDueOn(h, day)) continue;
      out.push({
        id: notifId(`habit:${h.id}:${i}`),
        title: `${h.emoji || '✅'} ${h.title}`,
        body: translate(lang, 'notif.habit'),
        schedule: { at: new Date(day), allowWhileIdle: true },
      });
      scheduled++;
    }
  }
  return out;
}

export async function syncReminders(sessions: Session[], tasks: GTDTask[] = [], habits: Habit[] = []): Promise<void> {
  if (!isNative()) return;
  try {
    const granted = await ensureNotifPermission();
    if (!granted) return;

    const pending = await LocalNotifications.getPending();
    const appReminders = pending.notifications.filter(n => !TIMER_NOTIFICATION_IDS.has(n.id));
    if (appReminders.length) {
      await LocalNotifications.cancel({ notifications: appReminders.map(n => ({ id: n.id })) });
    }

    const lang = useStore.getState().lang;
    const now = Date.now();
    const toSchedule = sessions
      .filter(s => s.status !== 'done')
      .map(s => ({ s, at: reminderTime(s) }))
      .filter((x): x is { s: Session; at: Date } => !!x.at && x.at.getTime() > now)
      .map(({ s, at }) => ({
        id: notifId(s.id),
        title: s.title || translate(lang, 'notif.session'),
        body: s.allDay
          ? translate(lang, 'notif.today')
          : translate(lang, 'notif.at', { time: `${String(s.startHour).padStart(2, '0')}:${String(s.startMinute || 0).padStart(2, '0')}` }),
        schedule: { at, allowWhileIdle: true },
      }));

    // Task reminders (explicit remindAt datetime).
    const taskNotifs = tasks
      .filter((t) => t.remindAt && t.status !== 'done' && t.status !== 'trash')
      .map((t) => ({ t, at: new Date(t.remindAt as string) }))
      .filter((x) => !isNaN(x.at.getTime()) && x.at.getTime() > now)
      .map(({ t, at }) => ({
        id: notifId(`task:${t.id}`),
        title: t.title || translate(lang, 'notif.session'),
        body: translate(lang, 'notif.at', { time: `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}` }),
        schedule: { at, allowWhileIdle: true },
      }));

    const habitNotifs = useStore.getState().habitRemindersEnabled ? habitReminderNotifs(habits, now, lang) : [];

    const all = [...toSchedule, ...taskNotifs, ...habitNotifs];
    if (all.length) {
      await LocalNotifications.schedule({ notifications: all });
    }
  } catch {
    /* notifications are best-effort */
  }
}
