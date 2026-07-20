import assert from 'node:assert/strict';
import { parseTaskCapture } from './taskCapture.ts';

const parsed = parseTaskCapture('Call dentist p1 @phone 30m #health');
assert.equal(parsed.title, 'Call dentist');
assert.equal(parsed.priority, 1);
assert.equal(parsed.context, '@phone');
assert.equal(parsed.durationMinutes, 30);
assert.deepEqual(parsed.tags, ['health']);

const russian = parseTaskCapture('Позвонить врачу завтра 2 часа #здоровье');
assert.equal(russian.title, 'Позвонить врачу');
assert.equal(russian.durationMinutes, 120);
assert.deepEqual(russian.tags, ['здоровье']);
assert.ok(russian.dueDate);

console.log('taskCapture.test.ts: all assertions passed');
