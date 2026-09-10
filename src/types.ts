// ===== Domain model (equivalent of Room entities) =====

export type Priority = "low" | "medium" | "high";
export type Difficulty = 1 | 2 | 3; // آسان / متوسط / سخت
export type LearningStatus = "not_started" | "learning" | "needs_review" | "mastered";
export type TaskStatus = "pending" | "done" | "skipped";
export type ReviewStatus = "pending" | "done";
/** 0 = تقریباً یاد نگرفتم, 1 = نیاز به مرور, 2 = نسبتاً خوب, 3 = کامل */
export type Rating = 0 | 1 | 2 | 3;
export type SessionMode = "free" | "pomodoro";
export type PomodoroPhase = "work" | "short" | "long";

/** برچسب‌های کاربری برای مباحث (امتحان، فوری، مرور و...) */
export type TopicTag = "urgent" | "exam" | "review" | "weak" | "mastered" | "custom";

/** یادداشت‌های سریعِ حین مطالعه */
export interface StudyNote {
  id: string;
  topicId?: string;
  text: string;
  createdAt: number;
  /** آیا این یادداشت بعداً به فلش‌کارت تبدیل شده؟ */
  convertedToCard?: string; // flashcard id
}

/**
 * مدل مطالعاتی درس — موتور برنامه‌ریزی هوشمند بر اساس همین، فازهای هر مبحث را می‌چیند:
 * - qbank: تست‌محور (یادگیری کوتاه + تست آموزشی سنگین + مرور نکات)
 * - notes: جزوه‌محور (خواندن جزوه + خلاصه + مرور)
 * - reference: رفرنس‌محور (خواندن عمیق + خلاصه‌برداری + تست تکمیلی)
 * - mixed: ترکیبیِ متعادل
 */
export type StudyApproach = "qbank" | "notes" | "reference" | "mixed";

export interface Subject {
  id: string;
  /** Stable catalogue key; independent of editable names and local entity IDs. */
  sampleId?: string;
  name: string;
  color: string;
  priority: Priority;
  /** مدل مطالعاتی — پیش‌فرض mixed (در UI اگر خالی باشد همان ترکیبی حساب می‌شود) */
  approach?: StudyApproach;
  createdAt: number;
}

/** منبع مطالعاتی متصل به مبحث (لینک ویدیو، PDF، جزوه…) — فقط لینک است، فایلی ذخیره نمی‌شود */
export interface TopicLink {
  label: string;
  url: string;
}

export interface Topic {
  id: string;
  /** Stable catalogue key used to add only missing sample topics. */
  sampleId?: string;
  subjectId: string;
  name: string;
  description?: string;
  volume: number; // pages / units
  estimatedMinutes: number;
  priority: Priority;
  difficulty: Difficulty;
  status: LearningStatus;
  /** زیرمبحث: اگر این مبحث والدِ مباحث دیگری باشد، زمان‌بندی فقط روی برگ‌ها انجام می‌شود */
  parentId?: string;
  /** برچسب‌های کاربری */
  tags?: TopicTag[];
  /** یادداشت‌های متصل به این مبحث */
  notes?: string[]; // note ids
  /** منابع مطالعاتی (لینک) */
  links?: TopicLink[];
  createdAt: number;
}

/**
 * فلش‌کارت با الگوریتم SM-2. کیفیت پاسخ q از ۰ تا ۵ (در UI چهار دکمه: ۱/۳/۴/۵).
 * intervalDays = فاصله‌ی فعلی به روز، repetitions = دنباله‌ی پاسخ‌های درست پشت‌سرهم.
 */
export interface Flashcard {
  id: string;
  /** مبحث مرتبط — اختیاری؛ کارت مستقل هم مجاز است */
  topicId?: string;
  front: string;
  back: string;
  /** ضریب سادگی (Easiness Factor) — پیش‌فرض ۲٫۵ و حداقل ۱٫۳ */
  ef: number;
  intervalDays: number;
  repetitions: number;
  dueDate: string; // ISO yyyy-mm-dd
  lapses: number;
  createdAt: number;
  lastReviewedAt?: number;
}

