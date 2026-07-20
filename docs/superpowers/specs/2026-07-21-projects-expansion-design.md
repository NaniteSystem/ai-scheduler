# Projects expansion — design

Дата: 2026-07-21
Статус: approved by user, ready for implementation planning

## Контекст

`reports/projects-system-research-2026-07-18.md` предложил многофазный редизайн Projects (Linear/Todoist/Things3/ClickUp/Basecamp/Notion research). Фаза 1 (outcome, health, status, targetDate/deadline) уже реализована в `src/types.ts`, `src/domain/projects.ts`, `src/components/ProjectsView.tsx`. Поля `definitionOfDone`, `goalId`, `areaId`, `reviewCadence`, `nextReviewDate` уже объявлены в типе `Project`, но не используются нигде в UI и не входят в `updateProject`'s patch type.

Это спек описывает следующий шаг: экран деталей проекта с доской секций, ревью-напоминания, и связь Project ↔ Goal/Area (включая новую сущность Area).

## Scope

В этой работе:

1. Экран **Project Detail** (brief, review-контролы, доска секций, progress).
2. Новая сущность **Area** + отдельный экран **Areas** (список, CRUD, привязанные проекты) со своим тайлом в Manager.
3. Привязка проекта к **Goal** и **Area** одновременно (оба поля уже существуют в типе).
4. **Ревью-напоминания**: бейдж на экране Projects + изменение подстроки Manager-тайла Projects.
5. Миграция бэкапа/валидации под `Area[]` и задействованные поля `Project`.

Вне scope (сознательно отложено):

- AI-интеграция (планировщик/еженедельный обзор не читают outcome/health/next action проектов).
- Кастомные (не GTD-статусные) секции проекта — на v1 секции строго = task.status.
- Timeline/Gantt-представление.

## 1. Модель данных

### Area (новый тип, `src/types.ts`)

```ts
export interface Area {
  id: string;
  title: string;
  color: string;
  icon?: string;        // emoji, как у Goal
  notes?: string;
  createdAt: string;
  archivedAt?: string;  // Areas не завершаются, только архивируются
}
```

### Project (использование уже существующих полей)

`goalId?: string` и `areaId?: string` становятся редактируемыми в UI. `updateProject` patch расширяется:

```ts
updateProject: (id: string, patch: Partial<Pick<Project,
  | 'title' | 'outcome' | 'definitionOfDone' | 'color' | 'status' | 'health'
  | 'targetDate' | 'deadline' | 'notes' | 'goalId' | 'areaId'
  | 'reviewCadence' | 'nextReviewDate'
>>) => void;
```

### AppView (`src/types.ts`)

Добавить только `'areas'` в union — это независимый список со своим Manager-тайлом, как `'projects'`/`'goals'`.

Project Detail **не** получает отдельный `AppView`: кодовая база уже решает эту задачу для Goal — `GoalDetailView` рендерится вместо списка, когда в `App.tsx` установлен локальный `selectedGoalId` при `activeView==='goals'`. Project Detail повторяет этот паттерн 1:1: локальный `selectedProjectId` в `App.tsx`, подменяющий `ProjectsView` на `ProjectDetailView` при `activeView==='projects'`. Это не требует изменений в `store.ts` (state полностью локален компоненту, как и `selectedGoalId`).

### Store (`src/store.ts`)

```ts
areas: Area[];
addArea: (title: string, options?: { color?: string; icon?: string }) => string;
updateArea: (id: string, patch: Partial<Pick<Area, 'title' | 'color' | 'icon' | 'notes' | 'archivedAt'>>) => void;
deleteArea: (id: string) => void; // detaches projects (areaId -> undefined); does not delete projects
```

`areas: []` — дефолт при инициализации и при хайдрации старых бэкапов без этого поля.

## 2. Экран Areas

По образцу `ProjectsView`, но проще:

- Карточка Area: цвет/иконка, title, notes (опционально), список привязанных проектов (title + health-бейдж, клик → Project Detail), агрегат: сумма активных и просроченных задач по всем проектам Area.
- Форма создания: название + выбор цвета (переиспользуем `PROJECT_COLORS`) + опциональная emoji-иконка.
- Архивирование (`archivedAt`) прячет Area из активного списка, но сохраняет `areaId` у проектов (в отличие от удаления, которое отвязывает).
- Пустое состояние объясняет разницу с Goal и Project: «Area — постоянная сфера жизни без даты завершения (Здоровье, Дом, Работа). Для целей с результатом — Goals, для проектов с финалом — Projects».
- Manager-тайл «Areas»: иконка (`Layers` или аналог), подстрока — счётчик активных Areas. Добавляется в `tiles` массив рядом с Projects/Goals.

