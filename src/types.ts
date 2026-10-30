import type { ThemePackId } from "./lib/themePacks";
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
  /** بایگانی: درسِ تمام‌شده — از فهرست‌های فعال و برنامه‌های تازه پنهان می‌شود ولی آمارش می‌ماند */
  archived?: boolean;
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
  /**
   * برآورد دستیِ زمان برای هر روش مطالعه — وقتی کاربر می‌داند همان مبحث را با
   * رفرنس ۶ ساعت و با بانک سؤال ۹۰ دقیقه می‌خواند. اگر نباشد، برآورد پایه با
   * ضریب همان روش محاسبه می‌شود (lib/planEstimate).
   */
  estimateOverrides?: Partial<Record<StudyApproach, number>>;
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
export interface SourceEvidence {
  documentId: string;
  documentTitle: string;
  page: number;
  quote: string;
}
export interface SourceDocument {
  id: string;
  title: string;
  kind: "text" | "pdf" | "image";
  pages: { number: number; text: string }[];
  createdAt: number;
}
export interface RemediationAttempt {
  id: string;
  cause: string;
  mistakeIds: string[];
  correct: number;
  total: number;
  createdAt: number;
}
/** 🖍 سبکِ نشانه‌گذاری روی متن کارت (انتخابی، نه کل متن) */
export type AnnotationStyle = "highlight" | "underline" | "strike";
/** 🎨 رنگ‌های مجاز هایلایت — کلیدها در lib/annotations به رنگِ واقعی نگاشت می‌شوند */
export type AnnotationColor = "yellow" | "green" | "blue" | "pink" | "purple" | "orange";

/**
 * یک نشانه‌گذاری روی «بازه‌ای مشخص» از متن کارت.
 * `start`/`end` آفستِ نویسه در متن خامِ همان سمت کارت‌اند (بدون تغییر در متن اصلی)
 * و `text` فقط برای نمایشِ فهرست و اعتبارسنجی است؛ اگر متن کارت ویرایش شود و آفست
 * دیگر با `text` نخواند، آن نشانه‌گذاری نادیده گرفته می‌شود (نه این‌که روی حرف اشتباه بنشیند).
 */
export interface TextAnnotation {
  id: string;
  side: "front" | "back";
  start: number;
  end: number;
  text: string;
  style: AnnotationStyle;
  color?: AnnotationColor;
  /** یادداشت شخصیِ چسبیده به همین عبارت */
  note?: string;
  createdAt: number;
}

/** ارجاع کارتِ ساخته‌شده از بانک آزمون به سؤالِ اصلی (برای مراجعهٔ بعدی) */
export interface FlashcardSourceQuestion {
  questionId: string;
  stem: string;
  examType: "pre_internship" | "residency";
  year: number;
  topicTitle?: string;
}

export interface Flashcard {
  evidence?: SourceEvidence;
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
  /** منبع کارت — ساخته‌ی کاربر (پیش‌فرض) یا نمونه‌ی «پک منتخب» */
  origin?: "user" | "curated";
  /** اگر از پک منتخب آمده باشد: کلید پک (همان sampleId مبحث در کاتالوگ) */
  packId?: string;
  /** پرچم «بررسی سوال» — کاربر به جوابِ کارت شک دارد و باید بعداً ویرایشش کند */
  needsCheck?: boolean;
  needsCheckAt?: number;
  /**
   * یادداشت شخصی روی کارت — عمداً از front/back جدا است تا ویرایشِ آن هرگز
   * محتوای اصلی یا کارتِ مشترک را تغییر ندهد.
   */
  note?: string;
  noteUpdatedAt?: number;
  /** عبارت‌هایی که کاربر در متن کارت هایلایت کرده (متنِ دقیق، برای نمایش) */
  highlights?: string[];
  /** علامت شخصی «باید دوباره مرور شود» — مستقل از پرچم «بررسی سوال» */
  bookmark?: boolean;
  bookmarkedAt?: number;
  /** 🖍 نشانه‌گذاری‌های انتخابی روی متن کارت (هایلایت/خط‌کشیدن/خط‌خوردن + یادداشتِ عبارت) */
  annotations?: TextAnnotation[];
  /** 🔗 اگر این کارت از نکاتِ پاسخنامهٔ بانک آزمون ساخته شده باشد، ارجاع به سؤال اصلی */
  sourceQuestion?: FlashcardSourceQuestion;
}

