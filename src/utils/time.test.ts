import assert from 'node:assert/strict';
import { formatClock } from './time.ts';

assert.equal(formatClock(0, 'en'), '12:00 AM');
assert.equal(formatClock(13 * 60 + 5, 'en'), '1:05 PM');
assert.equal(formatClock(13 * 60 + 5, 'ru'), '13:05');
assert.equal(formatClock(-15, 'ja'), '23:45');

console.log('time.test.ts: all assertions passed');