## 3. Экран Project Detail

Открывается кликом по проекту (из `ProjectsView`, из карточки Area). Хранение текущего `selectedProjectId` в сторе, как `selectedGoalId` в `App.tsx`.

Структура сверху вниз:

1. **Шапка**: back, цвет/иконка, title + health-бейдж + status-бейдж, кнопки Edit / Archive-Restore.
2. **Brief-блок**: outcome, definitionOfDone (редактируется впервые), notes (свободный текст), target/deadline, ссылка на Goal (если есть, кликабельна → GoalDetailView), ссылка на Area (если есть, кликабельна → Areas).
3. **Review-блок**: `reviewCadence` (none/weekly/biweekly/monthly) select + `nextReviewDate`. Кнопка «Review now» открывает мини-форму: подтвердить/поменять health, обновить outcome/next action, сдвигает `nextReviewDate` на следующий цикл согласно cadence.
4. **Доска секций**: 5 колонок — Backlog / Next / Waiting / Scheduled / Done. `GTDStatus` не содержит значения `waiting`, а `deriveProjectHealth` уже (нерабочим образом) читает `task.blockingReason`, которого нет в типе `GTDTask`. Исправляем это здесь: добавляем реальное поле `blockingReason?: string` на `GTDTask` (types.ts, store `updateTask` patch, backup-валидация — без миграции, поле опционально). Секция задачи выводится чистой функцией `deriveProjectSection(task)`:
   1. `status === 'done'` → Done
   2. непустой `blockingReason` → Waiting (приоритет над статусом)
   3. `status === 'next-action'` → Next
   4. `status === 'scheduled'` → Scheduled
   5. иначе (`inbox`/`someday-maybe`) → Backlog
   - Карточка задачи в колонке: title, due/scheduled date, приоритет.
   - Desktop: drag-and-drop между колонками. Перетаскивание в Backlog/Next/Scheduled/Done меняет `status` через `processTask` (канонический переход, сохраняет recurring-логику) и очищает `blockingReason`. Перетаскивание в Waiting запрашивает текст причины (обязательный) и вызывает `updateTask(id, { blockingReason })`, не трогая status.
   - Touch: fallback — кнопка/select на карточке задачи для смены секции (drag ненадёжен в узких мобильных колонках), вызывает ту же логику.
   - Быстрое добавление задачи в любую колонку — переиспользует `parseTaskCapture`, как в текущей карточке `ProjectsView`.
5. **Progress-бар** — переносится как есть из текущей карточки проекта (done/total, %).

## 4. Ревью-напоминания

- `src/domain/projects.ts`: чистая функция `projectsNeedingReview(projects: Project[], today: string): Project[]` — статус не `archived`/`completed`/`canceled`, и `nextReviewDate` задан и `<= today`.
- **Бейдж на экране Projects**: в шапке — «N to review», клик прокручивает/подсвечивает список к этим проектам.
- **Manager-тайл Projects**: подстрока меняется на «N active · M to review» когда M > 0, иначе текущее поведение без изменений.

## 5. Миграция, бэкап, тесты

- `areas: Area[]` — дефолт `[]` при хайдрации старых бэкапов (без этого поля).
- `src/services/backup.ts`: валидация `Area[]` по аналогии с существующей валидацией `Project[]`; расширить валидацию `Project` под `goalId`/`areaId`/`reviewCadence`/`nextReviewDate` (частично уже есть на строках ~131-138); добавить `optionalFieldIsValid(value, 'blockingReason', ...)` в `gtdTaskIsValid`.
- `src/domain/projects.ts`: `deriveProjectHealth` перестаёт кастовать `task as GTDTask & { blockingReason?: string }` — читает реальное поле напрямую.
- Новые тесты:
  - `src/domain/projects.test.ts` — `projectsNeedingReview`.
  - `src/domain/areas.ts` (helper-логика, если появится) + тест.
  - `src/services/backup.test.ts` — расширить под `Area[]` roundtrip и защиту от malformed данных.
- i18n: новые ключи `areas.*`, `projects.detail.*`, `projects.review.*` в существующей структуре `src/i18n.ts` (оба языка).

## Не входит в эту итерацию

- AI-планировщик и еженедельный обзор не читают project outcome/health/next action.
- Кастомные секции проекта (не завязанные на GTD-статус).
- Timeline/Gantt-представление проектов.
