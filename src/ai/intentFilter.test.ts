import assert from 'node:assert/strict';
import { isObviouslyNonsenseIntent } from './intentFilter.ts';

// Obvious junk → filtered (no LLM call).
for (const junk of ['', '   ', 'a', '123', '111111', '????', '...', '🔥🔥🔥', 'aaaa', '!!!!', 'asdf', 'qwerty', 'test', 'HELLO', 'фывапролдж', '  фыва ']) {
  assert.equal(isObviouslyNonsenseIntent(junk), true, `expected nonsense: ${JSON.stringify(junk)}`);
}

// Real (incl. short) goals → must pass through to the LLM.
for (const goal of ['guitar', 'React', 'IELTS', 'lose weight', 'start running', 'learn Japanese', 'учить английский', '日本語', '日本語を学ぶ', 'go vegan', 'CS50']) {
  assert.equal(isObviouslyNonsenseIntent(goal), false, `expected real goal: ${JSON.stringify(goal)}`);
}

// Whitespace around a real goal is normalized, not rejected.
assert.equal(isObviouslyNonsenseIntent('  learn   guitar  '), false);

console.log('intentFilter.test.ts: all assertions passed');
