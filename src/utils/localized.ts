import type { LocalizedText } from '../types';

type Lang = 'en' | 'ru' | 'ja';

/** Resolve a LocalizedText to the current language with fallback. */
export function lt(v: LocalizedText | undefined, lang: Lang): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return v[lang] ?? v.en ?? v.ru ?? v.ja ?? '';
}

/** Normalize an AI value into LocalizedText, or undefined if empty.
 *  Accepts a plain string (model ignored multilingual) or an {en,ru,ja} object. */
export function normLT(v: unknown): LocalizedText | undefined {
  if (typeof v === 'string') return v.trim() ? v : undefined;
  if (v && typeof v === 'object') {
    const o: Partial<Record<Lang, string>> = {};
    for (const k of ['en', 'ru', 'ja'] as const) {
      const val = (v as Record<string, unknown>)[k];
      if (typeof val === 'string' && val.trim()) o[k] = val;
    }
    return Object.keys(o).length ? o : undefined;
  }
  return undefined;
}