export interface StudyPlan {
  id: string;
  goal: string;
  startDate: string; // ISO yyyy-mm-dd (local)
  endDate: string;
  topicIds: string[];
  studyDays: number[]; // JS weekday 0..6 (0 = Sunday)
  dailyMinutes: number;
  createdAt: number;
  archived: boolean;
  /** اگر با موتور هوشمند ساخته شده باشد، توضیحِ «چرا این‌طور چیده شد؟» همین‌جا ذخیره می‌شود */
  smartNotes?: string[];
  /** تنظیمات موتور هوشمند — برای «تنظیم مجدد» هوشمند لازم است */
  smart?: SmartPlanConfig;
}

/** پیکربندی موتور برنامه‌ریزی هوشمند (روی StudyPlan ذخیره می‌شود) */
export interface SmartPlanConfig {
  examDate?: string;
  bufferDays: number;
  reviewGaps: number[];
  maxSubjectsPerDay: number;
  goldenFirst: boolean;
  /** مدل مطالعاتی هر درس در لحظه‌ی ساخت برنامه */
  approaches: Record<string, StudyApproach>;
}

/** نوع فعالیت یک تسک — موتور هوشمند برای هر مبحث چند تسکِ هم‌خانواده می‌سازد */
export type TaskKind = "learn" | "test" | "review" | "summary";

export interface StudyTask {
  id: string;
  planId?: string;
  topicId: string;
  date: string; // ISO yyyy-mm-dd
  plannedMinutes: number;
  doneMinutes: number;
  status: TaskStatus;
  order: number;
  priority: Priority;
  /** بعد مهم (محور عمودی ماتریس آیزنهاور) — فوریت همان priority است */
  important?: boolean;
  /** نوع فعالیت — خالی یعنی همان «مطالعه» کلاسیک (سازگار با داده‌ی قدیمی) */
  kind?: TaskKind;
  /** برچسب کوتاه نمایشی مثل «تست آموزشی» یا «مرور ۳ روز بعد» */
  label?: string;
}

export interface StudySession {
  id: string;
  /** null = time-only study, without a subject or a spaced-repetition review. */
  topicId: string | null;
  taskId?: string;
  startedAt: number;
  endedAt: number;
  durationMinutes: number;
  rating: Rating | null;
  mode: SessionMode;
  date: string;
  /** تعداد سیکل‌های کامل‌شده‌ی پومودورو در این جلسه (فقط حالت pomodoro) */
  cycles?: number;
  /** صداهای تمرکزی که هنگام این جلسه پخش می‌شدند (برای آمار «با چه صدایی بیشتر می‌خوانی؟») */
  ambient?: string[];
  /** تعداد دفعات حواس‌پرتی ثبت‌شده توسط خود کاربر در این جلسه */
  distractions?: number;
}

export interface Review {
  id: string;
  topicId: string;
  dueDate: string;
  reviewNumber: number; // 1-based
  stage: number; // index into interval table
  intervalDays: number;
  status: ReviewStatus;
  completedAt?: number;
  rating?: Rating;
}

/** An exam the student marks on the calendar (independent of study plans/topics). */
export interface Exam {
  id: string;
  title: string;
  date: string; // ISO yyyy-mm-dd (local)
  /** ساعت شروع امتحان به‌صورت HH:mm — اختیاری (بدون آن، شمارش تا ابتدای همان روز است) */
  time?: string;
  subject?: string; // optional lesson/course the exam belongs to
  /** اتصال به درسِ کتابخانه — برای «نمره‌ی آمادگی». اختیاری؛ بدون آن از نام درس حدس زده می‌شود */
  subjectId?: string;
  note?: string;
  color?: string; // marker color
  createdAt: number;
}