/** نوع سؤالِ چهارگزینه‌ایِ ساخته‌شده از یک فلش‌کارت */
export type CardQuestionKind = "mcq" | "cloze";

/**
 * سؤالی که از یک فلش‌کارت ساخته و ذخیره می‌شود. با ذخیره‌شدن، دیگر هر بار
 * از صفر تولید نمی‌شود؛ آفلاین هم در دسترس است و پاسخنامه همراهش می‌ماند.
 * `cardHash` اثرِ انگشت محتوای کارت در لحظهٔ ساخت است: اگر کارت ویرایش شود،
 * سؤالِ کهنه بازسازی می‌شود (lib/cardQuiz).
 */
export interface CardQuestion {
  id: string;
  cardId: string;
  topicId?: string;
  kind: CardQuestionKind;
  prompt: string;
  options: string[];
  correctIndex: number;
  /** پاسخنامهٔ کوتاه مروری — آفلاین از خود کارت یا (اختیاری) با کمک هوش مصنوعی */
  explanation?: string;
  source: "offline" | "ai";
  /** مدلِ سازندهٔ پاسخنامه (فقط وقتی source=ai است) — برای شفافیت و بازتولید */
  aiModel?: string;
  aiAt?: number;
  cardHash: string;
  createdAt: number;
  /** کاربر می‌تواند سؤال نامعتبر را علامت بزند تا در آزمون‌ها نیاید */
  status?: "ok" | "flagged";
}

/** ثبت هر پاسخ در جلسهٔ فلش‌کارت (برای سابقه و جلوگیری از ثبت چندباره) */
export interface CardAttempt {
  id: string;
  cardId: string;
  questionId?: string;
  mode: "classic" | "mcq" | "cloze" | "timed";
  correct: boolean;
  selectedIndex?: number;
  /** مدت پاسخ‌دهی به این کارت به میلی‌ثانیه (اگر معلوم باشد) */
  ms?: number;
  at: number;
}

/** نتیجهٔ یک جلسهٔ فلش‌کارت — برای نمایش در پایان و آمار شخصی */
export interface FlashSessionResult {
  id: string;
  startedAt: number;
  endedAt: number;
  mode: "classic" | "timed" | "mcq" | "cloze" | "mixed";
  deckTitle?: string;
  total: number;
  answered: number;
  correct: number;
  wrong: number;
  skipped: number;
  timeLimitSec?: number;
  usedSec: number;
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
  /** علت‌های روزهای مطالعه‌ی خالی؛ برای نمایش دوباره در فهرست برنامه‌ها و تقویم */
  smartDayReasons?: { date: string; reason: string }[];
  /** تنظیمات موتور هوشمند — برای «تنظیم مجدد» هوشمند لازم است */
  smart?: SmartPlanConfig;
  /** آخرین بازچینش: چند دقیقه کار در بازه جا نشد (۰ = همه‌چیز جا شد) */
  unplacedMinutes?: number;
  /** آخرین بازچینش: پایانِ پیشنهادی وقتی کار در بازه جا نمی‌شود */
  suggestedEndDate?: string;
  /** آخرین بازچینش: چند روز بیشتر لازم است */
  neededExtraDays?: number;
}

/** جابه‌جایی دستیِ یک تسک برنامه به روز دیگر (از «ویرایش برنامه»/کشیدن‌ورهاکردن) */
export interface PlanTaskMove {
  taskId: string;
  /** تاریخ مقصد به شکل ISO yyyy-mm-dd */
  date: string;
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
  /** حداکثر زمان یک نوبت پیوسته‌ی مطالعه، به دقیقه */
  maxSessionMinutes?: number;
  /** زمان در دسترس متفاوت برای هر روز هفته (۰=یکشنبه … ۶=شنبه) */
  dailyMinutesByWeekday?: Partial<Record<number, number>>;
  /** اگر true باشد، برنامه‌ریزی روی تعطیلات رسمی ایران هم مجاز است */
  includeHolidays?: boolean;
}

/** نوع فعالیت یک تسک — موتور هوشمند برای هر مبحث چند تسکِ هم‌خانواده می‌سازد */
export type TaskKind = "learn" | "test" | "review" | "summary";

