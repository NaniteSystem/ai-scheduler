# Scheduler — AI-планировщик целей, привычек и расписания

Локальное (offline-first) веб-приложение для постановки целей и планирования времени, упакованное в Android-APK через Capacitor. Два «умных» слоя на базе Google Gemini: **AI-roadmap** (ИИ строит дорожную карту под цель) и **AI-планировщик расписания** (план на неделю–месяц).

> Этот файл — точка входа для любого, кто продолжает работу. Прочитай его, потом загляни в `docs/` за деталями конкретных подсистем.

---

## TL;DR — как запустить

```bash
npm install
npm run dev                                      # → http://localhost:5173

# ИИ-функции (опционально): нужны Gemini-ключи (https://aistudio.google.com/apikey)
node --env-file=.env.local server/ai-proxy.mjs   # прокси на :8787, ключи из .env.local
```

`.env.local` (gitignored) содержит:
- `VITE_AI_PROXY_URL` — адрес прокси для клиента. Локально `http://localhost:8787`; для телефона/APK — публичный Vercel-URL `https://proxy-nine-eta.vercel.app` (см. ниже).
- `VITE_AI_PROXY_SECRET` — секрет, который клиент шлёт в заголовке `x-app-secret` (должен совпадать с `APP_SECRET` на прокси).
- `GEMINI_API_KEYS` — Gemini-ключи **через запятую** (первичный провайдер).
- `OPENROUTER_API_KEYS` — OpenRouter-ключи (резервный провайдер, бесплатные модели).
- `APP_SECRET` — тот же секрет на стороне прокси (для локального `server/ai-proxy.mjs` необязателен; на Vercel — обязателен).

Прокси перебирает **провайдер → ключ → модель**, пока кто-то не ответит. Без прокси приложение полностью работает — недоступны только ИИ-генерации.

**Все ключи хранятся ТОЛЬКО в `.env.local`** (он в `.gitignore`, `.env.*`). Никогда не коммитить и не вставлять ключи в код.

---

## Стек

| Слой | Технология |
|------|------------|
| UI | React 19 + TypeScript, Vite |
| Стили | Tailwind CSS v4 (`@tailwindcss/vite`), CSS-переменные для тем |
| Анимации | Framer Motion (`src/utils/motion.ts`) |
| Состояние | Zustand + `persist` → localStorage (ключ `ai-scheduler-store`, version 3) |
| Иконки | lucide-react |
| Даты | date-fns |
| Мобайл | Capacitor 8 (Android WebView-обёртка над `dist/`) |
| ИИ | Google Gemini 2.5 Flash через свой минимальный прокси (`server/ai-proxy.mjs`) |

Нет бэкенда и базы — всё состояние в браузере/WebView. Прокси нужен только чтобы не светить Gemini-ключ в клиенте.

---

## Карта проекта

```
src/
  main.tsx                 точка входа React
  App.tsx                  корневой компонент: навигация (5 вкладок), Home, Overview-хаб, роутинг view
  store.ts                 ЕДИНЫЙ Zustand-стор — всё состояние и действия (persist v3 + миграции)
  types.ts                 ВСЕ доменные типы + CATEGORY_META (источник правды по модели данных)
  i18n.ts                  словари en/ru/ja (~600 ключей × 3) + t() + dateLocale()
  index.css                токены тем (:root светлая / .theme-dark тёмная), утилиты .tcard/.lift/.stagger

  ai/                      ── AI-слой (online-only, fallback нет) ──
    llm.ts                 транспорт к прокси: llmJson<T>(), AiOfflineError / AiUnavailableError
    roadmap.ts             генерация мультиязычного roadmap под цель (Feature 1): SYSTEM/depth/questions промпты, refuse-логика
    intentFilter.ts (+test) консервативный пре-фильтр мусорного ввода (nonsense) до LLM-вызова

  scheduler/               ── движок AI-расписания (Feature 2) ──
    index.ts               SchedulerProvider-шов (rule-based сейчас; место под реальный AI-провайдер)
    engine.ts              чистый детерминированный планировщик на неделю–месяц (НЕ импортирует store)

  components/
    Onboarding.tsx         первый запуск (профиль пользователя)
    GoalCreateWizard.tsx   мастер создания цели: режимы AI-roadmap и Manual
    GoalDetailView.tsx     карточка цели + вкладка «Этапы» (locked roadmap, прогресс по узлам)
    ScheduleView.tsx       дневное расписание (тач-DnD блоков сессий, long-press)
    AIScheduler.tsx        страница многонедельного плана (Overview → план 1нед–1мес)
    AIPlanner.tsx          планировщик дня
    GTDView.tsx            задачи по GTD (inbox/next-action/projects/…)
    HabitsView.tsx         трекер привычек/рутин
    FocusTimer.tsx         помодоро/секундомер (глобальная плашка + ongoing-уведомление)
    SettingsView.tsx       настройки (тема, язык, напоминания, профиль)
    EnergyChart.tsx        график «время по задачам»
    ArchiveView.tsx        архив целей/задач

  utils/
    localized.ts (+test)   LocalizedText-хелперы: lt() / normLT() — выбор языка из мультиязычного контента
    motion.ts              варианты Framer Motion (pageTransition, stagger, popLayout…)
    notifications.ts       локальные уведомления (Capacitor LocalNotifications)
    timerNotifications.ts  ongoing-уведомление таймера в шторке
    duration.ts, cn.ts     форматирование длительности; classnames-хелпер
  hooks/
    useDragAndDrop.ts      DnD для расписания

server/
  ai-proxy.mjs             zero-dependency Node-прокси для ЛОКАЛЬНОГО dev (порт 8787)

proxy/                     ── публичный деплой прокси на Vercel (та же логика, serverless) ──
  api/ai.mjs               Vercel-функция POST /api/ai (Gemini→OpenRouter failover + проверка x-app-secret)
  vercel.json              maxDuration 60с под долгие генерации
  package.json             отдельный мини-проект (деплоится из этой папки, не всё приложение)

android/                   нативный Capacitor/Gradle-проект (генерируется, коммитится)
dist/                      сборка Vite (webDir для Capacitor)
docs/                      спеки и гайды (см. ниже)
capacitor.config.ts        appId com.scheduler.app, appName Scheduler, webDir dist
```