/** ثبت تمرینِ تست‌زنی: چند تست زدم و چندتا درست بود */
export interface TestLog {
  id: string;
  /** مبحث مرتبط — اختیاری */
  topicId?: string;
  /** درس مرتبط — اختیاری (برای تست آزاد) */
  subjectId?: string;
  date: string; // ISO yyyy-mm-dd
  total: number; // تعداد تست‌ها
  correct: number; // تعداد درست‌ها
  createdAt: number;
}

/** بلوک زمانیِ ثابتِ هفته (کلاس دانشگاه، کار، ورزش…) برای جدول برنامه‌ی هفتگی */
export interface ClassBlock {
  id: string;
  title: string;
  /** روز هفته به سبک JS: ۰=یکشنبه … ۶=شنبه */
  weekday: number;
  /** شروع به دقیقه از نیمه‌شب (۰..۱۴۳۹) */
  startMin: number;
  /** پایان به دقیقه از نیمه‌شب — باید بزرگ‌تر از startMin باشد */
  endMin: number;
  color?: string;
  note?: string;
  createdAt: number;
}

/** دفتر اشتباهات: هر تست/نکته‌ای که غلط زده شده، با زمان‌بندی مرورِ خودش */
export interface Mistake {
  id: string;
  topicId?: string;
  subjectId?: string;
  /** صورت سؤال یا نکته */
  question: string;
  /** پاسخ درست / نکته‌ی کلیدی */
  answer?: string;
  /** علت اشتباه از نگاه خود کاربر */
  cause?: string;
  dueDate: string; // ISO yyyy-mm-dd
  reviewCount: number;
  lapses: number;
  createdAt: number;
  lastReviewedAt?: number;
}

/** عادت روزانه/هفتگی (خواب، ورزش، مرور صبحگاهی…) — مستقل از مطالعه */
export interface Habit {
  id: string;
  title: string;
  icon: string;
  /** هدف: چند روز در هفته (۱..۷) */
  targetPerWeek: number;
  /** تاریخ‌هایی (ISO) که انجام شده */
  history: string[];
  createdAt: number;
}

/** ژورنال بازتاب: «امروز چی یاد گرفتم؟» — حداکثر یکی در روز */
export interface JournalEntry {
  id: string;
  date: string; // ISO yyyy-mm-dd
  learned: string;
  /** حالِ روز از ۱ تا ۵ — اختیاری */
  mood?: number;
  createdAt: number;
}

/** کپسول زمان: نامه به خودِ آینده که تا تاریخ مقرر قفل است */
export interface TimeCapsule {
  id: string;
  text: string;
  openDate: string; // ISO yyyy-mm-dd
  examId?: string;
  createdAt: number;
  openedAt?: number;
}

/** وضعیت درخت تمرکزِ امروز — رشد از روی دقایق مطالعه حساب می‌شود */
export interface FocusTreeState {
  date: string; // ISO yyyy-mm-dd
  /** اگر وسط جلسه‌ی فعال، اپ را برای مدتی رها کرده باشی، درخت پژمرده می‌شود */
  wilted: boolean;
}

export interface Achievement {
  id: string;
  unlockedAt: number;
}

export interface PomodoroSettings {
  work: number;
  shortBreak: number;
  longBreak: number;
  cycles: number;
}

export interface NotificationSettings {
  enabled: boolean;
  studyStart: boolean;
  reviewsToday: boolean;
  overdueReviews: boolean;
  dailyPlan: boolean;
  breakEnd: boolean;
  examReminder: boolean;
  /** یادآور استراحت بعد از مطالعه‌ی پیوسته‌ی طولانی */
  breakReminder: boolean;
  dailyReminderTime: string; // HH:mm
}

/**
 * تنظیمات مربوط به ساعت امتحان و تایمر شمارش معکوس.
 * کل این قابلیت اختیاری است و کاربر می‌تواند از تنظیمات خاموشش کند.
 */
export interface ExamTimerSettings {
  /** تایمر زنده (روز/ساعت/دقیقه/ثانیه) در صفحه اصلی و صفحه امتحانات */
  enabled: boolean;
  /** نمایش ساعت شروع امتحان کنار تاریخ در فهرست‌ها */
  showTime: boolean;
  /** یادآوری یک ساعت مانده به امتحان (فقط وقتی ساعت ثبت شده باشد) */
  oneHourAlert: boolean;
}

