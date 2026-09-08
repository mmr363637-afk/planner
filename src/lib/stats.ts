// ===== Statistics helpers – pure, testable =====
import type { StudySession, StudyTask, Topic } from "../types";
import { JALALI_MONTHS, addDays, diffDays, keyToJalali, startOfWeek, todayKey, weekdayOf } from "./jalali";

export function minutesOnDate(sessions: StudySession[], date: string): number {
  return sessions.filter((s) => s.date === date).reduce((sum, s) => sum + s.durationMinutes, 0);
}

export function minutesInRange(sessions: StudySession[], from: string, to: string): number {
  return sessions.filter((s) => s.date >= from && s.date <= to).reduce((sum, s) => sum + s.durationMinutes, 0);
}

export function totalMinutes(sessions: StudySession[]): number {
  return sessions.reduce((sum, s) => sum + s.durationMinutes, 0);
}

/**
 * Consecutive days (ending today or yesterday) with at least one session.
 * `freezes` = تعداد یخ‌زدگی‌های موجود: هر روزِ جامانده یک یخ‌زدگی مصرف می‌کند و
 * زنجیره نشکسته می‌شود (روزِ یخ‌زده به طول streak اضافه نمی‌کند). رفتار با freezes=0
 * دقیقاً مانند قبل است. روزِ امروزِ خالی یخ‌زدگی مصرف نمی‌کند (هنوز تمام نشده).
 */
export function computeStreak(sessions: StudySession[], today: string = todayKey(), freezes: number = 0): number {
  const days = new Set(sessions.filter((s) => s.durationMinutes > 0).map((s) => s.date));
  if (days.size === 0) return 0;
  let cursor = days.has(today) ? today : addDays(today, -1);
  if (!days.has(cursor) && freezes <= 0) return 0;
  let skips = freezes;
  let streak = 0;
  while (true) {
    if (days.has(cursor)) {
      streak++;
      cursor = addDays(cursor, -1);
      continue;
    }
    // روز خالی: امروز هنوز تمام نشده، ولی روزهای قبل باید پر یا یخ‌زده باشند
    if (skips > 0) {
      skips--;
      cursor = addDays(cursor, -1);
      continue;
    }
    break;
  }
  return streak;
}

/** آمار پومودورو: مجموع سیکل‌ها، سیکل‌های این هفته و روزهای فعال پومودورو */
export function pomodoroStats(sessions: StudySession[], today: string = todayKey()) {
  let total = 0;
  let week = 0;
  const weekStart = startOfWeek(today);
  let activeDays = new Set<string>();
  for (const s of sessions) {
    const cycles = s.cycles ?? 0;
    if (s.mode === "pomodoro" && cycles > 0) {
      total += cycles;
      activeDays.add(s.date);
      if (s.date >= weekStart && s.date <= today) week += cycles;
    }
  }
  return { total, week, activeDays: activeDays.size };
}

/** وضعیت هدف روزانه بر اساس دقیقه‌های مطالعه‌شده */
export function dailyGoalProgress(studiedMinutes: number, goalMinutes: number) {
  if (goalMinutes <= 0) return { pct: 0, done: false, remaining: 0 };
  return {
    pct: Math.min(100, Math.round((studiedMinutes / goalMinutes) * 100)),
    done: studiedMinutes >= goalMinutes,
    remaining: Math.max(0, goalMinutes - studiedMinutes),
  };
}

/**
 * آیا این جلسه مستحق پاداشِ «رسیدن به هدف روزانه» است؟
 * فقط وقتی با همین جلسه از زیر هدف به هدف برسیم و پاداش امروز قبلاً داده نشده باشد.
 */
export function shouldAwardDailyGoalBonus(
  studiedBeforeSession: number,
  sessionMinutes: number,
  goalMinutes: number,
  lastBonusDate: string | undefined,
  today: string,
): boolean {
  if (goalMinutes <= 0 || sessionMinutes <= 0) return false;
  if (lastBonusDate === today) return false;
  return studiedBeforeSession < goalMinutes && studiedBeforeSession + sessionMinutes >= goalMinutes;
}