/**
 * نوع *جلسه‌ی مطالعه* که کاربر ثبت می‌کند. تفاوتش با TaskKind در «mixed» است:
 * بعضی کتاب‌ها (پزشکی/کنکور) درسنامه و تستشان یکی است و کاربر در یک نوبت هم
 * می‌خواند و هم تست می‌زند؛ «mixed» همین حالت است و از تسک‌های learn و test
 * (به ترتیب چیدمان برنامه) پر می‌شود.
 */
export type StudyKind = TaskKind | "mixed";

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
  /** نوع فعالیت این جلسه (یادگیری/تست/مرور/خلاصه) — برای واریز هوشمند به تسک هم‌نوع */
  kind?: StudyKind;
  /**
   * اگر در یک نوبت چند کار انجام شده (مثلاً درسنامه و تستِ یک کتابِ ترکیبی)،
   * همه‌ی نوع‌ها این‌جا می‌آیند؛ `kind` آن‌وقت «mixed» می‌شود تا داده‌ی قدیمی سازگار بماند.
   */
  kinds?: StudyKind[];
  /**
   * دقایقی از این جلسه که به هیچ تسکی واریز نشد (تسکِ آن مبحث تمام شده بود).
   * این زمان همچنان در آمار و ساعت مطالعه هست، ولی مرور/تسکی را «انجام‌شده» نمی‌کند.
   */
  unplannedMinutes?: number;
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
/** یک قلم از چک‌لیست روز امتحان (کارت ورود، خواب کافی و...) */
export interface ExamCheckItem {
  id: string;
  label: string;
  done: boolean;
}

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
  /** چک‌لیست روز امتحان — اختیاری؛ با قالب پیش‌فرض ساخته می‌شود */
  checklist?: ExamCheckItem[];
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

/** 🔈 موتور گفتار: موتور نصب‌شده روی گوشی (Web Speech) یا سرویسِ آفلاینِ اختصاصی (HTTP) */
export type TtsEngineKind = "system" | "remote";
/** 🎧 حالتِ مرورِ صوتی */
export type TtsMode = "qa" | "podcast" | "rapid" | "answer-first";

/**
 * تنظیمات صوتی — همه‌چیز محلی است و آفلاین می‌ماند.
 * «system» یعنی همان موتور TTS نصب‌شده روی گوشی (از جمله موتور فارسیِ جدیدی که
 * کاربر نصب کرده)؛ «remote» یعنی یک سرویسِ محلی/آفلاینِ TTS با آدرسِ دلخواه که
 * متن را می‌گیرد و صدا برمی‌گرداند.
 */
export interface TtsSettings {
  engine: TtsEngineKind;
  /** شناسهٔ صدا (voiceURI) در موتور سیستم؛ خالی = بهترین صدای فارسیِ موجود */
  voiceURI?: string;
  /** نامِ موتور/صدا برای نمایش در تنظیمات */
  voiceLabel?: string;
  /** سرعت خواندن ۰٫۵ تا ۲ (پیش‌فرض ۱) */
  rate: number;
  pitch: number;
  volume: number;
  /** مکث بین سؤال و پاسخ (ثانیه) — برای یادآوری ذهنی */
  answerPauseSec: number;
  /** مکث بین دو کارت (ثانیه) */
  cardGapSec: number;
  /** هر کارت چند بار خوانده شود (۱ تا ۳) */
  repeat: number;
  /** حالتِ پیش‌فرض مرور صوتی */
  mode: TtsMode;
  /** خواندن خودکار کارت بعدی */
  autoNext: boolean;
  /** آدرس سرویسِ TTS آفلاین/محلی (فقط در حالت remote) */
  remoteUrl?: string;
  /** کلید اختیاری سرویس (در صورت نیاز) */
  remoteKey?: string;
  /** نام صدا در سرویس ریموت */
  remoteVoice?: string;
}

/** پشتیبان‌گیری خودکار — یادآور + دانلود خودکار فایل JSON هر چند روز یک‌بار */
export interface AutoBackupSettings {
  enabled: boolean;
  /** هر چند روز یک‌بار */
  intervalDays: number;
  /** timestamp آخرین بکاپ (دستی یا خودکار) */
  lastBackupAt?: number;
}

/** شناسه‌ی کارت‌های صفحه‌ی خانه — برای چیدمان شخصی‌سازی‌شده */
export type HomeCardId =
  | "quote" | "buddy" | "tree" | "replan" | "progress" | "examCountdown"
  | "monthlyGoal" | "quickActions" | "exams" | "tasks" | "overdue"
  | "habits" | "journal" | "stats" | "night";