/**
 * Offline ambient sounds and colored noise, synthesized with Web Audio.
 * لایه‌ها: باران، رعد و برق، رودخانه، نویز قهوه‌ای، طبیعت (جنگل، باد، شومینه،
 * امواج دریا، پرندگان، شب/جیرجیرک، کافه، پنکه) + نویزهای خالص (سفید/صورتی)،
 * حمل‌ونقل (قطار/هواپیما/ماشین)، آب (آبشار/زیر آب/باران روی چادر)، فضای داخلی
 * و شب (قورباغه/کتابخانه/ساعت)، عجیب‌ترها (خرخر گربه/فضا) و موتورهای مولد
 * (موسیقی زنده‌ی لوفای و ضربان دوگوشی).
 */
export type AmbientSoundId =
  | "rain"
  | "thunder"
  | "river"
  | "brown"
  | "forest"
  | "wind"
  | "fireplace"
  | "ocean"
  | "birds"
  | "crickets"
  | "cafe"
  | "fan"
  // نویزهای خالص
  | "white"
  | "pink"
  | "green"
  | "violet"
  | "grey"
  // سفر و ماشین‌ها
  | "train"
  | "airplane"
  | "car"
  // آب
  | "waterfall"
  | "underwater"
  | "rainTent"
  // فضای داخلی و شب
  | "frogs"
  | "library"
  | "clock"
  // آرام‌بخش و عجیب
  | "purr"
  | "space"
  // جدید: صداهای محیطی متنوع
  | "rainGlass"
  | "pageTurn"
  | "snowfall"
  | "chimes"
  | "nightCity"
  | "typing"
  | "singingBowl"
  // موتورهای مولد
  | "music"
  | "binaural"
  | "drone";

/** باندهای موج مغزی برای ضربان دوگوشی (Binaural Beats) */
export type BinauralBandId = "delta" | "theta" | "alpha" | "beta";

/** پریستِ ساخته‌ی کاربر برای میکسر صداها (مقادیر ناقص هم سالم‌سازی می‌شوند) */
export interface AmbientUserPreset {
  id: string;
  label: string;
  icon: string;
  volumes: Partial<Record<AmbientSoundId, number>>;
}

export interface AmbientSettings {
  /** حجم هر صدا از ۰ تا ۱ — میکس هم‌زمان با حجم مستقل */
  volumes: Record<AmbientSoundId, number>;
  /** حجم کلی از ۰ تا ۱ */
  master: number;
  /** پریست‌هایی که خودِ کاربر از میکس فعلی‌اش ذخیره کرده است */
  customPresets?: AmbientUserPreset[];
  /** باند ضربان دوگوشی (پیش‌فرض آلفا = تمرکز) */
  binauralBand?: BinauralBandId;
  /** واکنش به پومودورو: در فاز استراحت، حجم صدا نرم تا میزان معین کم می‌شود */
  reactiveDuck?: boolean;
}

/** پشتیبان‌گیری خودکار — یادآور + دانلود خودکار فایل JSON هر چند روز یک‌بار */
export interface AutoBackupSettings {
  enabled: boolean;
  /** هر چند روز یک‌بار */
  intervalDays: number;
  /** timestamp آخرین بکاپ (دستی یا خودکار) */
  lastBackupAt?: number;
}

/**
 * همگام‌سازی ابریِ اختیاری (پیش‌فرض: خاموش).
 * فعلاً فقط Supabase با REST مستقیم (بدون SDK) پشتیبانی می‌شود: کاربر یک پروژه‌ی
 * رایگان می‌سازد، یک جدول تک‌سطری می‌سازد و آدرس + کلید را این‌جا می‌گذارد.
 * آفلاین-اول بودن اپ سر جایش است؛ سینک فقط وقتی فعال است که خودت روشنش کنی.
 */
