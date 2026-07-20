import assert from 'node:assert/strict';
import { isDateKey, localDateKey } from './date.ts';

assert.equal(localDateKey(new Date(2026, 6, 12, 0, 5)), '2026-07-12');
assert.equal(localDateKey(new Date(2026, 0, 2, 23, 59)), '2026-01-02');
assert.equal(isDateKey('2024-02-29'), true);
assert.equal(isDateKey('2025-02-29'), false);
assert.equal(isDateKey('2026-13-01'), false);

console.log('date.test.ts: all assertions passed');
