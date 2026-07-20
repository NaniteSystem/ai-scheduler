import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

// Voice input: Capacitor plugin on native builds, Web Speech API in supported
// browsers. Recognition is inherently platform-dependent, so errors are
// normalised and shown to the person instead of failing silently.

const LOCALES: Record<string, string> = { en: 'en-US', ru: 'ru-RU', ja: 'ja-JP' };

type WebRecognition = { start(): void; stop(): void; abort(): void } & Record<string, any>;
const webCtor = (): (new () => WebRecognition) | null =>
  (typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) || null;

export type VoiceErrorCode = 'permission' | 'unsupported' | 'network' | 'no-speech' | 'unavailable';

export function voiceErrorCode(error: unknown): VoiceErrorCode {
  const value = typeof error === 'string'
    ? error.toLowerCase()
    : String((error as { error?: string; message?: string } | undefined)?.error || (error as { message?: string } | undefined)?.message || error || '').toLowerCase();
  if (value.includes('permission') || value.includes('not-allowed') || value.includes('service-not-allowed')) return 'permission';
  if (value.includes('unsupported') || value.includes('not implemented')) return 'unsupported';
  if (value.includes('network') || value.includes('service')) return 'network';
  if (value.includes('no-speech') || value.includes('no speech')) return 'no-speech';
  return 'unavailable';
}

export function voiceAvailable(): boolean {
  return Capacitor.isNativePlatform() || !!webCtor();
}

export interface VoiceSession {
  stop: () => void;
}

/**
 * Starts one recognition session. `onFinal` or `onError` is called exactly
 * once, which prevents Web Speech's error → end sequence from overwriting an
 * error with an empty transcript.
 */
export async function startVoice(
  lang: string,
  cb: { onPartial?: (text: string) => void; onFinal: (text: string) => void; onError: (e: unknown) => void },
): Promise<VoiceSession | null> {
  const locale = LOCALES[lang] || 'en-US';

  if (Capacitor.isNativePlatform()) {
    try {
      const perm = await SpeechRecognition.requestPermissions();
      if (perm.speechRecognition !== 'granted') {
        cb.onError('permission');
        return null;
      }
      const availability = await SpeechRecognition.available();
      if (!availability.available) {
        cb.onError('unsupported');
        return null;
      }

      let settled = false;
      let partial: Awaited<ReturnType<typeof SpeechRecognition.addListener>> | undefined;
      let listening: Awaited<ReturnType<typeof SpeechRecognition.addListener>> | undefined;
      let latestText = '';
      let requestedStop = false;
      const cleanup = () => { partial?.remove(); listening?.remove(); };
      const finish = (text: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        const transcript = text.trim();
        if (transcript) cb.onFinal(transcript);
        else cb.onError('no-speech');
      };
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        cb.onError(error);
      };

      partial = await SpeechRecognition.addListener('partialResults', (data: any) => {
        const text = data?.matches?.[0];
        if (typeof text === 'string') {
          latestText = text;
          cb.onPartial?.(text);
        }
      });
      listening = await SpeechRecognition.addListener('listeningState', (data: any) => {
        // With partialResults the native plugin resolves start() immediately;
        // the transcript arrives through events and must be settled only after
        // Android stops listening (normally after silence or Stop).
        if (data?.status === 'stopped') finish(latestText);
      });
      await SpeechRecognition.start({ language: locale, maxResults: 1, partialResults: true, popup: false });
      return { stop: () => {
        if (requestedStop || settled) return;
        requestedStop = true;
        SpeechRecognition.stop().catch(fail);
      } };
    } catch (error) {
      cb.onError(error);
      return null;
    }
  }

  const Ctor = webCtor();
  if (!Ctor) {
    cb.onError('unsupported');
    return null;
  }

  const recognition = new Ctor();
  recognition.lang = locale;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  let final = '';
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    cb.onFinal(final.trim());
  };
  const fail = (error: unknown) => {
    if (settled) return;
    settled = true;
    cb.onError(error);
  };
  recognition.onresult = (event: any) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const text = event.results[i][0].transcript;
      if (event.results[i].isFinal) final += text;
      else interim += text;
    }
    cb.onPartial?.(final + interim);
  };
  recognition.onerror = (event: any) => {
    if (event?.error !== 'aborted') fail(event?.error || event);
  };
  recognition.onend = finish;
  try {
    recognition.start();
  } catch (error) {
    fail(error);
    return null;
  }
  return { stop: () => { try { recognition.stop(); } catch { /* browser already ended */ } } };
}