/** چیدمان یک کارت خانه: ترتیب در آرایه + دیده‌شدن */
export interface HomeCardLayout {
  id: HomeCardId;
  visible: boolean;
}

export interface UserSettings {
  theme: "light" | "dark" | "system" | "auto";
  accentColor: string; // رنگ اصلی برنامه (تم رنگی) – hex
  /** 🎨 تمِ آمادهٔ پس‌زمینه (رنگ صفحه/کارت‌ها) — جزئیات در src/lib/themePacks.ts */
  themePack?: ThemePackId;
  /** 🎨 خانوادهٔ تمِ یکپارچه (پس‌زمینه + رنگ برنامه با هم) — جزئیات در lib/themePacks */
  themeFamily?: string;
  /** 🔈 تنظیمات مرور صوتی و موتور تبدیل متن به گفتار */
  tts?: TtsSettings;
  /** 🃏 تعداد کارت‌هایی که «ساخت هوشمند» از دستیار می‌خواهد (۱۲/۲۵/۵۰) */
  aiCardCount?: number;
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
  /** تاریخ (YYYY-MM-DD) روزهایی که واقعاً با یک یخ‌زدگی پوشانده شده‌اند — تا یخ‌زدگی
   *  یک‌بار مصرف شود و نه هر بار محاسبه‌ی زنجیره (باگ قبلی: موجودی هرگز کم نمی‌شد). */
  streakFreezeDates: string[];
  /** 🐛→✅ تاریخِ خریدِ هر یخ‌زدگیِ موجود (YYYY-MM-DD، هم‌طول با `streakFreezes`).
   *  یخ‌زدگی فقط روزهای جامانده‌ی *بعد از* خرید خودش را پوشش می‌دهد؛ خریدِ امروز
   *  گذشته را جبران نمی‌کند. یخ‌زدگی‌های قبلِ این نسخه (بدون تاریخ) بدون محدودیت‌اند. */
  streakFreezeBoughtOn?: string[];
  breakReminderMinutes: number;
  /** پشتیبان‌گیری خودکار */
  autoBackup: AutoBackupSettings;
  /** سرویس سینک ابریِ انتخابی کاربر — پیش‌فرض گوگل درایو */
  cloudProvider?: "drive" | "supabase";
  /** همگام‌سازی گوگل درایو — Client ID ساختگی‌ی پیش‌فرض حذف شد؛ مقدار واقعی خودِ کاربر */
  googleDrive?: {
    clientId?: string;
    autoSync?: boolean;
    lastSyncAt?: number;
  };
  /** تنظیمات همگام‌سازی ابری با Supabase (شناسه‌ی ناشناس خودکار + ایمیل اختیاری) */
  supabase?: {
    /** آدرس پروژه — خالی یعنی مقدار پیش‌فرضِ بیلد (VITE_SUPABASE_URL) */
    url?: string;
    /** anon public key — خالی یعنی مقدار پیش‌فرض بیلد (VITE_SUPABASE_ANON_KEY) */
    anonKey?: string;
    /** ایمیلِ اتصال‌یافته به حساب ناشناس (در صورت اتصال) */
    email?: string;
    /** آخرین همگام‌سازی موفق (ارسال یا دریافت) */
    lastSyncAt?: number;
    /** زمان‌نگار (ms) آخرین نسخه‌ی ابری که دیده‌ایم — برای تصمیم pull خودکار */
    lastRemoteSeenAt?: number;
    /** Device-local CAS baseline. Never imported from a different device. */
    baseRevision?: number;
    baseUserId?: string;
    baseProject?: string;
    /** اگر کاربر سینک خودکار را خاموش کرده باشد */
    autoSync?: boolean;
  };
  /** Keep accepted calibration sample IDs, so the same evidence is not applied twice. */
  paceAccepted?: Record<string, string>;
  /** پنهان‌سازی پیشنهادها فقط برای امروز */
  dismissedRecommendations?: { date: string; keys: string[] };
  /** چیدمان شخصی کارت‌های خانه — خالی یعنی پیش‌فرض */
  homeLayout?: HomeCardLayout[];
  /** آخرین نسخهٔ اپی که کاربر تأیید کرده — برای تشخیصِ آپدیتِ نرم‌افزار */
  lastSeenVersion?: string;
  /** آخرین نسخهٔ یادداشت‌های انتشار که واقعاً دیده شده (از نسخهٔ بعدی جداست) */
  lastSeenChangelogVersion?: string;
  /** آخرین لقبِ سطحِ جشن‌گرفته‌شده — برای جشنِ یک‌باره‌ی لقب تازه */
  lastTitle?: string;
  /** الگوریتم زمان‌بندی فلش‌کارت: SM-2 کلاسیک (پیش‌فرض) یا FSRS (پیشرفته) */
  srsAlgorithm?: "sm2" | "fsrs";
  /** تور راهنمای اولین استفاده دیده شده؟ */
  tourSeen?: boolean;
  /** تم‌های فصلی (نوروز/یلدا) — پیش‌فرض روشن */
  seasonalThemes?: boolean;
  /** اعلان واقعی (Web Push) — کاملاً اختیاری؛ بدون آن، اعلان‌های داخل اپ مثل قبل کار می‌کنند */
  webPush?: {
    /** کلید عمومی VAPID (از سرور/سازنده) — بدون آن پوش غیرفعال است */
    vapidKey?: string;
    /** کاربر پوش را فعال کرده و subscription ثبت شده */
    enabled?: boolean;
    lastSubAt?: number;
  };
  /** سایه‌های واردشده از دوستان (رقابت هفتگی) — با کد متنی/QR جابه‌جا می‌شوند */
  friendGhosts?: FriendGhost[];
  /**
   * 🎂 تاریخ تولد — فقط ماه و روزِ شمسی (و سالِ اختیاری برای نمایش سن).
   * روی همین دستگاه می‌ماند و در هیچ سینکی به‌صورت اجباری نمی‌رود؛ سال اختیاری است.
   */
  birthday?: BirthdayInfo;
  /** آخرین سالی که پیام تبریکِ تولد نشان داده شد (جلوگیری از تکرار در همان روز) */
  lastBirthdayGreeted?: string;
}