export interface SyncSettings {
  provider: "off" | "supabase";
  url: string;
  anonKey: string;
  /** نام جدول — پیش‌فرض planner_state */
  table: string;
  /** سینک خودکار بعد از هر تغییر (با تأخیر) */
  autoSync: boolean;
  lastSyncAt?: number;
  lastError?: string;
}

export interface UserSettings {
  theme: "light" | "dark" | "system" | "auto";
  accentColor: string; // رنگ اصلی برنامه (تم رنگی) – hex
  pageBackgrounds: boolean; // گرافیک‌های ثابت و محو متناسب با هر صفحه
  /** انیمیشن زنده‌ی پس‌زمینه (شناور شدن، ذرات، چرخش مدار) — با احترام به reduced-motion */
  animateBackgrounds: boolean;
  language: "fa";
  pomodoro: PomodoroSettings;
  reviewIntervals: number[];
  notifications: NotificationSettings;
  examTimer: ExamTimerSettings;
  ambient: AmbientSettings;
  dayStart: string; // HH:mm
  dayEnd: string;
  xp: number;
  onboarded: boolean;
  /** هدف مطالعه‌ی روزانه به دقیقه — ۰ یعنی خاموش */
  dailyGoalMinutes: number;
  /** هدف مطالعه‌ی ماهانه به دقیقه — ۰ یعنی خاموش */
  monthlyGoalMinutes: number;
  /** تاریخ (ISO) آخرین پاداش XP برای رسیدن به هدف روزانه — جلوگیری از پاداش تکراری */
  lastGoalBonusDate?: string;
  /** تعداد یخ‌زدگی‌های Streak موجود (حداکثر MAX_STREAK_FREEZES) */
  streakFreezes: number;
  /** یادآور استراحت بعد از این مقدار مطالعه‌ی پیوسته (دقیقه) — ۰ یعنی خاموش */
  breakReminderMinutes: number;
  /** پشتیبان‌گیری خودکار */
  autoBackup: AutoBackupSettings;
  /** همگام‌سازی ابری اختیاری (پیش‌فرض خاموش) */
  sync: SyncSettings;
}

/** Active timer state – persisted so the timer survives navigation / reloads */
export interface ActiveSession {
  topicId: string | null;
  taskId?: string;
  mode: SessionMode;
  phase: PomodoroPhase;
  cycle: number; // completed work cycles
  running: boolean;
  startedAt: number | null; // timestamp when last resumed
  accumulatedMs: number; // ms accumulated in the current phase while paused
  totalStudyMs: number; // total study ms over the whole session (excl. breaks)
  sessionStartedAt: number;
  /** دفعات حواس‌پرتی ثبت‌شده توسط خودِ کاربر تا این لحظه از جلسه (اختیاری برای داده‌ی قدیمی) */
  distractions?: number;
}

export interface AppState {
  subjects: Subject[];
  topics: Topic[];
  flashcards: Flashcard[];
  plans: StudyPlan[];
  tasks: StudyTask[];
  sessions: StudySession[];
  reviews: Review[];
  achievements: Achievement[];
  exams: Exam[];
  notes: StudyNote[];
  testLogs: TestLog[];
  classBlocks: ClassBlock[];
  mistakes: Mistake[];
  habits: Habit[];
  journal: JournalEntry[];
  capsules: TimeCapsule[];
  focusTree: FocusTreeState | null;
  settings: UserSettings;
  activeSession: ActiveSession | null;
}

export const DEFAULT_EXAM_TIMER: ExamTimerSettings = {
  enabled: true,
  showTime: true,
  oneHourAlert: true,
};

