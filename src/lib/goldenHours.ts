// ===== ساعت‌های طلایی مطالعه =====
// از روی زمانِ شروعِ جلسات (startedAt) تحلیل می‌کند که بیشتر در چه ساعاتی از شبانه‌روز
// مطالعه شده — کاملاً آفلاین، از داده‌های موجود. توابع خالص و تست‌پذیر.

import type { StudySession } from "../types";

export interface HourBucket {
  hour: number; // 0..23
  minutes: number;
  sessions: number;
}

export interface GoldenHoursResult {
  buckets: HourBucket[];
  /** بهترین پنجره‌ی متوالی ۳ ساعته بر اساس دقایق مطالعه */
  bestWindow: { startHour: number; endHour: number; minutes: number } | null;
  totalSessions: number;
  totalMinutes: number;
  /** دقیقهٔ شروع پنجره برای محاسبات */
  days: number;
}

const DAY_MS = 24 * 3600 * 1000;

export function goldenHours(sessions: StudySession[], days = 90, now: number = Date.now()): GoldenHoursResult {
  const from = now - Math.max(1, days) * DAY_MS;
  const minutes = new Array<number>(24).fill(0);
  const counts = new Array<number>(24).fill(0);
  let totalSessions = 0;
  let totalMinutes = 0;
  for (const s of sessions) {
    if (s.startedAt < from || s.startedAt > now + DAY_MS) continue;
    const h = new Date(s.startedAt).getHours();
    minutes[h] += s.durationMinutes;
    counts[h] += 1;
    totalSessions += 1;
    totalMinutes += s.durationMinutes;
  }
  // بهترین پنجره‌ی ۳ ساعته‌ی متوالی (بدون پیچش نیمه‌شب تا خوانا بماند)
  let bestWindow: GoldenHoursResult["bestWindow"] = null;
  for (let h = 0; h <= 21; h++) {
    const sum = minutes[h] + minutes[h + 1] + minutes[h + 2];
    if (sum > 0 && (bestWindow == null || sum > bestWindow.minutes)) {
      bestWindow = { startHour: h, endHour: h + 3, minutes: sum };
    }
  }
  const buckets: HourBucket[] = minutes.map((m, hour) => ({ hour, minutes: m, sessions: counts[hour] }));
  return { buckets, bestWindow, totalSessions, totalMinutes, days };
}