export interface BirthdayInfo {
  /** ماه شمسی ۱..۱۲ */
  month: number;
  /** روز ۱..۳۱ */
  day: number;
  /** سال تولد (اختیاری) — برای محاسبهٔ سن؛ اگر نباشد فقط تبریک نشان داده می‌شود */
  year?: number;
}

/** 👻 سایه‌ی هفته‌ی یک دوست — فقط هفت عدد (دقیقه‌های هر روز) + نام؛ هیچ داده‌ی دیگری جابه‌جا نمی‌شود */
export interface FriendGhost {
  id: string;
  name: string;
  /** دقایق مطالعه‌ی هر روز از شنبه تا جمعه‌ی همان هفته */
  days: number[];
  /** هفته‌ی جاریِ دارنده در لحظه‌ی اشتراک — فقط برای نمایش */
  weekStart: string;
  total: number;
  importedAt: number;
}

/** Active timer state – persisted so the timer survives navigation / reloads */
export interface ActiveSession {
  targetMinutes?: number;
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
  /** نوع فعالیت — اگر جلسه از یک تسک برنامه شروع شده باشد، نوع همان تسک است */
  kind?: StudyKind;
  /** چندنوعی: اگر جلسه چند کار را با هم پوشش می‌دهد (درسنامه + تست) */
  kinds?: StudyKind[];
}

/** نوع آیتم‌های سطل زباله */
export type TrashKind =
  | "subject" | "topic" | "plan" | "task" | "flashcard" | "exam" | "habit"
  | "mistake" | "note" | "capsule" | "journal" | "testLog" | "classBlock";

/**
 * آیتم سطل زباله: اسنپ‌شات کاملِ چیزی که حذف شده + وابسته‌هایش، برای بازگردانی
 * تا ۳۰ روز. snapshot ساختارش به kind بستگی دارد (در lib/trash مستند است).
 */
export interface TrashedItem {
  id: string;
  kind: TrashKind;
  label: string;
  deletedAt: number;
  snapshot: unknown;
}

/** یک بلاکِ برنامه‌ی جنگی: ۵۰ دقیقه کار یا ۱۰ دقیقه استراحت */
export type CramKind = "mistakes" | "review" | "learn" | "cards" | "recap" | "break";

export interface CramBlock {
  id: string;
  kind: CramKind;
  minutes: number;
  label: string;
  detail?: string;
  reason: string;
  /** برای بلاک یادگیری: مبحث هدف (دکمه‌ی ▶ مستقیم جلسه می‌سازد) */
  topicId?: string;
}