export function plannedMinutesOnDate(tasks: StudyTask[], date: string): number {
  return tasks.filter((t) => t.date === date && t.status !== "skipped").reduce((s, t) => s + t.plannedMinutes, 0);
}

export function doneMinutesOnDate(tasks: StudyTask[], date: string): number {
  return tasks.filter((t) => t.date === date && t.status !== "skipped").reduce((s, t) => s + Math.min(t.doneMinutes, t.plannedMinutes), 0);
}

/** Percentage 0..100 of plan completion for a date range based on tasks */
export function planAdherence(tasks: StudyTask[], from: string, to: string): number {
  const inRange = tasks.filter((t) => t.date >= from && t.date <= to && t.status !== "skipped");
  const planned = inRange.reduce((s, t) => s + t.plannedMinutes, 0);
  if (planned === 0) return 0;
  const done = inRange.reduce((s, t) => s + (t.status === "done" ? t.plannedMinutes : Math.min(t.doneMinutes, t.plannedMinutes)), 0);
  return Math.min(100, Math.round((done / planned) * 100));
}

export function weeklyAdherence(tasks: StudyTask[], today: string = todayKey()): number {
  const start = startOfWeek(today);
  return planAdherence(tasks, start, addDays(start, 6));
}

export function last7Days(sessions: StudySession[], today: string = todayKey()) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    return { date, minutes: minutesOnDate(sessions, date) };
  });
}

/** Display bucket only: never persisted as a fake subject or topic. */
export const UNASSIGNED_SUBJECT_ID = "__unassigned_study__";

export function minutesBySubject(sessions: StudySession[], topics: Topic[]): Record<string, number> {
  const topicSubject = new Map(topics.map((t) => [t.id, t.subjectId]));
  const out: Record<string, number> = {};
  for (const s of sessions) {
    const sid = (s.topicId != null ? topicSubject.get(s.topicId) : undefined) ?? UNASSIGNED_SUBJECT_ID;
    out[sid] = (out[sid] ?? 0) + s.durationMinutes;
  }
  return out;
}

export function completedTopics(topics: Topic[]): number {
  return topics.filter((t) => t.status === "mastered").length;
}

export function daysBehind(tasks: StudyTask[], today: string = todayKey()): number {
  const overdueDates = tasks.filter((t) => t.status === "pending" && t.date < today).map((t) => t.date);
  if (overdueDates.length === 0) return 0;
  const earliest = overdueDates.sort()[0];
  return Math.max(1, Math.min(new Set(overdueDates).size, diffDays(earliest, today)));
}


// ===== نقشه‌ی حرارتی سالانه (مثل GitHub) =====

export interface HeatmapCell {
  date: string;
  minutes: number;
  /** روز هفته‌ی JS: 0=یکشنبه … 6=شنبه */
  dow: number;
}

/**
 * سلول‌های heatmap برای `days` روز اخیر؛ هم‌تراز با هفته‌ی شنبه‌شروع.
 * ستون‌ها = هفته‌ها (قدیمی‌ترین → جدیدترین)، ردیف‌ها = شنبه تا جمعه.
 */
