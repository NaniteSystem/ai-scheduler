import { extractNLDate } from './nlDate.ts';

// Fixed "now": Wednesday 2026-07-08
const NOW = new Date(2026, 6, 8, 10, 0, 0);

let failures = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failures++; console.error(`FAIL ${label}: got ${a}, want ${e}`); }
}

// relative words
eq(extractNLDate('buy milk today', NOW).dueDate, '2026-07-08', 'today');
eq(extractNLDate('позвонить маме завтра', NOW).dueDate, '2026-07-09', 'завтра');
eq(extractNLDate('послезавтра отчёт', NOW).dueDate, '2026-07-10', 'послезавтра');
eq(extractNLDate('明後日 レポート', NOW).dueDate, '2026-07-10', '明後日');
eq(extractNLDate('report next week', NOW).dueDate, '2026-07-15', 'next week');
eq(extractNLDate('сделать через неделю', NOW).dueDate, '2026-07-15', 'через неделю');

// in N days / weeks
eq(extractNLDate('call plumber in 3 days', NOW).dueDate, '2026-07-11', 'in 3 days');
eq(extractNLDate('через 5 дней стрижка', NOW).dueDate, '2026-07-13', 'через 5 дней');
eq(extractNLDate('in 2 weeks dentist', NOW).dueDate, '2026-07-22', 'in 2 weeks');
eq(extractNLDate('3日後 買い物', NOW).dueDate, '2026-07-11', '3日後');

// weekdays (Wed 8 Jul → Fri 10 Jul; today's weekday resolves to today)
eq(extractNLDate('gym on friday', NOW).dueDate, '2026-07-10', 'on friday');
eq(extractNLDate('зал в пятницу', NOW).dueDate, '2026-07-10', 'в пятницу');
eq(extractNLDate('в среду покупки', NOW).dueDate, '2026-07-08', 'в среду=today');
eq(extractNLDate('金曜日 ジム', NOW).dueDate, '2026-07-10', '金曜日');
const fri = extractNLDate('gym on friday', NOW);
eq(fri.title, 'gym', 'weekday removed from title');

// explicit dates
eq(extractNLDate('vacation 15 july', NOW).dueDate, '2026-07-15', '15 july');
eq(extractNLDate('vacation july 15', NOW).dueDate, '2026-07-15', 'july 15');
eq(extractNLDate('отпуск 15 июля', NOW).dueDate, '2026-07-15', '15 июля');
eq(extractNLDate('запись 20.08', NOW).dueDate, '2026-08-20', '20.08');
eq(extractNLDate('запись 20/08/2027', NOW).dueDate, '2027-08-20', '20/08/2027');
eq(extractNLDate('7月15日 休暇', NOW).dueDate, '2026-07-15', '7月15日');
// past date without year rolls to next year
eq(extractNLDate('meet 5 january', NOW).dueDate, '2027-01-05', 'past → next year');

// time → remindAt
const t1 = extractNLDate('standup tomorrow at 09:30', NOW);
eq(t1.dueDate, '2026-07-09', 'tomorrow+time due');
eq(t1.remindAt, '2026-07-09T09:30', 'tomorrow+time remind');
const t2 = extractNLDate('врач 15 июля в 18:00', NOW);
eq(t2.remindAt, '2026-07-15T18:00', 'дата+время remind');
const t3 = extractNLDate('call mom at 6pm', NOW);
eq(t3.remindAt, '2026-07-08T18:00', '6pm today');
eq(extractNLDate('会議 明日 15時', NOW).remindAt, '2026-07-09T15:00', '15時');

// recurrence
eq(extractNLDate('водичка каждый день', NOW).recurring, 'daily', 'каждый день');
eq(extractNLDate('report every week', NOW).recurring, 'weekly', 'every week');
eq(extractNLDate('rent every month', NOW).recurring, 'monthly', 'every month');
eq(extractNLDate('standup every weekday', NOW).recurring, 'weekdays', 'every weekday');
const ev = extractNLDate('yoga every friday', NOW);
eq(ev.recurring, 'weekly', 'every friday → weekly');
eq(ev.dueDate, '2026-07-10', 'every friday anchors date');
eq(ev.title, 'yoga', 'every friday removed from title');
const evru = extractNLDate('йога каждую пятницу', NOW);
eq(evru.recurring, 'weekly', 'каждую пятницу weekly');
eq(evru.dueDate, '2026-07-10', 'каждую пятницу date');

// title never lost entirely; no date → untouched
eq(extractNLDate('just a task', NOW).dueDate, undefined, 'no date');
eq(extractNLDate('just a task', NOW).title, 'just a task', 'title untouched');
eq(extractNLDate('today', NOW).title, 'today', 'date-only input keeps original title');

if (failures) { console.error(`nlDate.test.ts: ${failures} failure(s)`); process.exit(1); }
console.log('nlDate.test.ts: all assertions passed');
