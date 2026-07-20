# Projects system research and proposed redesign

Дата: 2026-07-18 01:20 JST
Продукт: AI-scheduler / Nebulla
Поверхность: **Operate + Monitor**. Projects — не декоративные папки; это рабочая поверхность для доведения группы задач до результата и контроля риска.

## Почему текущая логика неправильная

Текущий `Project` в приложении фактически является цветной папкой:

```ts
interface Project {
  id: string;
  title: string;
  color: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt?: string;
}
```

Последствия:

1. Нет формального outcome — пользователь не может ответить «что значит проект завершён?».
2. Нет жизненного цикла кроме active/archived — невозможно различить ideation, planned, in progress, paused, completed, canceled.
3. Нет deadline/target date, поэтому проект не участвует в планировании и рисках.
4. Нет ролей списков: next action, waiting, blocked, scheduled, someday смешаны в обычном task count.
5. Archive используется как суррогат завершения/скрытия, хотя архив — только storage state.
6. Goals и Projects пересекаются неясно: Goal outcome-oriented, Project operational container, но UI этого не объясняет.
7. Project card показывает count/progress, но не помогает выбрать следующее действие.

## Референсы: как это делают другие приложения

### 1. Linear

Источник: `https://linear.app/docs/projects`, `https://linear.app/docs/initiatives`

Ключевая модель:

- Project = unit of work with clear outcome or planned completion date.
- Содержит issues и optional documents.
- Имеет progress graph, notifications, status, priority, labels.
- Initiatives группируют проекты вокруг company objectives и позволяют смотреть progress без drill-down.

Что взять:

- Project должен иметь outcome и planned completion date.
- Progress должен быть не просто done/total, а с риском и статусом.
- Goal/Initiative слой должен быть выше Project, а Project — delivery unit.

Что не брать полностью:

- Heavy B2B roadmap/teams model. Nebulla — personal productivity app, поэтому team fields должны быть optional/absent.

### 2. Todoist

Источник: Todoist Help Center / Projects & Sections docs (`todoist.com/help`).

Ключевая модель:

- Project = список связанных задач.
- Sections делят проект на этапы/категории.
- Tasks могут иметь dates, priorities, labels, filters.
- Пользователь работает не только из проекта, но и через Today/Upcoming/Filters.

Что взять:

- Sections внутри проекта: Backlog / Next / Waiting / Done или пользовательские фазы.
- Project не должен ломать GTD views: Today/Inbox/Next Action остаются главной операционной поверхностью.
- Быстрое добавление задачи в проект должно быть простым.

Что не брать полностью:

- Проекты как простые списки без outcome. Для Nebulla этого мало.

### 3. Things 3

Источник: Cultured Code support article on scheduling, deadlines, projects/areas concepts (`culturedcode.com/things/support`).

Ключевая модель:

- Project = результат, состоящий из to-dos.
- Area = постоянная сфера ответственности, не имеющая финального completion.
- Start date показывает, когда начать; deadline показывает, когда нужно закончить.
- Inactive/future tasks stay out of the way until relevant.

Что взять:

- Развести Project и Area: Project конечен; Area постоянна.
- Развести start date и deadline.
- Future/paused projects не должны шуметь в active work.

Что не брать полностью:

- Закрытую Apple-style структуру без достаточно гибкой фильтрации/AI scheduling.

### 4. ClickUp

Источник: `https://help.clickup.com/hc/en-us/articles/13856392825367-Intro-to-the-Hierarchy`

Ключевая модель:

- Workspace → Spaces → Folders/Subfolders → Lists → Tasks → Subtasks.
- Lists contain tasks that are part of the same project or goal.
- List view может быть создан на любом уровне hierarchy.

Что взять:

- Чёткое различение container hierarchy и view.
- Project/List как operational container; view/filter — отдельный слой.
- Subtasks полезны, но nested complexity нужно ограничить.

Что не брать полностью:

- Слишком глубокую hierarchy. Для Nebulla достаточно Goal/Area → Project → Task/Subtask.

### 5. Basecamp

Источник: `https://basecamp.com/help/3/guides/projects`

Ключевая модель:

