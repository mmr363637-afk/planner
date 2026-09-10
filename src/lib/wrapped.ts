// ===== «خلاصه‌ی سال» — سبک Spotify Wrapped =====
// خلاصه‌ی کارت‌مانندِ از کل سال شمسیِ جاری: بهترین روز، بهترین هفته، درخشان‌ترین درس…
import type { StudySession, Subject, Topic } from "../types";
import { UNASSIGNED_SUBJECT_ID, minutesBySubject } from "./stats";
import { JALALI_MONTHS, addDays, jalaliToKey, keyToJalali, startOfWeek, todayKey } from "./jalali";

export interface YearWrapped {
  /** سال شمسی مورد نظر */
  jalaliYear: number;
  /** شروع سال تا امروز */
  totalMinutes: number;
  activeDays: number;
  sessionsCount: number;
  bestDay: { date: string; minutes: number } | null;
  bestWeek: { start: string; minutes: number } | null;
  longestStreak: number;
  topSubjectId: string | null;
  /** مجموع دقایق درسِ برتر */
  topSubjectMinutes: number;
  /** روز هفته‌ای که بیشتر در آن مطالعه شده (JS weekday) — null اگر دیتا نیست */
  bestWeekday: number | null;
  /** مجموع جلسات پومودوروی سال */
  pomodoroCycles: number;
  distractions: number;
}

/** آیا سالِ جاری (شمسی) دیتای کافی برای نمایش «خلاصه» دارد؟ */
export function wrappedAvailable(sessions: StudySession[], today: string = todayKey()): boolean {
  const { jy } = keyToJalali(today);
  const start = jalaliToKey(jy, 1, 1);
  const days = new Set(sessions.filter((s) => s.date >= start && s.date <= today && s.durationMinutes > 0).map((s) => s.date));
  return days.size >= 5;
}

/** آیا ماهِ جاری (شمسی) دیتای کافی برای «خلاصه‌ی ماه» دارد؟ (حداقل ۳ روز فعال) */
export function wrappedMonthAvailable(sessions: StudySession[], today: string = todayKey()): boolean {
  const start = jalaliToKey(keyToJalali(today).jy, keyToJalali(today).jm, 1);
  const days = new Set(sessions.filter((s) => s.date >= start && s.date <= today && s.durationMinutes > 0).map((s) => s.date));
  return days.size >= 3;
}

/** نام ماه شمسی امروز — برای عنوان «خلاصه‌ی ماه» */
export function currentJalaliMonthName(today: string = todayKey()): string {
  return JALALI_MONTHS[keyToJalali(today).jm - 1];
}

export function computeWrapped(sessions: StudySession[], _topics: Topic[], today: string = todayKey()): YearWrapped {
  const { jy } = keyToJalali(today);
  const start = jalaliToKey(jy, 1, 1);
  return { jalaliYear: jy, ...computeWrappedInRange(sessions, _topics, start, today) };
}

/** «خلاصه‌ی ماه» جاری شمسی */
export function computeMonthWrapped(sessions: StudySession[], _topics: Topic[], today: string = todayKey()): Omit<YearWrapped, "jalaliYear"> {
  const { jy, jm } = keyToJalali(today);
  return computeWrappedInRange(sessions, _topics, jalaliToKey(jy, jm, 1), today);
}

/** هسته‌ی مشترک محاسبه روی یک بازه‌ی دلخواه */
export function computeWrappedInRange(sessions: StudySession[], _topics: Topic[], from: string, to: string): Omit<YearWrapped, "jalaliYear"> {
  const start = from;
  const inYear = sessions.filter((s) => s.date >= start && s.date <= to && s.durationMinutes > 0);

  const byDate = new Map<string, number>();
  let totalMinutes = 0;
  let pomodoroCycles = 0;
  let distractions = 0;
  for (const s of inYear) {
    byDate.set(s.date, (byDate.get(s.date) ?? 0) + s.durationMinutes);
    totalMinutes += s.durationMinutes;
    pomodoroCycles += s.mode === "pomodoro" ? (s.cycles ?? 0) : 0;
    distractions += s.distractions ?? 0;
  }

  let bestDay: YearWrapped["bestDay"] = null;
  for (const [date, minutes] of byDate) {
    if (bestDay == null || minutes > bestDay.minutes) bestDay = { date, minutes };
  }

  // بهترین هفته (شنبه‌شروع)
  const byWeek = new Map<string, number>();
  for (const [date, m] of byDate) {
    const ws = startOfWeek(date);
    byWeek.set(ws, (byWeek.get(ws) ?? 0) + m);
  }
  let bestWeek: YearWrapped["bestWeek"] = null;
  for (const [ws, minutes] of byWeek) {
    if (bestWeek == null || minutes > bestWeek.minutes) bestWeek = { start: ws, minutes };
  }

  // طولانی‌ترین زنجیره در این سال
  const days = [...byDate.keys()].sort();
  let longestStreak = 0;
  let cur = 0;
  let prev: string | null = null;
  for (const d of days) {
    if (prev != null && addDays(prev, 1) === d) cur += 1;
    else cur = 1;
    if (cur > longestStreak) longestStreak = cur;
    prev = d;
  }

  // درس برتر
  const per = minutesBySubject(inYear, _topics);
  let topSubjectId: string | null = null;
  let topSubjectMinutes = 0;
  for (const [id, m] of Object.entries(per)) {
    if (id === UNASSIGNED_SUBJECT_ID) continue;
    if (m > topSubjectMinutes) {
      topSubjectId = id;
      topSubjectMinutes = m;
    }
  }

  // روز هفته‌ی محبوب
  const byDow = new Array<number>(7).fill(0);
  for (const [date, m] of byDate) byDow[new Date(date + "T12:00:00").getDay()] += m;
  let bestWeekday: number | null = null;
  let bestDowMin = 0;
  byDow.forEach((m, d) => {
    if (m > bestDowMin) {
      bestDowMin = m;
      bestWeekday = d;
    }
  });

  return {
    totalMinutes,
    activeDays: byDate.size,
    sessionsCount: inYear.length,
    bestDay,
    bestWeek,
    longestStreak,
    topSubjectId,
    topSubjectMinutes,
    bestWeekday,
    pomodoroCycles,
    distractions,
  };
}

export function wrappedSubjectName(wrapped: YearWrapped, subjects: Subject[]): string | null {
  if (!wrapped.topSubjectId) return null;
  return subjects.find((s) => s.id === wrapped.topSubjectId)?.name ?? null;
}
