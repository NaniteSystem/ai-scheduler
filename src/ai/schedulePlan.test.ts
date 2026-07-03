// Assembler precision tests: whatever the AI strategy says, blocks must never
// overlap, must stay inside the waking window, and must flow around existing
// calendar sessions. Run: node --experimental-strip-types src/ai/schedulePlan.test.ts
import assert from 'node:assert/strict';
import { assemble, type AiStrategy } from './schedulePlan.ts';
import type { PlanInput } from '../types.ts';

const prefs = {
  wakeTime: '07:00', sleepTime: '23:00', fasting: false,
  workStart: '09:00', workEnd: '17:00', hasWork: false,
  productivityPeak: 'morning' as const, weekStartsOn: 1 as const,
  lifeBlocks: [],
};

const goal = {
  id: 'g1', title: 'Japanese N2', category: 'language', emoji: '🎓', color: '#f43f5e',
  priority: 1, totalHoursEstimated: 120, hoursPerWeekTarget: 5,
  sessionsCompleted: 0, sessionsTotal: 0, hoursLogged: 0, milestones: [], metadata: {},
} as any;

// Mon 2026-07-06 … Sun 2026-07-12
const input: PlanInput = {
  range: { start: '2026-07-06', end: '2026-07-12' },
  prefs: prefs as any,
  goals: [goal],
  habits: [],
  tasks: [{ id: 't1', title: 'Call dentist', priority: 1, status: 'next', createdAt: '2026-07-01', durationMinutes: 30 } as any],
  sessions: [
    // existing session Mon 09:00-10:00 — the AI wants the same slot; assembler must dodge it
    { id: 's-ex', goalId: '', date: '2026-07-06', startHour: 9, startMinute: 0, durationMinutes: 60, title: 'Existing', description: '', tasks: [], sessionType: 'regular', status: 'planned' } as any,
  ],
  options: { includeGoals: true, includeHabits: true, includeRecurring: true, includeTasks: true },
  lang: 'en',
};

const strategy: AiStrategy = {
  advice: 'Mornings for study.',
  goals: [{ id: 'g1', weekdays: [1, 3, 99, 1], start: '09:00', durationMin: 60, topics: ['Hiragana review', 'Kanji radicals'], reason: 'peak focus' }],
  tasks: [
    { id: 't1', date: '2026-07-06', time: '05:00' },        // before wake → clamped
    { id: 'ghost', date: '2026-07-07' },                     // hallucinated id → dropped
  ],
};

const plan = assemble(input, strategy);

// 1. Range covered
assert.equal(plan.days.length, 7);
assert.equal(plan.providerId, 'ai');
assert.equal(plan.advice, 'Mornings for study.');

// 2. No overlaps on any day; everything inside 07:00–23:00
for (const day of plan.days) {
  const timed = day.blocks.filter(b => !b.locked).sort((a, b) => a.startMinutes - b.startMinutes);
  for (let i = 1; i < timed.length; i++) {
    const prev = timed[i - 1];
    assert.ok(timed[i].startMinutes >= prev.startMinutes + prev.durationMinutes,
      `overlap on ${day.date}: ${prev.title} vs ${timed[i].title}`);
  }
  for (const b of timed) {
    assert.ok(b.startMinutes >= 7 * 60 && b.startMinutes + b.durationMinutes <= 23 * 60,
      `outside waking window on ${day.date}: ${b.title}`);
  }
}

// 3. Goal sessions only on Monday(1) and Wednesday(3); weekday 99 ignored
const goalDays = plan.days.filter(d => d.blocks.some(b => b.sourceId === 'g1')).map(d => d.date);
assert.deepEqual(goalDays, ['2026-07-06', '2026-07-08']);

// 4. Monday goal session dodges the existing 09:00-10:00 session
const mon = plan.days[0].blocks.find(b => b.sourceId === 'g1')!;
assert.ok(mon.startMinutes >= 10 * 60, `expected shift past existing session, got ${mon.startMinutes}`);

// 5. Roadmap topics become session titles in order
assert.ok(mon.title.includes('Hiragana review'), mon.title);
const wed = plan.days[2].blocks.find(b => b.sourceId === 'g1')!;
assert.ok(wed.title.includes('Kanji radicals'), wed.title);

// 6. Task placed on Monday, clamped into the waking window; ghost id dropped
const t1 = plan.days[0].blocks.find(b => b.sourceId === 't1')!;
assert.ok(t1.startMinutes >= 7 * 60, 'task clamped to wake');
assert.ok(!plan.days.some(d => d.blocks.some(b => b.sourceId === 'ghost')));

console.log('schedulePlan.test.ts: all assertions passed');
