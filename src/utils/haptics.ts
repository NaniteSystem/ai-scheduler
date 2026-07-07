import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

const canVibrate = () => Capacitor.isNativePlatform() || (typeof navigator !== 'undefined' && 'vibrate' in navigator);

/** Light tick — button presses, toggles, swipe thresholds. */
export async function hapticTick() {
  if (!canVibrate()) return;
  try { await Haptics.impact({ style: ImpactStyle.Light }); } catch { /* web without vibrate — ignore */ }
}

/** Success buzz — completing a task/habit/session. */
export async function hapticSuccess() {
  if (!canVibrate()) return;
  try { await Haptics.notification({ type: NotificationType.Success }); } catch { /* ignore */ }
}