- Project — shared workspace around a piece of work.
- Внутри не только tasks: messages/docs/files/schedule/automatic check-ins.
- Project home объясняет контекст и собирает материалы.

Что взять:

- Project home должен содержать brief/notes/links, а не только task list.
- Проекту нужен summary/context block: зачем, definition of done, материалы.

Что не брать полностью:

- Team collaboration modules сейчас избыточны.

### 6. Notion Projects

Источник: Notion product/help pages (`notion.com/product/projects`, Notion projects/tasks guides; часть help pages отдаёт 404/marketing shell, поэтому вывод ограничен общедоступной моделью Notion databases/views).

Ключевая модель:

- Projects и Tasks обычно являются связанными databases.
- Один набор данных показывается как table/board/timeline/calendar.
- Properties позволяют строить разные views под разные вопросы.

Что взять:

- Project should support multiple views over the same data: Overview, Board, Timeline, Review.
- Fields должны быть структурированы, чтобы AI мог планировать и объяснять риски.

Что не брать полностью:

- Arbitrary database builder. Nebulla должен быть opinionated, иначе UX развалится.

### 7. Asana / Trello / Jira / Monday — общие паттерны

Часть официальных страниц блокировала автоматическое извлечение через 403/404/CAPTCHA, но публично известные модели подтверждают общий паттерн:

- Asana: project views list/board/timeline/calendar + milestones/goals.
- Trello: board → lists → cards; lists часто представляют стадии workflow.
- Jira: project contains issues; board/backlog/sprints are views over issues.
- Monday: board → groups → items + columns/statuses.

Что взять:

- Board/list/timeline — это views, не разные данные.
- Status/phase должны быть явным свойством, а archive не должен заменять completion.
- Milestones/checkpoints помогают понять project health.

## Предлагаемая система Projects для Nebulla

### Главный принцип

**Project = конечный outcome с несколькими задачами, контекстом, датами и операционным статусом.**

Не проект:

- одиночная задача;
- постоянная сфера жизни/работы;
- тег;
- фильтр;
- цель верхнего уровня.

### Новая иерархия

```text
Goal / Area
  └─ Project
       ├─ Milestones / Sections
       ├─ Tasks
       ├─ Notes / Links / brief
       └─ Review / health
```

- **Goal** — долгосрочный desired outcome, может содержать несколько Projects.
- **Area** — постоянная ответственность: здоровье, дом, работа; не завершается.
- **Project** — конечная delivery unit.
- **Task** — атомарное next action / scheduled / waiting / done.

### Project fields

Минимальная модель v1:

```ts
type ProjectStatus = 'idea' | 'planned' | 'active' | 'waiting' | 'paused' | 'completed' | 'canceled' | 'archived';
type ProjectHealth = 'on-track' | 'at-risk' | 'blocked' | 'unknown';

interface Project {
  id: string;
  title: string;
  outcome: string;              // Что должно стать правдой в конце
  definitionOfDone?: string;    // Критерий завершения
  color: string;
  status: ProjectStatus;
  health: ProjectHealth;
  goalId?: string;
  areaId?: string;
  startDate?: string;           // Когда начинать
  targetDate?: string;          // Плановая дата завершения
  deadline?: string;            // Внешняя жёсткая дата
  reviewCadence?: 'none' | 'weekly' | 'biweekly' | 'monthly';
  nextReviewDate?: string;
  defaultSectionId?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
  archivedAt?: string;
}
```

### Sections / milestones

В v1 не нужно делать сложный Jira. Достаточно opinionated sections:

```text
Inbox / Backlog — идеи и несформированные задачи
Next — конкретные следующие действия
Waiting — ждём кого-то/что-то
Scheduled — уже стоит в календаре/неделе
Done — завершено
```

Дополнительно можно разрешить custom milestones later:

```ts
interface ProjectSection {
  id: string;
  projectId: string;
  title: string;
  kind: 'backlog' | 'next' | 'waiting' | 'scheduled' | 'done' | 'custom';
  order: number;
  targetDate?: string;
}
```

### Task связь с проектом

Сейчас `task.projectId` есть. Нужно добавить optional section/milestone:

```ts
interface GTDTask {
  projectId?: string;
  projectSectionId?: string;
  blockingReason?: string;
}
```

Важно: task status остаётся GTD status. Project section — это project-local grouping. Не смешивать.

### Project lifecycle

```text
idea → planned → active → waiting/paused → active → completed → archived
                         └──────────────→ canceled → archived
```

Правила:

- **Complete** доступен только когда есть outcome/definition of done или пользователь подтверждает завершение вручную.
- **Archive** скрывает завершённые/отменённые/старые проекты, но не значит done.
- **Paused** не должен попадать в Today/Next pressure.
- **Waiting** отображает next unblock condition.

### Health calculation

Автоматическая подсказка, редактируемая пользователем:

- `blocked`: есть open tasks со status waiting или blockingReason; нет next action.
- `at-risk`: deadline/targetDate близко, progress низкий, нет scheduled/next action.
- `on-track`: есть next action или scheduled work, нет просрочки.
- `unknown`: нет дат/next action.

### Project progress

Не только done/total. Карточка должна показывать:

```text
Outcome line
Next action
Progress: done / active / waiting
Target/deadline
Health badge
```

Пример карточки:

```text
[At risk] Запустить лендинг курса
Outcome: опубликован лендинг с формой записи
Next: написать hero copy · @computer · 45m
5 done · 3 open · 1 waiting
Target: 25 Jul · Review: Friday
```

### Views

1. **Projects Overview** — список active/planned/waiting с health и next action.
2. **Project Detail** — brief, next action, sections, schedule suggestions, notes.
3. **Board View** — sections as columns: Backlog / Next / Waiting / Scheduled / Done.
4. **Timeline/Review View** — target dates, overdue, next review.
5. **Archive** — completed/canceled/archived only.

### AI Scheduler integration

AI не должен просто видеть projectId. Ему нужны structured hints:

- outcome;
- next action candidates;
- targetDate/deadline;
- health;
- waiting blockers;
- review cadence.

Planning prompt can prefer:

1. blocked/at-risk projects first;
2. project with deadline soon;
3. project with no next action → schedule clarification/review task;
4. avoid paused/someday projects.

### Empty states

Новый empty state:

```text
Проект — это конечный результат, который требует нескольких действий.
Примеры: «Запустить сайт», «Подготовить переезд», «Сдать отчёт».
Для постоянных сфер используйте Areas, для одиночного действия — обычную задачу.
```

Create form should ask:

1. Название.
2. Outcome: «Что должно стать правдой?»
3. Target/deadline optional.
4. First next action optional.

### Migration from current model

Безопасная migration:

- Existing active projects → status `active`, health `unknown`.
- Existing archived projects → status `archived`.
- outcome default = empty string; UI asks to add outcome later.
- No destructive changes to tasks.
- Old backup compatibility retains `project` legacy label migration.

### MVP implementation plan

#### Phase 1 — semantics without heavy UI

- Extend `Project` with `outcome`, `targetDate`, `deadline`, `health`, richer status.
- Add migration and backup tests.
- Update Projects empty state and create/edit form.
- Card shows outcome, next action, health, target/deadline.

#### Phase 2 — project detail

- Add Project Detail screen.
- Add sections Backlog/Next/Waiting/Scheduled/Done using task status + projectSectionId.
- Add “Add first next action” and “Schedule next action”.

#### Phase 3 — reviews and AI scheduling

- Add review cadence/nextReviewDate.
- Add project review suggestions in Manager.
- Feed project health into AI planner.

#### Phase 4 — Areas / Goal relationship

- Add Area model or reuse Goal type carefully.
- Explain Goal vs Project vs Area in UI.

## Product recommendation

Перестать развивать текущие Projects как folder list. Следующий правильный шаг — **Phase 1: Project semantics**.

Не добавлять больше archive copy, card polish или colors до изменения модели. Это полирует неправильную абстракцию.

## Acceptance criteria for next implementation

- Project can be created with title + outcome.
- Project can have targetDate/deadline.
- Card exposes next action and health.
- Archive is separate from completed/canceled.
- Backup migration preserves all existing projects/tasks.
- Tests cover legacy migration and backup import/restore.
- Existing GTD/Today flows continue to work.
