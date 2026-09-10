// ===== عادت‌ها — محاسبات خالص =====
import { addDays, startOfWeek } from "./jalali";

/** زنجیره‌ی فعلی عادت: روزهای پیاپیِ انجام‌شده تا امروز (یا دیروز، اگر امروز هنوز نشده) */
export function habitStreak(history: string[], today: string): number {
  const set = new Set(history);
  let streak = 0;
  let cursor = set.has(today) ? today : addDays(today, -1);
  while (set.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** تعداد انجام در هفته‌ی جاری (شنبه‌شروع) */
export function habitWeekCount(history: string[], today: string): number {
  const ws = startOfWeek(today);
  const end = addDays(ws, 7);
  return history.filter((d) => d >= ws && d < end).length;
}

/** آیا هدف هفتگی محقق شده؟ */
export function habitWeekDone(history: string[], targetPerWeek: number, today: string): boolean {
  return habitWeekCount(history, today) >= Math.max(1, targetPerWeek);
}
