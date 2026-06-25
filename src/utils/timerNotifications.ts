import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { FocusTimer } from '../types';
import { useStore } from '../store';
import { translate, type Lang } from '../i18n';

const isNative = () => Capacitor.isNativePlatform();

// Fixed notification ids reserved for the focus timer.
const ONGOING_ID = 99001;   // persistent "running / paused" notification in the shade
const DONE_ID = 99002;      // fires when a countdown reaches zero

let actionsRegistered = false;
let listenerAttached = false;

function elapsedMs(ft: FocusTimer): number {
  return ft.accumulatedMs + (ft.running ? Date.now() - ft.startedAt : 0);
}

function clockLabel(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Register the pause/resume/stop action buttons once (native only). */
export async function registerTimerActions(): Promise<void> {
  if (!isNative() || actionsRegistered) return;
  try {
    const lang = useStore.getState().lang;
    await LocalNotifications.registerActionTypes({
      types: [
        { id: 'FOCUS_RUNNING', actions: [
          { id: 'pause', title: translate(lang, 'timer.pause') },
          { id: 'stop', title: translate(lang, 'timer.stop') },
        ] },
        { id: 'FOCUS_PAUSED', actions: [
          { id: 'resume', title: translate(lang, 'timer.resume') },
          { id: 'stop', title: translate(lang, 'timer.stop') },
        ] },
      ],
    });
    actionsRegistered = true;
  } catch { /* best-effort */ }
}

/** Wire notification action buttons to the store. Call once on app start. */
export async function initTimerActionListener(): Promise<void> {
  if (!isNative() || listenerAttached) return;
  listenerAttached = true;
  try {
    await LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
      if (e.notification.id !== ONGOING_ID) return;
      const st = useStore.getState();
      if (e.actionId === 'pause') st.pauseTimer();
      else if (e.actionId === 'resume') st.resumeTimer();
      else if (e.actionId === 'stop') st.stopTimer(false);
    });
  } catch { /* best-effort */ }
}

/**
 * Reconcile the OS notifications with the current timer state. Called whenever
 * the timer changes. Shows an ongoing notification while a timer runs/pauses
 * (with Pause/Resume + Stop buttons), and schedules a one-off completion alert
 * at the end of a countdown so it fires even if the app is backgrounded/killed.
 */
export async function syncTimerNotification(ft: FocusTimer | null): Promise<void> {
  if (!isNative()) return;
  try {
    // No active timer (or finished/awaiting confirm) → clear everything.
    if (!ft || ft.finished) {
      await LocalNotifications.cancel({ notifications: [{ id: ONGOING_ID }, { id: DONE_ID }] });
      return;
    }
    await registerTimerActions();
    const lang = useStore.getState().lang;
    const remainingMs = ft.targetMinutes * 60000 - elapsedMs(ft);

    let body: string;
    if (ft.mode === 'countdown') {
      body = ft.running
        ? translate(lang, 'timer.notifEndsAt', { time: hhmm(new Date(Date.now() + remainingMs)) })
        : translate(lang, 'timer.notifPausedLeft', { time: clockLabel(remainingMs) });
    } else {
      body = ft.running
        ? translate(lang, 'timer.notifRunning')
        : translate(lang, 'timer.notifPausedElapsed', { time: clockLabel(elapsedMs(ft)) });
    }

    await LocalNotifications.schedule({
      notifications: [{
        id: ONGOING_ID,
        title: ft.label || translate(lang, 'timer.focus'),
        body,
        ongoing: true,
        autoCancel: false,
        actionTypeId: ft.running ? 'FOCUS_RUNNING' : 'FOCUS_PAUSED',
        schedule: { at: new Date(Date.now() + 300) },
      }],
    });

    // Completion alarm for a running countdown.
    if (ft.mode === 'countdown' && ft.running && remainingMs > 0) {
      await LocalNotifications.schedule({
        notifications: [{
          id: DONE_ID,
          title: translate(lang, 'timer.doneTitle'),
          body: ft.label || translate(lang, 'timer.focus'),
          schedule: { at: new Date(Date.now() + remainingMs), allowWhileIdle: true },
        }],
      });
    } else {
      await LocalNotifications.cancel({ notifications: [{ id: DONE_ID }] });
    }
  } catch { /* best-effort */ }
}

let audioCtx: AudioContext | null = null;

/** Short chime via Web Audio — works on web and as an in-app cue on native. */
function playChime() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    const ctx = audioCtx;
    const notes = [880, 1108, 1318];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.34);
    });
  } catch { /* no audio available */ }
}

/** Request web Notification permission (no-op on native — handled by LocalNotifications). */
export function ensureWebNotifPermission() {
  if (isNative()) return;
  try {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  } catch { /* ignore */ }
}

/** Fire the completion cue when a countdown hits zero (called from the timer bar). */
export function notifyTimerComplete(label: string, lang: Lang) {
  playChime();
  if (isNative()) return; // native completion handled by the scheduled DONE_ID alarm
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(translate(lang, 'timer.doneTitle'), { body: label || translate(lang, 'timer.focus') });
    }
  } catch { /* ignore */ }
}