---

## Доменная модель (см. `src/types.ts`)

Главные сущности: **Goal** (с опциональным `roadmap: GoalRoadmap`), **Milestone**, **Session** (блок расписания), **GTDTask**, **Habit** (+ `HabitLogEntry` по дням), **ReflectionEntry**, **LifeBlock** (расписание дня), **SchedulePrefs**, **GeneratedPlan/Day/Block** (выход планировщика).

- `Category` + `CATEGORY_META` — единый список категорий (emoji/цвет/градиент). Цвета категорий НЕ трогать при глобальных миграциях палитры.
- `LocalizedText = string | {en?,ru?,ja?}` — ИИ-контент roadmap хранится сразу на 3 языках; рендер через `lt(value, lang)` из `utils/localized.ts`. Старые цели (просто string) — fallback на оригинал.

---

## Состояние (`src/store.ts`)

Один большой стор `S`. Persist в localStorage под ключом `ai-scheduler-store`, **version 3** с `migrate()` (чинит малформ/legacy-сессии: `tasks:[]`, `startHour:9` если не finite). `activeView` управляет текущим экраном.

При проверках через Playwright: сеять состояние в localStorage `ai-scheduler-store`, после теста — чистить.

---

## Навигация / IA

Нижняя плавающая навигация (на всех ширинах; на desktop md+ — верхняя): **Home · Calendar · ➕(центр, открывает Create-шит) · Overview · Profile**.
**Overview** — хаб: плитки Goals/Habits/Tasks/Archive + статистика + per-goal + recurring + AI-review. Цели открываются через Overview → Goals.

---

## AI-функции

### Feature 1 — AI-roadmap под цель (ГОТОВО)
`GoalCreateWizard` (режим AI): intent → выбор глубины (**Поверхностно / Информативно / Очень подробно** — `surface`/`medium`/`deep`) → дисклеймер → уточняющие вопросы → генерация. Глубина задаётся **качественно**, без жёстких лимитов на число этапов — ИИ сам решает, сколько фаз/узлов нужно цели (см. `DEPTH_GUIDANCE` в `roadmap.ts`). `src/ai/roadmap.ts` одним вызовом Gemini генерит roadmap **сразу на EN/RU/JA** (`LocalizedText`), сохраняется в `Goal.roadmap`. В `GoalDetailView` вкладка «Этапы»: фазы→узлы, тап→попап с ресурсами, mark-done, прогресс по узлам. Online-only, fallback нет (бросает `AiOfflineError`/`AiUnavailableError`). Генерация идёт ~60с, поэтому шаг `generating` показывает анимированный экран (`GeneratingView` в `GoalCreateWizard.tsx`): кольцо с симулированным процентом (ease-out к ~95%) + сменяющиеся подписи на 3 языках — реального прогресса у одного LLM-вызова нет.

