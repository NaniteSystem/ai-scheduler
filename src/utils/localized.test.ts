import assert from 'node:assert/strict';
import { lt, normLT } from './localized.ts';

// lt: plain string passes through (old goals + AI-returned-as-string)
assert.equal(lt('hello', 'en'), 'hello');
assert.equal(lt('привет', 'ja'), 'привет');

// lt: object picks the requested language
assert.equal(lt({ en: 'Read', ru: 'Читать', ja: '読む' }, 'ru'), 'Читать');

// lt: partial-language fallback -> en, then any available
assert.equal(lt({ en: 'Read', ru: 'Читать' }, 'ja'), 'Read');
assert.equal(lt({ ru: 'Читать' }, 'ja'), 'Читать');

// lt: nullish -> empty string
assert.equal(lt(undefined, 'en'), '');

// normLT: string trimmed-empty -> undefined, else kept
assert.equal(normLT('  '), undefined);
assert.equal(normLT('hi'), 'hi');

// normLT: object keeps only non-empty en/ru/ja keys
assert.deepEqual(normLT({ en: 'A', ru: '', ja: 'C', xx: 'D' }), { en: 'A', ja: 'C' });

// normLT: empty object -> undefined
assert.equal(normLT({ en: '', ru: '  ' }), undefined);
assert.equal(normLT(42), undefined);

console.log('localized.test.ts: all assertions passed');
