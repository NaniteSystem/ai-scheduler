import { parseCsv, tasksFromCsv } from './importCsv.ts';

let failures = 0;
function ok(cond: boolean, label: string) {
  if (!cond) { failures++; console.error(`FAIL ${label}`); }
}
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failures++; console.error(`FAIL ${label}: got ${a}, want ${e}`); }
}

// ── parseCsv ──
eq(parseCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']], 'simple');
eq(parseCsv('a,"b,c"\n"x""y",z'), [['a', 'b,c'], ['x"y', 'z']], 'quotes');
eq(parseCsv('a,"multi\nline",c'), [['a', 'multi\nline', 'c']], 'embedded newline');

// ── Todoist ──
const todoist = `TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE
task,Buy milk,From the corner shop,4,1,Me (123),,2026-07-20,en,Europe/Moscow
task,Sub item,,1,2,Me (123),,,en,
note,Some note,,,1,,,,en,
task,"Email boss, urgently",,3,1,Me (123),,20 Jul 2026,en,
`;
const td = tasksFromCsv(todoist)!;
eq(td.length, 2, 'todoist: 2 top tasks');
eq(td[0].title, 'Buy milk', 'todoist title');
eq(td[0].priority, 1, 'todoist P4→P1');
eq(td[0].dueDate, '2026-07-20', 'todoist iso date');
eq(td[0].notes, 'From the corner shop', 'todoist notes');
eq(td[0].subtasks?.length, 1, 'todoist subtask attached');
eq(td[0].subtasks?.[0].title, 'Sub item', 'todoist subtask title');
eq(td[1].title, 'Email boss, urgently', 'todoist quoted comma');
eq(td[1].priority, 2, 'todoist 3→P2');
ok(!!td[1].dueDate, 'todoist natural date parsed');

// ── TickTick ──
const ticktick = `"Date: 2026-07-08+0000"
"Version: 7.1"
"Status: 0 Normal, 1 Completed, 2 Archived"
"Folder Name","List Name","Title","Kind","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone"
,Inbox,Water plants,TEXT,"home, chores",Every shelf,N,,2026-07-15T09:00:00+0000,,,5,0,2026-07-01,,1,Europe/Moscow
,Inbox,Old done task,TEXT,,,N,,,,,0,2,2026-07-01,2026-07-02,2,Europe/Moscow
,Work,Prepare slides,TEXT,,,N,,,,,3,0,2026-07-01,,3,Europe/Moscow
`;
const tt = tasksFromCsv(ticktick)!;
eq(tt.length, 2, 'ticktick: open tasks only');
eq(tt[0].title, 'Water plants', 'ticktick title');
eq(tt[0].priority, 1, 'ticktick 5→P1');
eq(tt[0].dueDate, '2026-07-15', 'ticktick due date');
eq(tt[0].tags, ['home', 'chores'], 'ticktick tags');
eq(tt[0].project, 'Inbox', 'ticktick list→project');
eq(tt[1].priority, 2, 'ticktick 3→P2');

// unknown format
eq(tasksFromCsv('foo,bar\n1,2'), null, 'unknown format → null');

if (failures) { console.error(`importCsv.test.ts: ${failures} failure(s)`); process.exit(1); }
console.log('importCsv.test.ts: all assertions passed');