**Качество промптов / фильтрация ввода** (`roadmap.ts` + `src/ai/intentFilter.ts`):
- `SYSTEM`-промпт усилен: meaningfulness-фильтр, устойчивость к prompt-injection (intent/ответы — недоверенные данные), anti-generic правила, строгие правила ресурсов («для важных узлов, когда полезно» — реальные курсы/каналы/доки, не выдумывать названия/URL), усиленный date-agnostic.
- **Пре-фильтр `isObviouslyNonsenseIntent()`** — консервативная чистая функция (юнит-тест `intentFilter.test.ts`): мусор (`123`, `asdf`, emoji-only, повтор символа, плейсхолдеры) отсекается **в коде, без LLM-вызова** → мгновенный refuse, экономия токенов и обхода 60с-лимита. Короткие осмысленные цели (`guitar`, `React`, `日本語`) НЕ режет — сомнительное отдаётся модели.
- `reasonType` refuse расширен до `impossible | unsafe | nonsense | unclear`. Для `nonsense` UI показывает дружелюбный фолбэк `gw.refuseNonsense` (EN/RU/JA) с примерами целей. Refuse-сообщения модель пишет на языке пользователя (`lang` прокинут в промпт).
- Schema/архитектура НЕ раздувалась: без отдельных вызовов `classifyGoal`/`repair` и без новых полей узла — чтобы не добавлять LLM-латенси под 60с-лимит Vercel (см. `docs/roadmap-prompts-improved.md` источник идей; внедрён «дешёвый» бакет).

### Feature 2 — AI-планировщик расписания (движок есть, AI-провайдер — задел)
`scheduler/engine.ts` — детерминированный rule-based планировщик на 1нед–1мес из целей/привычек/recurring/задач. `scheduler/index.ts` определяет `SchedulerProvider`-шов: реальный AI-провайдер добавляется одной записью без изменений в UI. Страница — `AIScheduler.tsx` (Overview → план).

### Прокси (`server/ai-proxy.mjs`)
Минимальный Node-сервер (Node 18+, без зависимостей). Принимает `POST /api/ai` `{system,prompt,responseSchema,temperature}`, дергает Gemini `generateContent`, возвращает `{text}`.

**Отказоустойчивость — каскад `провайдер → ключ → модель`** (free-tier Gemini капризный, поэтому много уровней резерва):

1. **Провайдеры по порядку:**
   - **Gemini** (первичный) — нативный `responseSchema` → строгий JSON. Модели: `gemini-2.5-flash → gemini-2.0-flash → gemini-flash-latest`.
   - **OpenRouter** (резервный) — бесплатные модели через JSON-mode. По умолчанию: `openai/gpt-oss-120b → nvidia/nemotron-3-super-120b → meta-llama/llama-3.3-70b → qwen/qwen3-next-80b` (все `:free`).
2. **Несколько ключей** на провайдера (`GEMINI_API_KEYS`, `OPENROUTER_API_KEYS`, через запятую). Round-robin: каждый запрос стартует с другого ключа → квота расходуется равномерно.
3. На запрос перебирается **каждый провайдер × каждый ключ × каждая модель**, пока кто-то не ответит.
4. `429` (квота) → мгновенный переход к следующей модели/ключу/провайдеру. `503/5xx` (перегрузка) → ретрай с паузой (0.6→1.2→2.4с). `400/403` (битый ключ) → ключ пропускается.
5. Gemini: `maxOutputTokens 65536`; OpenRouter: `max_tokens 16000` — запас под большой мультиязычный roadmap.
6. Ключи в логах **маскируются** (`AIzaSy…r4oc`); лог каждого запроса: `✓ <provider> <key> <model> <время>` или `✗ ...`.
7. Авторизация: если задан `APP_SECRET`, прокси требует заголовок `x-app-secret` (иначе `401`). Клиент шлёт его из `VITE_AI_PROXY_SECRET`.

Env: `GEMINI_API_KEYS`/`GEMINI_API_KEY` и/или `OPENROUTER_API_KEYS`/`OPENROUTER_API_KEY` (нужен хотя бы один провайдер); `GEMINI_MODEL`, `OPENROUTER_MODELS` (переопределить списки), `PORT` (def 8787), `ALLOW_ORIGIN` (def *). Запуск: `node --env-file=.env.local server/ai-proxy.mjs`.

> **Почему так:** бесплатные ключи Gemini быстро упираются в лимиты (429), модель периодически перегружена (503), а бесплатные модели OpenRouter сильно зарейтлимичены на стороне провайдера и плавают в доступности. Поодиночке ни один free-tier не надёжен — но **каскад из двух провайдеров с пулом ключей и фолбэком моделей** почти всегда находит свободную комбинацию. Если упало всё — добавь ещё ключ (`GEMINI_API_KEYS`/`OPENROUTER_API_KEYS`) или включи биллинг.

> **Caveat по OpenRouter `:free`:** модели то доступны, то отдают 429 «temporarily rate-limited», и на больших генерациях бывают медленными (десятки секунд). Это нормально для резерва — Gemini пробуется первым и обычно отвечает за 20–30с.