export function heatmapData(sessions: StudySession[], today: string = todayKey(), days = 364) {
  const minutesByDate = new Map<string, number>();
  for (const s of sessions) {
    if (s.durationMinutes > 0) minutesByDate.set(s.date, (minutesByDate.get(s.date) ?? 0) + s.durationMinutes);
  }
  let start = addDays(today, -(days - 1));
  while (weekdayOf(start) !== 6) start = addDays(start, -1); // تا شنبه‌ی آن هفته برگرد
  const cells: HeatmapCell[] = [];
  const months: { col: number; label: string }[] = [];
  let lastJm = -1;
  let cur = start;
  let col = 0;
  // تا شنبه‌ی بعد از امروز ادامه بده تا ستون آخر هم هفته‌ی کامل باشد (روزهای آینده خالی‌اند)
  while (cur <= today || weekdayOf(cur) !== 6) {
    cells.push({ date: cur, minutes: minutesByDate.get(cur) ?? 0, dow: weekdayOf(cur) });
    const { jm } = keyToJalali(cur);
    if (jm !== lastJm && weekdayOf(cur) === 6) {
      months.push({ col, label: JALALI_MONTHS[jm - 1] });
      lastJm = jm;
    }
    if (weekdayOf(cur) === 5) col++; // آخر هفته (جمعه) → ستون بعد
    cur = addDays(cur, 1);
  }
  return { cells, months, weeks: col };
}

/** شدت رنگ ۰..۴ برای دقیقه‌های مطالعه */
export function heatLevel(minutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0) return 0;
  if (minutes < 30) return 1;
  if (minutes < 60) return 2;
  if (minutes < 120) return 3;
  return 4;
}

// ----- صدا ↔ مطالعه: «با چه صدایی بیشتر می‌خوانی؟» -----

/** مجموع دقایقِ مطالعه به تفکیک هر صدای محیطی که هنگام جلسه روشن بوده */
export function soundMinutes(sessions: StudySession[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of sessions) {
    if (!s.ambient || s.ambient.length === 0) continue;
    for (const id of s.ambient) out[id] = (out[id] ?? 0) + s.durationMinutes;
  }
  return out;
}

/** شمارش صداهای پراستفاده به ترتیب زمان مطالعه (فقط آن‌هایی که داده دارند) */
export function topSounds(sessions: StudySession[], limit = 4): { id: string; minutes: number }[] {
  return Object.entries(soundMinutes(sessions))
    .map(([id, minutes]) => ({ id, minutes }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, limit);
}

// ----- حواس‌پرتی -----

/** مجموع دفعات حواس‌پرتیِ ثبت‌شده در همه‌ی جلسات (برای آمار) */
export function totalDistractions(sessions: StudySession[]): number {
  return sessions.reduce((sum, s) => sum + (s.distractions ?? 0), 0);
}

/** حواس‌پرتی امروز (با درنظرگیریِ جلسات) */
export function distractionsOnDate(sessions: StudySession[], date: string): number {
  return sessions.filter((s) => s.date === date).reduce((sum, s) => sum + (s.distractions ?? 0), 0);
}

// ----- پیش‌بینی بارِ مرور در روزهای آینده -----

export interface ForecastDay {
  date: string;
  count: number;
}

/**
 * تعداد مرورهای سررسید (مبحث + فلش‌کارت) برای `days` روزِ آینده از امروز.
 * فقط آیتم‌های pending شمرده می‌شوند؛ عقب‌افتاده‌ها داخل روزِ اول می‌مانند.
 */
export function reviewForecast(
  reviews: { dueDate: string; status: string }[],
  flashcards: { dueDate: string }[],
  today: string = todayKey(),
  days = 14,
): ForecastDay[] {
  const out: ForecastDay[] = [];
  const clamped = Math.max(1, Math.min(60, Math.floor(days)));
  for (let i = 0; i < clamped; i++) out.push({ date: addDays(today, i), count: 0 });
  const byDate = new Map(out.map((d, i) => [d.date, i]));
  const end = out[clamped - 1].date;
  for (const r of reviews) {
    if (r.status !== "pending") continue;
    // عقب‌افتاده‌ها به روزِ اول می‌افتند (هرچه زودتر باید انجام شوند)
    const key = r.dueDate < today ? today : r.dueDate;
    if (key > end) continue;
    const idx = byDate.get(key);
    if (idx !== undefined) out[idx].count += 1;
  }
  for (const c of flashcards) {
    const key = c.dueDate < today ? today : c.dueDate;
    if (key > end) continue;
    const idx = byDate.get(key);
    if (idx !== undefined) out[idx].count += 1;
  }
  return out;
}
