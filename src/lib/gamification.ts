// ===== Gamification – XP, levels and achievements =====
import type { AppState } from "../types";
import { completedTopics, computeStreak, totalMinutes } from "./stats";

export const XP_PER_MINUTE = 1;
export const XP_PER_REVIEW = 10;
export const XP_PER_MASTERED = 25;
export const XP_PER_TASK = 5;

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  check: (state: AppState) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first_session",
    title: "اولین قدم",
    description: "اولین جلسه مطالعه را انجام دادی",
    icon: "🌱",
    check: (s) => s.sessions.length >= 1,
  },
  {
    id: "hours_10",
    title: "۱۰ ساعت مطالعه",
    description: "مجموع مطالعه به ۱۰ ساعت رسید",
    icon: "📘",
    check: (s) => totalMinutes(s.sessions) >= 600,
  },
  {
    id: "hours_50",
    title: "۵۰ ساعت مطالعه",
    description: "مجموع مطالعه به ۵۰ ساعت رسید",
    icon: "📚",
    check: (s) => totalMinutes(s.sessions) >= 3000,
  },
  {
    id: "hours_100",
    title: "۱۰۰ ساعت مطالعه",
    description: "یک قرن دقیقه! ۱۰۰ ساعت مطالعه",
    icon: "🎓",
    check: (s) => totalMinutes(s.sessions) >= 6000,
  },
  {
    id: "streak_3",
    title: "سه روز پیاپی",
    description: "۳ روز متوالی مطالعه کردی",
    icon: "✨",
    check: (s) => computeStreak(s.sessions) >= 3,
  },
  {
    id: "streak_7",
    title: "یک هفته پیاپی",
    description: "۷ روز متوالی مطالعه کردی",
    icon: "🔥",
    check: (s) => computeStreak(s.sessions) >= 7,
  },
  {
    id: "streak_30",
    title: "یک ماه پیاپی",
    description: "۳۰ روز متوالی مطالعه کردی",
    icon: "🏆",
    check: (s) => computeStreak(s.sessions) >= 30,
  },
  {
    id: "topics_10",
    title: "۱۰ مبحث تکمیل‌شده",
    description: "۱۰ مبحث را کامل یاد گرفتی",
    icon: "✅",
    check: (s) => completedTopics(s.topics) >= 10,
  },
  {
    id: "topics_100",
    title: "۱۰۰ مبحث تکمیل‌شده",
    description: "۱۰۰ مبحث را کامل یاد گرفتی",
    icon: "🥇",
    check: (s) => completedTopics(s.topics) >= 100,
  },
  {
    id: "reviews_25",
    title: "مرورگر منظم",
    description: "۲۵ مرور را انجام دادی",
    icon: "🔁",
    check: (s) => s.reviews.filter((r) => r.status === "done").length >= 25,
  },
  {
    id: "first_plan",
    title: "برنامه‌ریز",
    description: "اولین برنامه مطالعه را ساختی",
    icon: "🗓️",
    check: (s) => s.plans.length >= 1,
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