**Важно для телефона:** `VITE_AI_PROXY_URL` зашивается в APK на build-time. `localhost` на телефоне = сам телефон, не Мак.

**Прокси задеплоен на Vercel** (папка `proxy/`, проект `eightsimvols-9770s-projects/proxy`): публичный URL `https://proxy-nine-eta.vercel.app` → `POST /api/ai`. Ключи и `APP_SECRET` хранятся как Vercel env vars (production). Этот URL + `VITE_AI_PROXY_SECRET` зашиты в текущий APK, поэтому ИИ работает на телефоне по любой сети, без Мака.

```bash
# Редеплой прокси после правок proxy/api/ai.mjs:
cd proxy && vercel deploy --prod --yes

# Поменять ключ/секрет на Vercel:
vercel env rm GEMINI_API_KEYS production
printf 'key1,key2' | vercel env add GEMINI_API_KEYS production
cd proxy && vercel deploy --prod --yes
```

> При правках логики прокси менять **оба** файла: `server/ai-proxy.mjs` (локальный dev) и `proxy/api/ai.mjs` (Vercel) — они держат идентичную логику провайдеров/ключей/моделей.
>
> Альтернатива для теста дома без деплоя: собрать APK с LAN-IP Мака (напр. `http://192.168.3.212:8787`), запустить `node --env-file=.env.local server/ai-proxy.mjs` и держать телефон в той же Wi-Fi.
>
> Лимит Vercel Hobby — `maxDuration 60с` на запрос; очень детальная трилингва-генерация может упереться. Если будут таймауты — поднять план или перейти на persistent-хост (Render/Fly).

---

## i18n

`src/i18n.ts` — три словаря `en`/`ru`/`ja`, английский = источник ключей. `t('key', {params})`. **Любая новая UI-строка → ключ во ВСЕ 3 словаря.** Проверка паритета: дифф ключей + `npx tsc --noEmit`.

---

## Темы / стили

CSS-переменные в `index.css`: `:root` (светлая, по умолчанию) и `.theme-dark`. Класс `theme-dark` вешается на корень App (и отдельно на корень Onboarding, т.к. он рендерится ранним return). Основной акцент — индиго `--primary #4f5bd5`. Утилиты: `.tcard` (карточка), `.lift` (hover), `.stagger`/`.anim-pop` (анимации). Не хардкодить хексы — использовать переменные.

---

## Android / APK (см. `ANDROID.md`)

Тулчейн без sudo и без Android Studio: `brew install openjdk@21` + `brew install --cask android-commandlinetools`.

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

npm run android:apk    # vite build + cap sync + ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

Проект таргетит compileSdk 36 (`android/variables.gradle`). Иконки сгенерированы из `assets/icon.png` через `@capacitor/assets`. **APK не пересобирать без явной просьбы.**

npm-скрипты: `dev`, `build`, `preview`, `android:sync`, `android:open`, `android:apk`.

---

## Проверка перед коммитом

```bash
npx tsc --noEmit      # типы
npm run build         # сборка
# + Playwright @393px на :5173 (сеять/чистить localStorage), визуально light+dark
```

---

## Дополнительные доки в `docs/`

- `REDESIGN-SPEC.md` — спека текущего редизайна UI (светлый iOS-стиль, индиго).
- `HABIT-TRACKER-SPEC.md` — полная спека трекера привычек.
- `MODULE-AUDIT.md` — аудит модулей против To Do/Todoist/Calendar.
- `android-uiux-guide.md` — гайд по мобильному UI/UX (Material 3).
- `roadmap-prompts-improved.md` — источник идей по улучшению промптов roadmap (внедрён «дешёвый» бакет: SYSTEM + nonsense + пре-фильтр).
- `FIREBASE-SETUP.md` — план Google-входа + Firestore-синхронизации (отложено, кода нет).
- `superpowers/specs/` и `superpowers/plans/` — дизайн и планы фич (Goal-AI roadmap и др.).
- `PROJECT-MAP.html` / `project-map.json` — живая карта проекта.

---

## Что сделано и что дальше (на 2026-06-29)

**Готово:** редизайн UI (светлая тема + индиго), Feature 1 (AI-roadmap, мультиязычный + анимированный экран генерации), привычки H1–H4, Focus Timer, тач-DnD расписания, многонедельный планировщик (rule-based), i18n EN/RU/JA, Capacitor/APK debug-сборка, **публичный прокси на Vercel (Gemini→OpenRouter failover, секрет-заголовок) → ИИ работает на телефоне без Мака**.

**Дальше:** живой тест ИИ-генерации на телефоне на 3 языках (APK собран — `Scheduler-roadmap-vercel.apk`); Feature 2 — подключить реальный AI-провайдер в `SchedulerProvider`; Firebase-вход + синхронизация (отложено); релизная подпись APK.
