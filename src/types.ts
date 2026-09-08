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

export interface Subject {
  id: string;
  /** Stable catalogue key; independent of editable names and local entity IDs. */
  sampleId?: string;
  name: string;
  color: string;
  priority: Priority;
  createdAt: number;
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
}

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
  note?: string;
  color?: string; // marker color
  createdAt: number;
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
  // موتورهای مولد
  | "music"
  | "binaural";

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

export interface UserSettings {
  theme: "light" | "dark" | "system";
  accentColor: string; // رنگ اصلی برنامه (تم رنگی) – hex
  pageBackgrounds: boolean; // گرافیک‌های ثابت و محو متناسب با هر صفحه
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
  /** تاریخ (ISO) آخرین پاداش XP برای رسیدن به هدف روزانه — جلوگیری از پاداش تکراری */
  lastGoalBonusDate?: string;
  /** تعداد یخ‌زدگی‌های Streak موجود (حداکثر MAX_STREAK_FREEZES) */
  streakFreezes: number;
  /** یادآور استراحت بعد از این مقدار مطالعه‌ی پیوسته (دقیقه) — ۰ یعنی خاموش */
  breakReminderMinutes: number;
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
    music: 0,
    binaural: 0,
  },
  master: 0.8,
  customPresets: [],
  binauralBand: "alpha",
  reactiveDuck: false,
};

export const DEFAULT_SETTINGS: UserSettings = {
  theme: "system",
  accentColor: "#0d9488",
  pageBackgrounds: true,
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
  streakFreezes: 0,
  breakReminderMinutes: 50,
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
