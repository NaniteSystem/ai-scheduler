# Углубление логики целей: milestone↔прогресс + живой темп

Дата: 2026-07-09. Закрывает `part`-пункт project-map «Углубить логику целей» (goals).
Решения приняты по рекомендованным вариантам (юзер был AFK на AskUserQuestion) — при несогласии легко откатить/поменять.

## Контекст

- `Milestone = { id, title, targetValue, done }`; `targetValue` = накопленные часы цели к этому этапу
  (так его генерит `roadmap.ts`), но в UI он подписан «units», а `done` ставится только вручную.
- `goalProgressPct`: roadmap-узлы → часы/оценка → milestones → 0. Milestone-ы не связаны с часами.
- Темп к дедлайну (`hNeededPerWeek`) уже считается в `GoalDetailView`, но виден только как
  красный бейдж «Needs more effort»; самого числа юзер не видит.

## A. Milestone ↔ прогресс (авто-отметка по часам)

- **Семантика `targetValue` фиксируется как часы**; подписи `gd.targetUnits`/`gd.milestoneTarget`
  переводятся на «ч / h / 時間» (EN/RU/JA).
- Новый derived-хелпер в `store.ts`:
  `milestoneReached(m, hoursLogged) = m.done || (m.targetValue > 0 && hoursLogged >= m.targetValue)`.
  Данные не мигрируются, ничего не пишется в store автоматически — статус вычисляется.
- Ручная галочка остаётся: можно отметить этап досрочно (`done=true`). Снятие галочки у этапа,
  уже достигнутого по часам, визуально ничего не меняет (он reached) — это осознанный трейд-офф
  простоты; в карточке у авто-достигнутых показывается пометка «по часам» (`gd.autoByHours`).
- Все счётчики «выполнено этапов: a из b» (шапка карточки цели в списке `App.tsx`, вкладка
  milestones в `GoalDetailView`) переходят на effective-статус (reached).
- **Деления на прогресс-баре** в шапке детали цели: для каждого milestone с
  `0 < targetValue ≤ totalHoursEstimated` — вертикальная метка на позиции
  `targetValue / totalHoursEstimated`; достигнутые — цветом цели, остальные приглушённые;
  `title` = название этапа.

## B. Живой темп к дедлайну

- В строку ключевых метрик шапки цели добавляется метрика «нужно N ч/нед»
  (`gd.mNeedPerWeek`), когда цель активна, есть дедлайн в будущем и `hoursLeft > 0`.
  Цвет: red если `hNeededPerWeek > hoursPerWeekTarget * 1.2`, иначе зелёный.
- Считается из уже существующих `hoursLeft / weeksLeft` — статичный `hoursPerWeekTarget`
  остаётся как «план», живое число показывает реальный требуемый темп.

## Вне скоупа

- Гибридная формула прогресса (часы+milestones) — не делаем, прогресс остаётся приоритетом
  roadmap → часы → milestones.
- Автоизменение `totalHoursEstimated` по факту и пропорциональный пересчёт milestone при смене
  оценки — не делаем (не выбраны).

## Тесты / проверка

- `npx tsc --noEmit`, `npm test`, `npm run build` зелёные; юнит-тест на `milestoneReached`.
- Playwright @393px: цель с milestones — авто-отметка по часам, деления на баре, метрика темпа.
- i18n: паритет ключей EN/RU/JA (новые: `gd.autoByHours`, `gd.mNeedPerWeek`; правка `gd.targetUnits`, `gd.milestoneTarget`).
