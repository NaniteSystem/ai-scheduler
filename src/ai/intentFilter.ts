// Conservative, zero-cost pre-filter for obviously meaningless goal input.
// Goal: skip the (slow, paid) LLM call for clear junk like "123", "asdf", "🔥🔥🔥".
// MUST stay conservative — a false positive rejects a real short goal ("React", "日本語"),
// which is worse than letting a borderline case reach the LLM classifier. When unsure, return false.

const PLACEHOLDERS = new Set([
  'test', 'testing', 'hello', 'hi', 'hey', 'abc', 'abcd', 'asdf', 'asdfgh', 'qwerty', 'qwe',
  'asd', 'goal', 'foo', 'bar', 'lorem', 'цель', 'тест', 'привет', 'фыва', 'фывапролдж',
]);

/** True only for input that clearly carries no interpretable goal. Errs toward false. */
export function isObviouslyNonsenseIntent(input: string): boolean {
  const s = (input || '').trim().replace(/\s+/g, ' ');
  if (!s) return true;                              // empty / whitespace only
  if (s.length < 2) return true;                    // a single character can't be a goal

  // No letters at all in any script → digits / punctuation / emoji only ("123", "????", "🔥🔥🔥").
  if (!/\p{L}/u.test(s)) return true;

  // A single character repeated ("aaaa", "!!!!", "ееее").
  if (/^(.)\1{2,}$/u.test(s)) return true;

  // Bare placeholder words with no actual goal ("test", "asdf", "qwerty", "фывапролдж").
  if (PLACEHOLDERS.has(s.toLowerCase())) return true;

  // Everything else (incl. short real goals like "guitar", "React", "IELTS", "日本語",
  // and harder gibberish like "мриыотмкы") goes to the LLM, which judges meaningfulness.
  return false;
}
