import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, BarChart3, Calendar, Check, Circle, Clock, Flame, Home, Inbox, Layers, Plus, Sparkles, Target, Timer, User } from 'lucide-react';
import { useLang } from '../i18n';
import { useStore } from '../store';

type CourseStep = {
  title: string;
  kicker: string;
  body: string;
  bullets: string[];
  icon: any;
  color: string;
};

const copy: Record<string, { skip: string; back: string; next: string; finish: string; steps: CourseStep[] }> = {
  en: {
    skip: 'Skip',
    back: 'Back',
    next: 'Next',
    finish: 'Start using Nebulla',
    steps: [
      {
        kicker: 'Core idea',
        title: 'Nebulla turns goals into daily action',
        body: 'The app has four main layers: Home for today, Calendar for time, Overview for systems, and Profile for settings. The center plus button creates new items from anywhere.',
        bullets: ['Use Home every morning to see what matters now.', 'Use Calendar when something needs an exact day or time.', 'Use Overview to manage goals, habits, GTD tasks and history.'],
        icon: Sparkles,
        color: '#4f5bd5',
      },
      {
        kicker: 'Home',
        title: 'Home is your daily command center',
        body: 'Home shows today’s scheduled sessions, today tasks, tomorrow preview and habits. Completed sessions and tasks animate away so the day stays clean.',
        bullets: ['Scheduled sessions are time-based work blocks.', 'Today tasks are the work you chose to focus on today.', 'Habits appear when they are due.'],
        icon: Home,
        color: '#2563eb',
      },
      {
        kicker: 'GTD tasks',
        title: 'Inbox is where raw tasks start',
        body: 'New tasks first land in Inbox. Sort them before they become part of your working system.',
        bullets: ['Swipe a task to Today, Next Actions, Scheduled, Other, or back to Inbox.', 'Today is only for tasks you plan to act on today.', 'Next Actions are ready, but not automatically shown in Today.'],
        icon: Inbox,
        color: '#10b981',
      },
      {
        kicker: 'Sorted lists',
        title: 'Sorted tasks live one level deeper',
        body: 'After sorting, open the Sorted view to move between Today, Next Actions, Scheduled, Other and Completed. Swipe left and right between sections.',
        bullets: ['Today keeps your current day focused.', 'Scheduled tasks are connected to calendar sessions.', 'Other is for waiting, projects and lower-priority material.'],
        icon: Layers,
        color: '#f59e0b',
      },
      {
        kicker: 'Calendar',
        title: 'Calendar is for time, not just lists',
        body: 'A session is a task with time. If a GTD item needs a real slot, schedule it and it becomes visible in the calendar.',
        bullets: ['Day and week modes are time grids.', 'Month and year modes help you zoom out.', 'Drag sessions to move them; resize from the bottom edge.'],
        icon: Calendar,
        color: '#0d9488',
      },
      {
        kicker: 'Goals',
        title: 'Goals hold the long-term roadmap',
        body: 'Create goals when you need a larger outcome, not just a single task. Goals can have roadmaps, sessions and progress history.',
        bullets: ['AI roadmap can draft a step-by-step plan.', 'Manual mode lets you keep it simple.', 'Calendar sessions can be linked back to goals.'],
        icon: Target,
        color: '#7c3aed',
      },
      {
        kicker: 'Habits',
        title: 'Habits track repeated behavior',
        body: 'Habits are for routines: water, reading, training, meditation, language practice and anything you repeat.',
        bullets: ['Set a daily reminder time if needed.', 'Stats show streaks and recent consistency.', 'Habits can be linked to goals.'],
        icon: Flame,
        color: '#e0532f',
      },
      {
        kicker: 'Focus mode',
        title: 'Use Do when it is time to work',
        body: 'The Do button starts a focus flow. Choose timer or stopwatch, keep the app usable, then complete, pause or cancel the work.',
        bullets: ['Timer counts down from a planned duration.', 'Stopwatch counts up for open-ended work.', 'A floating timer keeps current work visible.'],
        icon: Timer,
        color: '#06b6d4',
      },
      {
        kicker: 'Navigation',
        title: 'The bottom bar is your map',
        body: 'Home, Calendar, Overview and Profile are the main destinations. The center plus button creates goals, habits and sessions without hunting through screens.',
        bullets: ['Overview contains Goals, Habits, Tasks and Archive.', 'Profile contains preferences, reminders and app data.', 'Use Back to return to Home from secondary sections.'],
        icon: Plus,
        color: '#4f5bd5',
      },
    ],
  },
  ru: {
    skip: 'Пропустить',
    back: 'Назад',
    next: 'Дальше',
    finish: 'Начать пользоваться',
    steps: [
      {
        kicker: 'Главная идея',
        title: 'Nebulla превращает цели в действия на день',
        body: 'В приложении четыре основных слоя: Home для текущего дня, Calendar для времени, Overview для систем и Profile для настроек. Центральная кнопка плюс создаёт новые элементы откуда угодно.',
        bullets: ['Home открывают утром, чтобы понять что делать сейчас.', 'Calendar нужен, когда задаче нужна дата или точное время.', 'Overview управляет целями, привычками, GTD-задачами и историей.'],
        icon: Sparkles,
        color: '#4f5bd5',
      },
      {
        kicker: 'Home',
        title: 'Home — центр управления текущим днём',
        body: 'Home показывает сессии на сегодня, задачи дня, завтрашний превью-блок и привычки. Выполненные элементы исчезают после анимации, чтобы день оставался чистым.',
        bullets: ['Сессии — это задачи с конкретным временем.', 'Today tasks — задачи, выбранные для фокуса сегодня.', 'Привычки появляются, когда их нужно выполнить.'],
        icon: Home,
        color: '#2563eb',
      },
      {
        kicker: 'GTD задачи',
        title: 'Inbox — место для сырых задач',
        body: 'Новые задачи сначала попадают в Inbox. Их нужно разобрать, прежде чем они станут частью рабочей системы.',
        bullets: ['Свайпом отправляй задачу в Today, Next Actions, Scheduled, Other или обратно в Inbox.', 'Today только для того, что реально нужно сделать сегодня.', 'Next Actions готовы к работе, но не смешиваются с Today автоматически.'],
        icon: Inbox,
        color: '#10b981',
      },
      {
        kicker: 'Разобранные списки',
        title: 'Sorted находится уровнем глубже',
        body: 'После сортировки открой Sorted, чтобы смотреть Today, Next Actions, Scheduled, Other и Completed. Между секциями можно переходить свайпами влево и вправо.',
        bullets: ['Today держит фокус текущего дня.', 'Scheduled связан с календарными сессиями.', 'Other объединяет ожидание, проекты и второстепенные материалы.'],
        icon: Layers,
        color: '#f59e0b',
      },
      {
        kicker: 'Calendar',
        title: 'Calendar отвечает за время',
        body: 'Сессия — это задача, у которой есть время. Если GTD-задаче нужен реальный слот, запланируй её, и она появится в календаре.',
        bullets: ['Day и Week — это таблицы времени.', 'Month и Year помогают смотреть шире.', 'Сессии можно перетаскивать и менять длительность за нижний край.'],
        icon: Calendar,
        color: '#0d9488',
      },
      {
        kicker: 'Goals',
        title: 'Goals держат долгосрочную карту',
        body: 'Цель нужна для большого результата, а не для одной маленькой задачи. У цели могут быть roadmap, сессии и история прогресса.',
        bullets: ['AI roadmap может собрать пошаговый план.', 'Manual mode подходит для простого создания.', 'Сессии календаря могут быть связаны с целями.'],
        icon: Target,
        color: '#7c3aed',
      },
      {
        kicker: 'Habits',
        title: 'Habits отслеживают повторяющиеся действия',
        body: 'Привычки нужны для рутины: вода, чтение, тренировки, медитация, язык и всё, что повторяется.',
        bullets: ['Можно поставить ежедневное время напоминания.', 'Статистика показывает streak и стабильность.', 'Привычки можно связать с целями.'],
        icon: Flame,
        color: '#e0532f',
      },
      {
        kicker: 'Focus mode',
        title: 'Кнопка Do запускает работу',
        body: 'Когда пора выполнять задачу, нажми Do. Можно выбрать таймер или секундомер, продолжать пользоваться приложением и завершить, поставить на паузу или отменить работу.',
        bullets: ['Timer считает назад от заданной длительности.', 'Stopwatch считает вперёд для открытой работы.', 'Плавающий таймер показывает текущую активность.'],
        icon: Timer,
        color: '#06b6d4',
      },
      {
        kicker: 'Навигация',
        title: 'Нижняя панель — карта приложения',
        body: 'Home, Calendar, Overview и Profile — главные направления. Центральный плюс создаёт цели, привычки и сессии без поиска по экранам.',
        bullets: ['Overview содержит Goals, Habits, Tasks и Archive.', 'Profile содержит настройки, напоминания и данные приложения.', 'Back возвращает из внутренних секций к Home.'],
        icon: Plus,
        color: '#4f5bd5',
      },
    ],
  },
  ja: {
    skip: 'スキップ',
    back: '戻る',
    next: '次へ',
    finish: 'Nebullaを始める',
    steps: [
      {
        kicker: '基本',
        title: 'Nebullaは目標を毎日の行動に変えます',
        body: '主な画面は Home、Calendar、Overview、Profile です。中央のプラスボタンから、どこでも新しい項目を作れます。',
        bullets: ['Homeで今日やることを見る。', 'Calendarで日付や時間を決める。', 'Overviewで目標、習慣、GTDタスク、履歴を管理する。'],
        icon: Sparkles,
        color: '#4f5bd5',
      },
      {
        kicker: 'Home',
        title: 'Homeは今日の司令塔です',
        body: '今日のセッション、今日のタスク、明日の予定、習慣が表示されます。完了した項目はアニメーション後に消えます。',
        bullets: ['セッションは時間付きの作業ブロックです。', 'Today tasksは今日集中するタスクです。', '習慣は実行日になると表示されます。'],
        icon: Home,
        color: '#2563eb',
      },
      {
        kicker: 'GTD',
        title: 'Inboxは未整理タスクの入口です',
        body: '新しいタスクはまずInboxに入り、そこから分類します。',
        bullets: ['Today、Next Actions、Scheduled、Other、Inboxへスワイプで分類。', 'Todayは今日本当にやるものだけ。', 'Next ActionsはTodayに自動では混ざりません。'],
        icon: Inbox,
        color: '#10b981',
      },
      {
        kicker: '分類後',
        title: 'Sortedで分類済みタスクを確認',
        body: 'Today、Next Actions、Scheduled、Other、Completedを横スワイプで移動できます。',
        bullets: ['Todayは今日の集中リスト。', 'Scheduledはカレンダーセッションと連動。', 'Otherは待ち、プロジェクト、低優先度の材料です。'],
        icon: Layers,
        color: '#f59e0b',
      },
      {
        kicker: 'Calendar',
        title: 'Calendarは時間を管理します',
        body: 'セッションは時間を持つタスクです。GTDタスクに時間が必要なら、スケジュールします。',
        bullets: ['DayとWeekは時間表です。', 'MonthとYearで全体を確認できます。', 'ドラッグで移動し、下端で長さを変更します。'],
        icon: Calendar,
        color: '#0d9488',
      },
      {
        kicker: 'Goals',
        title: 'Goalsは長期ロードマップです',
        body: '大きな成果には目標を作ります。ロードマップ、セッション、進捗履歴を持てます。',
        bullets: ['AI roadmapでステップを作成。', 'Manual modeでシンプルに作成。', 'セッションを目標にリンクできます。'],
        icon: Target,
        color: '#7c3aed',
      },
      {
        kicker: 'Habits',
        title: 'Habitsは繰り返し行動です',
        body: '水、読書、運動、瞑想、語学などのルーティンを管理します。',
        bullets: ['毎日の通知時間を設定できます。', '統計で連続記録と安定性を確認。', '習慣を目標にリンクできます。'],
        icon: Flame,
        color: '#e0532f',
      },
      {
        kicker: 'Focus',
        title: 'Doで集中を始めます',
        body: 'TimerまたはStopwatchを選び、作業中もアプリを使えます。完了、停止、キャンセルができます。',
        bullets: ['Timerは時間をカウントダウン。', 'Stopwatchは時間をカウントアップ。', 'フローティング表示で作業中の項目が見えます。'],
        icon: Timer,
        color: '#06b6d4',
      },
      {
        kicker: 'Navigation',
        title: '下部バーがアプリの地図です',
        body: 'Home、Calendar、Overview、Profileが主な入口です。中央のプラスで目標、習慣、セッションを作れます。',
        bullets: ['OverviewにはGoals、Habits、Tasks、Archiveがあります。', 'Profileには設定、通知、データがあります。', 'Backで内部画面からHomeへ戻ります。'],
        icon: Plus,
        color: '#4f5bd5',
      },
    ],
  },
};

