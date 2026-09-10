// ===== رقابت با سایه‌ی خودت — بهترین هفته‌ی گذشته در برابر هفته‌ی جاری =====
import type { StudySession } from "../types";
import { addDays, startOfWeek } from "./jalali";

export interface GhostWeek {
  start: string;
  minutes: number;
}

/** بهترین بازه‌ی ۷ روزه‌ی پیاپی (تقویمی) در کل سابقه */
export function bestRollingWeek(sessions: StudySession[]): GhostWeek | null {
  const byDate = new Map<string, number>();
  for (const s of sessions) {
    if (s.durationMinutes <= 0) continue;
    byDate.set(s.date, (byDate.get(s.date) ?? 0) + s.durationMinutes);
  }
  if (byDate.size === 0) return null;
  const days = [...byDate.keys()].sort();
  let best: GhostWeek = { start: days[0], minutes: 0 };
  // هر روزِ دارای سابقه، شروعِ یک پنجره‌ی ۷ روزه
  for (const start of days) {
    let sum = 0;
    for (let i = 0; i < 7; i++) sum += byDate.get(addDays(start, i)) ?? 0;
    if (sum > best.minutes) best = { start, minutes: sum };
  }
  return best.minutes > 0 ? best : null;
}

/** دقایق هفته‌ی جاری (از شنبه تا امروز) */
export function currentWeekMinutes(sessions: StudySession[], today: string): number {
  const ws = startOfWeek(today);
  return sessions.filter((s) => s.date >= ws && s.date <= today).reduce((sum, s) => sum + s.durationMinutes, 0);
}
