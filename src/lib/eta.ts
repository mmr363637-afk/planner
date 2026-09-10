// ===== پیش‌بینی پایان مبحث (ETA) =====
// با نرخِ متوسط مطالعه‌ی ۱۴ روز گذشته، تخمین می‌زند مبحث فعلی چه‌روزی تمام می‌شود.
// آفلاین و بدون مدل پیچیده؛ توابع خالص برای تست.

import type { StudySession, StudyTask, Topic } from "../types";
import { addDays, diffDays, todayKey } from "./jalali";

const RATE_WINDOW_DAYS = 14;

export interface TopicEta {
  /** دقایق مطالعه‌شده‌ی این مبحث */
  studiedMin: number;
  /** باقی‌مانده نسبت به زمان تخمینی مبحث */
  remainingMin: number;
  /** نرخ فعلی: دقیقه در روز (متوسط ۱۴ روز اخیر) */
  dailyRate: number;
  /** روزهای باقی‌مانده با نرخ فعلی — null یعنی با این نرخ به پایان نمی‌رسد */
  etaDays: number | null;
  /** تاریخ تخمینی پایان (ISO) */
  etaDate: string | null;
}

export function topicEta(topic: Pick<Topic, "id" | "estimatedMinutes">, sessions: StudySession[], today: string = todayKey()): TopicEta {
  let studiedMin = 0;
  let recentMin = 0;
  const windowStart = addDays(today, -(RATE_WINDOW_DAYS - 1));
  for (const s of sessions) {
    if (s.topicId !== topic.id) continue;
    studiedMin += s.durationMinutes;
    if (s.date >= windowStart && s.date <= today) recentMin += s.durationMinutes;
  }
  const remainingMin = Math.max(0, topic.estimatedMinutes - studiedMin);
  const dailyRate = Math.round((recentMin / RATE_WINDOW_DAYS) * 10) / 10;
  if (remainingMin <= 0) {
    return { studiedMin, remainingMin: 0, dailyRate, etaDays: 0, etaDate: today };
  }
  if (dailyRate <= 0) {
    return { studiedMin, remainingMin, dailyRate, etaDays: null, etaDate: null };
  }
  const etaDays = Math.ceil(remainingMin / dailyRate);
  return { studiedMin, remainingMin, dailyRate, etaDays, etaDate: addDays(today, etaDays) };
}

/** سلامتِ سرشتی یک برنامه: با نرخ فعلی تا پایانِ بازه‌ی برنامه چند درصدِ حجمِ باقی‌مانده پوشش داده می‌شود */
export interface PlanPace {
  /** مجموع دقایقِ برنامه‌ریزی‌شده‌ی باقی‌مانده (امروز تا پایان برنامه) */
  plannedRemaining: number;
  /** دقایقِ قابل مطالعه با نرخ فعلی تا پایان برنامه */
  reachableMin: number;
  /** درصدِ حجمِ قابل پوشش با نرخ فعلی (۰..۱۰۰) */
  coveragePct: number | null;
  daysLeft: number;
}

export function planPace(
  plan: { endDate: string; dailyMinutes: number },
  tasks: StudyTask[],
  sessions: StudySession[],
  today: string = todayKey(),
): PlanPace {
  const end = plan.endDate;
  const daysLeft = Math.max(0, diffDays(today, end));
  const plannedRemaining = tasks
    .filter((t) => t.date >= today && t.date <= end && t.status === "pending")
    .reduce((s, t) => s + Math.max(0, t.plannedMinutes - t.doneMinutes), 0);
  // نرخ واقعی: میانگین روزانه‌ی ۱۴ روز اخیر (همه‌ی جلسات)
  const windowStart = addDays(today, -(RATE_WINDOW_DAYS - 1));
  let recentMin = 0;
  for (const s of sessions) if (s.date >= windowStart && s.date <= today) recentMin += s.durationMinutes;
  const dailyRate = recentMin / RATE_WINDOW_DAYS;
  const reachableMin = Math.round(dailyRate * daysLeft);
  const coveragePct = plannedRemaining > 0 ? Math.min(100, Math.round((reachableMin / plannedRemaining) * 100)) : null;
  return { plannedRemaining, reachableMin, coveragePct, daysLeft };
}