export const DEFAULT_AMBIENT: AmbientSettings = {
  // A new sound is opt-in, so upgrading never changes an existing mix.
  volumes: {
    rain: 0.65,
    thunder: 0.4,
    river: 0.55,
    brown: 0,
    forest: 0,
    wind: 0,
    fireplace: 0,
    ocean: 0,
    birds: 0,
    crickets: 0,
    cafe: 0,
    fan: 0,
    // صداهای تازه همگی خاموش می‌مانند تا میکس ذخیره‌شده‌ی کاربر عوض نشود
    white: 0,
    pink: 0,
    green: 0,
    violet: 0,
    grey: 0,
    train: 0,
    airplane: 0,
    car: 0,
    waterfall: 0,
    underwater: 0,
    rainTent: 0,
    frogs: 0,
    library: 0,
    clock: 0,
    purr: 0,
    space: 0,
    rainGlass: 0,
    pageTurn: 0,
    snowfall: 0,
    chimes: 0,
    nightCity: 0,
    typing: 0,
    singingBowl: 0,
    music: 0,
    binaural: 0,
    drone: 0,
  },
  master: 0.8,
  customPresets: [],
  binauralBand: "alpha",
  reactiveDuck: false,
};

export const DEFAULT_SYNC: SyncSettings = {
  provider: "off",
  url: "",
  anonKey: "",
  table: "planner_state",
  autoSync: false,
};

export const DEFAULT_SETTINGS: UserSettings = {
  theme: "system",
  accentColor: "#0d9488",
  pageBackgrounds: true,
  animateBackgrounds: true,
  language: "fa",
  pomodoro: { work: 25, shortBreak: 5, longBreak: 15, cycles: 4 },
  reviewIntervals: [1, 3, 7, 14, 30],
  notifications: {
    enabled: false,
    studyStart: true,
    reviewsToday: true,
    overdueReviews: true,
    dailyPlan: true,
    breakEnd: true,
    examReminder: true,
    breakReminder: true,
    dailyReminderTime: "08:00",
  },
  examTimer: DEFAULT_EXAM_TIMER,
  ambient: DEFAULT_AMBIENT,
  dayStart: "07:00",
  dayEnd: "23:00",
  xp: 0,
  onboarded: false,
  dailyGoalMinutes: 0,
  monthlyGoalMinutes: 0,
  streakFreezes: 0,
  breakReminderMinutes: 50,
  autoBackup: { enabled: true, intervalDays: 7 },
  sync: DEFAULT_SYNC,
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "کم",
  medium: "متوسط",
  high: "زیاد",
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  1: "آسان",
  2: "متوسط",
  3: "سخت",
};

export const STATUS_LABEL: Record<LearningStatus, string> = {
  not_started: "شروع نشده",
  learning: "در حال یادگیری",
  needs_review: "نیاز به مرور",
  mastered: "یاد گرفته‌ام",
};

export const RATING_LABEL: Record<Rating, string> = {
  3: "کامل یاد گرفتم",
  2: "نسبتاً خوب",
  1: "نیاز به مرور دارم",
  0: "تقریباً یاد نگرفتم",
};

export const APPROACH_LABEL: Record<StudyApproach, string> = {
  qbank: "تست‌محور",
  notes: "جزوه‌محور",
  reference: "رفرنس‌محور",
  mixed: "ترکیبی",
};

export const APPROACH_DESC: Record<StudyApproach, string> = {
  qbank: "یادگیری فشرده، بعد تست آموزشی سنگین و مرور نکات غلط",
  notes: "خواندن جزوه، خلاصه‌برداری و مرورهای منظم",
  reference: "خواندن عمیق رفرنس، خلاصه و تست تکمیلی",
  mixed: "ترکیب متعادل یادگیری، تست و مرور",
};

export const TASK_KIND_LABEL: Record<TaskKind, string> = {
  learn: "یادگیری",
  test: "تست",
  review: "مرور",
  summary: "خلاصه/جمع‌بندی",
};

export const TASK_KIND_ICON: Record<TaskKind, string> = {
  learn: "📖",
  test: "🧪",
  review: "🔁",
  summary: "📝",
};

export const SUBJECT_COLORS = [
  "#0ea5a4",
  "#6366f1",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#10b981",
  "#ec4899",
  "#3b82f6",
  "#f97316",
  "#14b8a6",
];
