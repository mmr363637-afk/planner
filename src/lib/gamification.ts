// ===== Gamification – XP, levels and achievements =====
import type { AppState } from "../types";
import { addDays, todayKey } from "./jalali";
import { completedTopics, computeStreak, totalMinutes } from "./stats";

export const XP_PER_MINUTE = 1;
export const XP_PER_REVIEW = 10;
export const XP_PER_MASTERED = 25;
export const XP_PER_TASK = 5;

export type AchievementGroup = "sessions" | "topics" | "reviews" | "plans" | "streak" | "habits" | "xp";

export const ACHIEVEMENT_GROUPS: { id: AchievementGroup; label: string; icon: string }[] = [
  { id: "sessions", label: "زمان و جلسات", icon: "⏱" },
  { id: "topics", label: "مباحث و یادگیری", icon: "✅" },
  { id: "reviews", label: "مرور فاصله‌دار", icon: "🔁" },
  { id: "plans", label: "برنامه و نظم", icon: "🗓️" },
  { id: "streak", label: "تداوم و استمرار", icon: "🔥" },
  { id: "habits", label: "عادت‌های طلایی", icon: "🌅" },
  { id: "xp", label: "تجربه و سطح", icon: "⭐" },
];

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  group: AchievementGroup;
  check: (state: AppState) => boolean;
}

const doneReviews = (s: AppState) => s.reviews.filter((r) => r.status === "done").length;
const doneTasks = (s: AppState) => s.tasks.filter((t) => t.status === "done").length;

/** بیشترین دقایق مطالعه در یک روز */
function maxMinutesInOneDay(s: AppState): number {
  const byDate = new Map<string, number>();
  for (const x of s.sessions) byDate.set(x.date, (byDate.get(x.date) ?? 0) + x.durationMinutes);
  return Math.max(0, ...byDate.values());
}

/** آیا روزی هست که ≥۲ کار برنامه داشته و همه‌شان انجام شده باشند */
function hasPerfectDay(s: AppState): boolean {
  const byDate = new Map<string, AppState["tasks"]>();
  for (const t of s.tasks) {
    const arr = byDate.get(t.date) ?? [];
    arr.push(t);
    byDate.set(t.date, arr);
  }
  return [...byDate.values()].some((tasks) => tasks.length >= 2 && tasks.every((t) => t.status === "done"));
}

/** چند روزِ متمایز از ۱۴ روز اخیر مطالعه شده است */
function activeDaysInLast14(s: AppState): number {
  const from = addDays(todayKey(), -13);
  return new Set(s.sessions.filter((x) => x.date >= from && x.date <= todayKey()).map((x) => x.date)).size;
}

const sessionStartedInHourWindow = (s: AppState, pred: (h: number) => boolean) => s.sessions.some((x) => pred(new Date(x.startedAt).getHours()));