export function IntroCourse() {
  const lang = useLang();
  const { completeIntroCourse, theme } = useStore();
  const [index, setIndex] = useState(0);
  const data = copy[lang] || copy.en;
  const step = data.steps[index];
  const Icon = step.icon;
  const isLast = index === data.steps.length - 1;

  return (
    <div className={`${theme === 'dark' ? 'theme-dark ' : ''}fixed inset-0 z-[120] bg-[var(--bg)] text-[var(--text)] flex flex-col`}>
      <div className="px-5 pt-[calc(env(safe-area-inset-top)+14px)] pb-3 flex items-center gap-3">
        <button
          onClick={() => setIndex(i => Math.max(0, i - 1))}
          disabled={index === 0}
          className={`w-10 h-10 rounded-xl grid place-items-center border border-[var(--border)] bg-[var(--surface)] ${index === 0 ? 'opacity-0 pointer-events-none' : 'text-[var(--text-dim)]'}`}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 flex gap-1.5">
          {data.steps.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i <= index ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'} ${i === index ? 'flex-[2]' : 'flex-1'}`} />
          ))}
        </div>
        <button onClick={completeIntroCourse} className="h-10 px-3 rounded-xl text-[12px] font-bold text-[var(--text-dim)] hover:text-[var(--text)]">
          {data.skip}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-4">
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24 }}
          className="max-w-md mx-auto pt-6"
        >
          <div className="relative mb-8 h-[220px] rounded-[28px] border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-lg">
            <div className="absolute inset-0 opacity-15" style={{ background: `radial-gradient(circle at 50% 20%, ${step.color}, transparent 55%)` }} />
            <div className="absolute inset-5 rounded-[22px] border border-[var(--border)] bg-[var(--bg)]/80 p-4 flex flex-col">
              <div className="flex items-center justify-between">
                <div className="h-8 px-3 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center gap-2 text-[11px] font-bold text-[var(--text-dim)]">
                  <Circle className="w-3 h-3" style={{ color: step.color }} />
                  Nebulla
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-[var(--text-dim)]" />
                  <User className="w-4 h-4 text-[var(--text-dim)]" />
                </div>
              </div>
              <div className="flex-1 grid place-items-center">
                <div className="w-24 h-24 rounded-[30px] grid place-items-center text-white shadow-xl" style={{ background: `linear-gradient(135deg, ${step.color}, var(--primary))` }}>
                  <Icon className="w-11 h-11" strokeWidth={2.3} />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[Home, Calendar, BarChart3, User].map((NavIcon, i) => (
                  <div key={i} className="h-8 rounded-xl bg-[var(--surface)] border border-[var(--border)] grid place-items-center">
                    <NavIcon className="w-4 h-4" style={{ color: i === index % 4 ? step.color : 'var(--text-dim)' }} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="text-[12px] font-extrabold uppercase tracking-[.18em]" style={{ color: step.color }}>{step.kicker}</div>
          <h1 className="display text-[30px] leading-tight text-[var(--text)] mt-2">{step.title}</h1>
          <p className="text-[14px] leading-relaxed text-[var(--text-dim)] mt-3">{step.body}</p>

          <div className="mt-6 space-y-3">
            {step.bullets.map((bullet, i) => (
              <div key={i} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3.5 flex items-start gap-3">
                <span className="w-6 h-6 rounded-full grid place-items-center text-white shrink-0 mt-0.5" style={{ background: step.color }}>
                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                </span>
                <span className="text-[13px] leading-relaxed text-[var(--text)]">{bullet}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      <div className="px-6 pt-3 pb-[calc(env(safe-area-inset-bottom)+18px)]">
        <div className="max-w-md mx-auto grid grid-cols-[auto_1fr] gap-3">
          <button
            onClick={() => setIndex(i => Math.max(0, i - 1))}
            disabled={index === 0}
            className="h-12 px-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[13px] font-bold text-[var(--text-dim)] disabled:opacity-35"
          >
            {data.back}
          </button>
          <button
            onClick={() => isLast ? completeIntroCourse() : setIndex(i => Math.min(data.steps.length - 1, i + 1))}
            className="h-12 rounded-2xl text-white text-[14px] font-bold flex items-center justify-center gap-2 active:scale-[.99]"
            style={{ background: 'linear-gradient(135deg,var(--primary),var(--primary-2))', boxShadow: '0 10px 24px rgba(79,91,213,.32)' }}
          >
            {isLast ? data.finish : data.next}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