export interface CramItem extends CramBlock {
  done: boolean;
}

/** برنامه‌ی جنگیِ فعال — حداکثر یکی در هر لحظه */
export interface CramPlan {
  id: string;
  /** امتحان هدف (اختیاری) */
  examId?: string;
  examTitle?: string;
  examDate?: string;
  /** درس هدف (اختیاری — خالی یعنی همه‌ی دروس) */
  subjectId?: string;
  hours: number;
  items: CramItem[];
  createdAt: number;
  completedAt: number | null;
}

// ===== 🏥 بانک سؤال پره‌انترنی و دستیاری (آنلاین، بارگذاری تدریجی) =====

/** نوع آزمون: پره‌انترنی یا دستیاری */
export type BankExamType = "pre_internship" | "residency";

/**
 * یک سؤال بانک. این ساختار «قرارداد داده» است: هم اسکریپتِ ساختِ شاردها
 * (scripts/buildQuestionBank.mjs) و هم نسخهٔ نمونهٔ داخلی همین را رعایت می‌کنند.
 * سؤالِ کامل در حافظهٔ گوشی ذخیره نمی‌شود؛ فقط همین شکل در حافظهٔ موقتِ جلسه می‌آید.
 */
export interface BankQuestion {
  id: string;
  examType: BankExamType;
  /** سالِ آزمون (شمسی) — مثلاً ۱۴۰۲ */
  year: number;
  subject: string;
  topicId: string;
  topicTitle: string;
  stem: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  /** پاسخنامهٔ تشریحی (آموزشی) */
  explanation: string;
  /** 🧠 نکاتِ کلیدی پاسخنامه که می‌توان به فلش‌کارت تبدیل کرد */
  keyPoints?: string[];
  difficulty?: 1 | 2 | 3;
  /** ارجاع به منبع (نام کتاب/صفحه) — اختیاری */
  sourceRef?: string;
  /**
   * وضعیتِ کلیدِ پاسخ در بازبینیِ محتوا. «مشکوک» با برچسب نمایش داده می‌شود و
   * از حالتِ آزمونی کنار گذاشته می‌شود (در تمرین با هشدار دیده می‌شود).
   */
  keyStatus?: "confirmed" | "doubtful";
}

/** پاسخِ ثبت‌شده به یک سؤال بانک — کوچک و ماندگار (بدون نگه‌داشتن متن سؤال) */
export interface BankAttempt {
  id: string;
  questionId: string;
  topicId: string;
  topicTitle?: string;
  examType: BankExamType;
  year: number;
  correct: boolean;
  selectedIndex?: number;
  ms?: number;
  at: number;
}

/** نتیجهٔ یک آزمون بانک — برای تاریخچه و تحلیل نقاط ضعف */
export interface BankSessionResult {
  id: string;
  startedAt: number;
  endedAt: number;
  examType?: BankExamType | "mixed";
  topicIds: string[];
  topicTitles?: string[];
  years?: number[];
  total: number;
  answered: number;
  correct: number;
  wrong: number;
  skipped: number;
  usedSec: number;
  /** منبع سؤال‌ها: آنلاین یا مجموعهٔ نمونهٔ داخلی */
  source: "online" | "sample";
}

/** فهرستِ سبک یک مبحث در مانیفست بانک — بدون خودِ سؤال‌ها */
export interface BankTopicMeta {
  topicId: string;
  subject: string;
  topicTitle: string;
  count: number;
  /** تفکیک تعداد به نوع آزمون */
  byExamType: Partial<Record<BankExamType, number>>;
  /** سال‌های موجود (شمسی، نزولی) */
  years: number[];
}

/** مانیفست بانک: تنها فایلی که در ورود به بخش دانلود می‌شود */
export interface BankManifest {
  version: string;
  updatedAt: string;
  /** آدرس پایهٔ شاردها نسبت به همین مانیفست */
  shardBase?: string;
  /** این مانیفست «مجموعهٔ نمونه» است (نه بانک کامل) — UI صریح نشان می‌دهد */
  sample?: boolean;
  /** شاردها با gzip فشرده شده‌اند (`.json.gz`) — اپ خودش باز می‌کند */
  encoding?: "gzip";
  topics: BankTopicMeta[];
}

