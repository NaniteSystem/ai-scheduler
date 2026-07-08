import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

// ─── Voice input: native plugin on Android, Web Speech API elsewhere ────────

const LOCALES: Record<string, string> = { en: 'en-US', ru: 'ru-RU', ja: 'ja-JP' };

type WebRecognition = { start(): void; stop(): void; abort(): void } & Record<string, any>;
const webCtor = (): (new () => WebRecognition) | null =>
  (typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) || null;

export function voiceAvailable(): boolean {
  return Capacitor.isNativePlatform() || !!webCtor();
}

export interface VoiceSession {
  stop: () => void;
}

/**
 * Start listening. Calls onPartial with interim text, onFinal exactly once
 * with the recognized phrase (or '' on abort), onError on failure.
 */
export async function startVoice(
  lang: string,
  cb: { onPartial?: (text: string) => void; onFinal: (text: string) => void; onError: (e: unknown) => void },
): Promise<VoiceSession | null> {
  const locale = LOCALES[lang] || 'en-US';

  if (Capacitor.isNativePlatform()) {
    try {
      const perm = await SpeechRecognition.requestPermissions();
      if (perm.speechRecognition !== 'granted') { cb.onError('permission'); return null; }
      let finished = false;
      const finish = (text: string) => { if (!finished) { finished = true; cb.onFinal(text); } };
      const partial = await SpeechRecognition.addListener('partialResults', (d: any) => {
        const t = d?.matches?.[0];
        if (typeof t === 'string') cb.onPartial?.(t);
      });
      const state = await SpeechRecognition.addListener('listeningState', (d: any) => {
        if (d?.status === 'stopped') setTimeout(() => finish(''), 250);
      });
      SpeechRecognition.start({ language: locale, maxResults: 1, partialResults: true, popup: false })
        .then((res: any) => finish(res?.matches?.[0] || ''))
        .catch((e: unknown) => { if (!finished) { finished = true; cb.onError(e); } });
      const cleanup = () => { partial.remove(); state.remove(); };
      const origFinal = cb.onFinal;
      cb.onFinal = (t) => { cleanup(); origFinal(t); };
      return { stop: () => { SpeechRecognition.stop().catch(() => {}); } };
    } catch (e) {
      cb.onError(e);
      return null;
    }
  }

  const Ctor = webCtor();
  if (!Ctor) { cb.onError('unsupported'); return null; }
  const rec = new Ctor();
  rec.lang = locale;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  let final = '';
  rec.onresult = (e: any) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t;
      else interim += t;
    }
    cb.onPartial?.(final + interim);
  };
  rec.onerror = (e: any) => { if (e?.error !== 'aborted') cb.onError(e?.error || e); };
  rec.onend = () => cb.onFinal(final.trim());
  try { rec.start(); } catch (e) { cb.onError(e); return null; }
  return { stop: () => { try { rec.stop(); } catch { /* noop */ } } };
}
