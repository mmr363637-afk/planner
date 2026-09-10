// ===== آمار تست‌های تمرینی (زدن تست) =====
import type { TestLog } from "../types";
import { addDays, startOfWeek, todayKey } from "./jalali";

export const FREE_TEST_KEY = "__free_test__"; // تست بدون درس مشخص

export interface TestTotals {
  total: number;
  correct: number;
  /** درصد صحیح — null اگر تستی نیست */
  accuracy: number | null;
}

export function testTotals(logs: Pick<TestLog, "total" | "correct">[]): TestTotals {
  const total = logs.reduce((s, l) => s + l.total, 0);
  const correct = logs.reduce((s, l) => s + l.correct, 0);
  return { total, correct, accuracy: total > 0 ? Math.round((correct / total) * 100) : null };
}

/** دقت هر درس: topicId به درس نگاشت می‌شود (اینجا کلید = subjectId یا FREE_TEST_KEY) */
export function accuracyByGroup(logs: Pick<TestLog, "subjectId" | "total" | "correct">[]): Map<string, TestTotals> {
  const map = new Map<string, { total: number; correct: number }>();
  for (const l of logs) {
    const key = l.subjectId ?? FREE_TEST_KEY;
    const cur = map.get(key) ?? { total: 0, correct: 0 };
    cur.total += l.total;
    cur.correct += l.correct;
    map.set(key, cur);
  }
  const out = new Map<string, TestTotals>();
  for (const [k, v] of map) out.set(k, { ...v, accuracy: v.total > 0 ? Math.round((v.correct / v.total) * 100) : null });
  return out;
}

export interface WeekAccuracy {
  weekStart: string; // ISO شنبه
  total: number;
  correct: number;
  accuracy: number | null;
}

/** روند دقت تست در N هفته‌ی اخیر (برای نمودار) */
export function weeklyAccuracy(logs: TestLog[], today: string = todayKey(), weeks = 8): WeekAccuracy[] {
  const thisWeek = startOfWeek(today);
  const out: WeekAccuracy[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = addDays(thisWeek, -7 * i);
    const weekEnd = addDays(weekStart, 6);
    const inWeek = logs.filter((l) => l.date >= weekStart && l.date <= weekEnd);
    const t = testTotals(inWeek);
    out.push({ weekStart, total: t.total, correct: t.correct, accuracy: t.accuracy });
  }
  return out;
}

/** تعداد تست‌های N روز اخیر */
export function recentTestCount(logs: TestLog[], days: number, today: string = todayKey()): number {
  const from = addDays(today, -(days - 1));
  return logs.filter((l) => l.date >= from && l.date <= today).reduce((s, l) => s + l.total, 0);
}