export interface AppState {
  sourceDocuments?: SourceDocument[];
  remediationAttempts?: RemediationAttempt[];
  /** سؤال‌های چهارگزینه‌ایِ ذخیره‌شدهٔ ساخته‌شده از فلش‌کارت‌ها (بانک سؤال شخصی) */
  cardQuestions?: CardQuestion[];
  /** سابقهٔ پاسخ به کارت‌ها — برای آمار و جلوگیری از ثبت چندباره */
  cardAttempts?: CardAttempt[];
  /** نتیجهٔ جلسه‌های فلش‌کارت (آزمون زمان‌دار/چهارگزینه‌ای/مرور) */
  flashSessions?: FlashSessionResult[];
  /** 🏥 پاسخ‌های ثبت‌شدهٔ بانک آزمون (فقط متادیتای کوچک، نه متن سؤال) */
  examBankAttempts?: BankAttempt[];
  /** 🏥 تاریخچهٔ آزمون‌های بانک سؤال */
  examBankSessions?: BankSessionResult[];
  /** 🏥 شناسهٔ سؤال‌های نشان‌دار (مرور مجدد) */
  examBankBookmarks?: string[];
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
  /** سطل زباله — آیتم‌های قدیمی‌تر از ۳۰ روز خودکار پاک می‌شوند */
  trash: TrashedItem[];
  /** برنامه‌ی جنگیِ فعال (null یعنی جنگی در کار نیست) */
  cram: CramPlan | null;
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

/** پیش‌فرضِ صوتی: موتورِ خود گوشی، سرعت طبیعی، مکث ۴ ثانیه بین سؤال و پاسخ */
export const DEFAULT_TTS: TtsSettings = {
  engine: "system",
  rate: 1,
  pitch: 1,
  volume: 1,
  answerPauseSec: 4,
  cardGapSec: 1.5,
  repeat: 1,
  mode: "qa",
  autoNext: true,
};

export const TTS_RATE_RANGE = { min: 0.5, max: 2 } as const;

export const DEFAULT_SETTINGS: UserSettings = {
  theme: "system",
  accentColor: "#1e40af",
  themePack: "navy",
  themeFamily: "navy",
  tts: DEFAULT_TTS,
  aiCardCount: 12,
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
  streakFreezeDates: [],
  streakFreezeBoughtOn: [],
  breakReminderMinutes: 50,
  autoBackup: { enabled: true, intervalDays: 7 },
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

/** برچسب/آیکن جلسه — همان چهار فاز برنامه به‌علاوهٔ «ترکیبی» (درسنامه و تست با هم) */
export const STUDY_KIND_LABEL: Record<StudyKind, string> = {
  ...TASK_KIND_LABEL,
  mixed: "ترکیبی (درسنامه + تست)",
};

export const STUDY_KIND_ICON: Record<StudyKind, string> = {
  ...TASK_KIND_ICON,
  mixed: "🔀",
};

/** دسته‌های تسکی که یک جلسه می‌تواند پرشان کند (mixed = یادگیری و تست) */
export function studyKindTaskKinds(kinds: StudyKind[] | undefined, fallback?: StudyKind): TaskKind[] {
  const list = kinds && kinds.length > 0 ? kinds : fallback ? [fallback] : [];
  const out = new Set<TaskKind>();
  for (const k of list) {
    if (k === "mixed") {
      out.add("learn");
      out.add("test");
    } else {
      out.add(k);
    }
  }
  return [...out];
}

/** اگر جلسه چند «نحوه‌ی مطالعه» دارد، یک برچسبِ تک برای ذخیره‌ی سازگار انتخاب می‌کند */
export function collapseStudyKinds(kinds: StudyKind[] | undefined): StudyKind | undefined {
  if (!kinds || kinds.length === 0) return undefined;
  return kinds.length === 1 ? kinds[0] : "mixed";
}

/** ورودی‌های قدیمی (تک‌نوع) و تازه (چندنوع) را به فهرست یکدست تبدیل می‌کند */
export function normalizeStudyKinds(input: StudyKind | StudyKind[] | undefined): StudyKind[] {
  if (input == null) return [];
  const arr = Array.isArray(input) ? input : [input];
  const seen = new Set<StudyKind>();
  for (const k of arr) {
    if (seen.has("mixed") || (k === "mixed" && seen.size > 0)) {
      // «ترکیبی» با بقیه جمع نمی‌شود؛ خودش همه‌چیز را پوشش می‌دهد
      return ["mixed"];
    }
    seen.add(k);
  }
  return [...seen];
}

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