export const ACHIEVEMENTS: AchievementDef[] = [
  // ── زمان و جلسات ────────────────────────────────────────────────
  {
    id: "first_session",
    title: "اولین قدم",
    description: "اولین جلسه مطالعه را انجام دادی",
    icon: "🌱",
    group: "sessions",
    check: (s) => s.sessions.length >= 1,
  },
  {
    id: "sessions_10",
    title: "۱۰ جلسه مطالعه",
    description: "ده جلسه‌ی کامل مطالعه داشتی",
    icon: "🧠",
    group: "sessions",
    check: (s) => s.sessions.length >= 10,
  },
  {
    id: "sessions_50",
    title: "۵۰ جلسه مطالعه",
    description: "پنجاه جلسه‌ی مطالعه؛ عالی پیش می‌روی",
    icon: "🚀",
    group: "sessions",
    check: (s) => s.sessions.length >= 50,
  },
  {
    id: "sessions_200",
    title: "۲۰۰ جلسه مطالعه",
    description: "دویست جلسه‌ی مطالعه؛ یک حرفه‌ای واقعی",
    icon: "🎯",
    group: "sessions",
    check: (s) => s.sessions.length >= 200,
  },
  {
    id: "hours_10",
    title: "۱۰ ساعت مطالعه",
    description: "مجموع مطالعه به ۱۰ ساعت رسید",
    icon: "📘",
    group: "sessions",
    check: (s) => totalMinutes(s.sessions) >= 600,
  },
  {
    id: "hours_50",
    title: "۵۰ ساعت مطالعه",
    description: "مجموع مطالعه به ۵۰ ساعت رسید",
    icon: "📚",
    group: "sessions",
    check: (s) => totalMinutes(s.sessions) >= 3000,
  },
  {
    id: "hours_100",
    title: "۱۰۰ ساعت مطالعه",
    description: "یک قرن دقیقه! ۱۰۰ ساعت مطالعه",
    icon: "🎓",
    group: "sessions",
    check: (s) => totalMinutes(s.sessions) >= 6000,
  },
  {
    id: "hours_200",
    title: "۲۰۰ ساعت مطالعه",
    description: "مجموع مطالعه به ۲۰۰ ساعت رسید",
    icon: "🏅",
    group: "sessions",
    check: (s) => totalMinutes(s.sessions) >= 12000,
  },
  {
    id: "hours_500",
    title: "۵۰۰ ساعت مطالعه",
    description: "نیم‌هزار ساعت! ادامه بده",
    icon: "💎",
    group: "sessions",
    check: (s) => totalMinutes(s.sessions) >= 30000,
  },
  {
    id: "hours_1000",
    title: "۱۰۰۰ ساعت مطالعه",
    description: "هزار ساعت مطالعه؛ افسانه شدی",
    icon: "👑",
    group: "sessions",
    check: (s) => totalMinutes(s.sessions) >= 60000,
  },
  {
    id: "day_4h",
    title: "روز سنگین",
    description: "یک روز، ۴ ساعت مطالعه کردی",
    icon: "⚡",
    group: "sessions",
    check: (s) => maxMinutesInOneDay(s) >= 240,
  },
  {
    id: "day_8h",
    title: "روز افسانه‌ای",
    description: "در یک روز ۸ ساعت مطالعه کردی",
    icon: "🌟",
    group: "sessions",
    check: (s) => maxMinutesInOneDay(s) >= 480,
  },

  // ── مباحث و یادگیری ─────────────────────────────────────────────
  {
    id: "topics_1",
    title: "اولین مبحث",
    description: "اولین مبحث را کامل یاد گرفتی",
    icon: "🐣",
    group: "topics",
    check: (s) => completedTopics(s.topics) >= 1,
  },
  {
    id: "topics_3",
    title: "سه مبحث یادگرفته",
    description: "۳ مبحث را کامل یاد گرفتی",
    icon: "📗",
    group: "topics",
    check: (s) => completedTopics(s.topics) >= 3,
  },
  {
    id: "topics_10",
    title: "۱۰ مبحث تکمیل‌شده",
    description: "۱۰ مبحث را کامل یاد گرفتی",
    icon: "✅",
    group: "topics",
    check: (s) => completedTopics(s.topics) >= 10,
  },
  {
    id: "topics_25",
    title: "۲۵ مبحث تکمیل‌شده",
    description: "یک‌چهارمِ صدتایی! ۲۵ مبحث کامل",
    icon: "📙",
    group: "topics",
    check: (s) => completedTopics(s.topics) >= 25,
  },
  {
    id: "topics_50",
    title: "۵۰ مبحث تکمیل‌شده",
    description: "نیم‌صد مبحث را کامل یاد گرفتی",
    icon: "🎖️",
    group: "topics",
    check: (s) => completedTopics(s.topics) >= 50,
  },
  {
    id: "topics_100",
    title: "۱۰۰ مبحث تکمیل‌شده",
    description: "۱۰۰ مبحث را کامل یاد گرفتی",
    icon: "🥇",
    group: "topics",
    check: (s) => completedTopics(s.topics) >= 100,
  },
  {
    id: "topics_250",
    title: "۲۵۰ مبحث تکمیل‌شده",
    description: "۲۵۰ مبحث؛ دایرةالمعارف شدی",
    icon: "🏆",
    group: "topics",
    check: (s) => completedTopics(s.topics) >= 250,
  },
  {
    id: "topics_500",
    title: "۵۰۰ مبحث تکمیل‌شده",
    description: "پانصد مبحث؛ بی‌نظیر!",
    icon: "🌠",
    group: "topics",
    check: (s) => completedTopics(s.topics) >= 500,
  },

  // ── مرور فاصله‌دار ──────────────────────────────────────────────
  {
    id: "reviews_1",
    title: "اولین مرور",
    description: "اولین مرور برنامه‌ریزی‌شده را انجام دادی",
    icon: "🔁",
    group: "reviews",
    check: (s) => doneReviews(s) >= 1,
  },
  {
    id: "reviews_10",
    title: "۱۰ مرور منظم",
    description: "ده مرور انجام دادی؛ مرورگرِ منظمی می‌شوی",
    icon: "📇",
    group: "reviews",
    check: (s) => doneReviews(s) >= 10,
  },
  {
    id: "reviews_25",
    title: "مرورگر منظم",
    description: "۲۵ مرور را انجام دادی",
    icon: "🗂️",
    group: "reviews",
    check: (s) => doneReviews(s) >= 25,
  },
  {
    id: "reviews_100",
    title: "۱۰۰ مرور",
    description: "صد مرور؛ حافظه‌ات در حال قوی‌شدن است",
    icon: "♻️",
    group: "reviews",
    check: (s) => doneReviews(s) >= 100,
  },
  {
    id: "reviews_500",
    title: "۵۰۰ مرور",
    description: "پانصد مرور؛ استادِ مرور",
    icon: "🧘",
    group: "reviews",
    check: (s) => doneReviews(s) >= 500,
  },
  {
    id: "reviews_1000",
    title: "۱۰۰۰ مرور",
    description: "هزار مرور؛ حافظه‌ات آهنین شد",
    icon: "🛡️",
    group: "reviews",
    check: (s) => doneReviews(s) >= 1000,
  },

  // ── برنامه و نظم ────────────────────────────────────────────────
  {
    id: "first_plan",
    title: "برنامه‌ریز",
    description: "اولین برنامه مطالعه را ساختی",
    icon: "🗓️",
    group: "plans",
    check: (s) => s.plans.length >= 1,
  },
  {
    id: "plan_5",
    title: "۵ برنامه ساخته‌شده",
    description: "پنج برنامه‌ی مطالعه ساختی",
    icon: "📆",
    group: "plans",
    check: (s) => s.plans.length >= 5,
  },
  {
    id: "plan_15",
    title: "برنامه‌ساز حرفه‌ای",
    description: "پانزده برنامه‌ی مطالعه ساختی",
    icon: "🧭",
    group: "plans",
    check: (s) => s.plans.length >= 15,
  },
  {
    id: "tasks_10",
    title: "۱۰ کارِ تمام‌شده",
    description: "ده کار برنامه‌ریزی‌شده را به پایان رساندی",
    icon: "📋",
    group: "plans",
    check: (s) => doneTasks(s) >= 10,
  },
  {
    id: "tasks_100",
    title: "۱۰۰ کارِ تمام‌شده",
    description: "صد کارِ برنامه را کامل کردی",
    icon: "🧾",
    group: "plans",
    check: (s) => doneTasks(s) >= 100,
  },
  {
    id: "tasks_500",
    title: "۵۰۰ کارِ تمام‌شده",
    description: "پانصد کار؛ برنامه‌هایت را یکی‌یکی فتح کردی",
    icon: "🏁",
    group: "plans",
    check: (s) => doneTasks(s) >= 500,
  },
  {
    id: "perfect_day",
    title: "روز بی‌نقص",
    description: "در یک روز، همه‌ی کارهای برنامه را تمام کردی",
    icon: "😇",
    group: "plans",
    check: (s) => hasPerfectDay(s),
  },
  {
    id: "exam_ready",
    title: "آماده‌باش",
    description: "اولین امتحان را در تقویم ثبت کردی",
    icon: "📝",
    group: "plans",
    check: (s) => s.exams.length >= 1,
  },

  // ── تداوم و استمرار ─────────────────────────────────────────────
  {
    id: "streak_3",
    title: "سه روز پیاپی",
    description: "۳ روز متوالی مطالعه کردی",
    icon: "✨",
    group: "streak",
    check: (s) => computeStreak(s.sessions) >= 3,
  },
  {
    id: "streak_7",
    title: "یک هفته پیاپی",
    description: "۷ روز متوالی مطالعه کردی",
    icon: "🔥",
    group: "streak",
    check: (s) => computeStreak(s.sessions) >= 7,
  },
  {
    id: "streak_14",
    title: "دو هفته پیاپی",
    description: "۱۴ روز بی‌وقفه مطالعه کردی",
    icon: "💪",
    group: "streak",
    check: (s) => computeStreak(s.sessions) >= 14,
  },
  {
    id: "streak_30",
    title: "یک ماه پیاپی",
    description: "۳۰ روز متوالی مطالعه کردی",
    icon: "🏆",
    group: "streak",
    check: (s) => computeStreak(s.sessions) >= 30,
  },
  {
    id: "streak_60",
    title: "دو ماه پیاپی",
    description: "۶۰ روز بی‌وقفه؛ واقعاً منظمی",
    icon: "🎢",
    group: "streak",
    check: (s) => computeStreak(s.sessions) >= 60,
  },
  {
    id: "streak_100",
    title: "صد روز پیاپی",
    description: "۱۰۰ روز متوالی مطالعه؛ رکورددار",
    icon: "💫",
    group: "streak",
    check: (s) => computeStreak(s.sessions) >= 100,
  },
  {
    id: "streak_365",
    title: "یک سال پیاپی",
    description: "۳۶۵ روز بی‌وقفه؛ افسانه‌ای شدی",
    icon: "🌞",
    group: "streak",
    check: (s) => computeStreak(s.sessions) >= 365,
  },

  // ── عادت‌های طلایی ──────────────────────────────────────────────
  {
    id: "pomodoro_5",
    title: "آشنای پومودورو",
    description: "۵ جلسه‌ی پومودورو را کامل کردی",
    icon: "🍅",
    group: "habits",
    check: (s) => s.sessions.filter((x) => x.mode === "pomodoro").length >= 5,
  },
  {
    id: "pomodoro_50",
    title: "سلطان پومودورو",
    description: "۵۰ جلسه‌ی پومودورو؛ تمرکزت عالی است",
    icon: "⏳",
    group: "habits",
    check: (s) => s.sessions.filter((x) => x.mode === "pomodoro").length >= 50,
  },
  {
    id: "early_bird",
    title: "سحرخیز",
    description: "قبل از ساعت ۷ صبح مطالعه را شروع کردی",
    icon: "🌅",
    group: "habits",
    check: (s) => sessionStartedInHourWindow(s, (h) => h < 7),
  },
  {
    id: "night_owl",
    title: "شب‌زنده‌دار مطالعه",
    description: "بعد از ۱۱ شب هم مطالعه کردی",
    icon: "🦉",
    group: "habits",
    check: (s) => sessionStartedInHourWindow(s, (h) => h >= 23 || h < 4),
  },
  {
    id: "active_14",
    title: "دو هفته‌ی پربار",
    description: "در ۱۴ روز اخیر، ۱۰ روز مطالعه کردی",
    icon: "🌊",
    group: "habits",
    check: (s) => activeDaysInLast14(s) >= 10,
  },

  // ── تجربه و سطح ─────────────────────────────────────────────────
  {
    id: "xp_1000",
    title: "۱۰۰۰ XP",
    description: "هزار امتیاز تجربه جمع کردی",
    icon: "🪙",
    group: "xp",
    check: (s) => s.settings.xp >= 1000,
  },
  {
    id: "xp_5000",
    title: "۵۰۰۰ XP",
    description: "پنج هزار امتیاز؛ سطح‌های بالاتر در راه است",
    icon: "🥈",
    group: "xp",
    check: (s) => s.settings.xp >= 5000,
  },
  {
    id: "xp_25000",
    title: "۲۵۰۰۰ XP",
    description: "بیست‌وپنج هزار امتیاز؛ حرفه‌ای واقعی",
    icon: "🥇",
    group: "xp",
    check: (s) => s.settings.xp >= 25000,
  },
  {
    id: "xp_100000",
    title: "۱۰۰۰۰۰ XP",
    description: "صد هزار امتیاز؛ اسطوره‌ی مطالعه",
    icon: "💠",
    group: "xp",
    check: (s) => s.settings.xp >= 100000,
  },
];

export function levelFromXp(xp: number): { level: number; current: number; next: number; progress: number } {
  // Level n requires 100 * n^2 xp cumulative
  let level = 1;
  while (xp >= 100 * level * level) level++;
  const current = 100 * (level - 1) * (level - 1);
  const next = 100 * level * level;
  return { level, current, next, progress: Math.round(((xp - current) / (next - current)) * 100) };
}

export const LEVEL_TITLES = ["نوآموز", "دانشجو", "کارورز", "رزیدنت", "متخصص", "استاد"];

export function levelTitle(level: number): string {
  return LEVEL_TITLES[Math.min(LEVEL_TITLES.length - 1, Math.floor((level - 1) / 2))];
}
