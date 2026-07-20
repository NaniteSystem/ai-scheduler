import assert from 'node:assert/strict';
import { createId } from './id.ts';

const ids = new Set(Array.from({ length: 2_000 }, () => createId('test')));
assert.equal(ids.size, 2_000, 'ids must stay unique under a burst of writes');
assert.ok([...ids].every(id => id.startsWith('test-')));

console.log('id.test.ts: all assertions passed');

