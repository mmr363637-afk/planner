// ===== ماژول تحلیل و عیب‌یابی نقاط ضعف تحصیلی (Weak Spot Diagnostics) =====
import type { AppState, Subject, Topic } from "../types";

export interface WeakSpot {
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  subjectColor: string;
  reason: string;
  severity: "high" | "medium";
  testAccuracy?: number;
  lapseCount?: number;
  recommendation: string;
}

/**
 * تشخیص هوشمند مباحثی که کاربر در آن‌ها دچار ضعف جدی یا فراموشی مکرر است:
 * ۱. مباحثی با دقت تست‌زنی زیر ۵۰٪
 * ۲. فلش‌کارت‌هایی با تعداد لغزش (Lapse) بالای ۲ بار
 * ۳. مباحثی که کاربر دستی برچسب «ضعیفم» (weak) زده است
 */
export function diagnoseWeakSpots(state: AppState): WeakSpot[] {
  const spots: WeakSpot[] = [];
  const topicMap = new Map<string, Topic>();
  state.topics.forEach((t) => topicMap.set(t.id, t));

  const subjectMap = new Map<string, Subject>();
  state.subjects.forEach((s) => subjectMap.set(s.id, s));

  // ۱. بررسی دقت تست‌زنی در هر مبحث
  const topicTestStats = new Map<string, { total: number; correct: number }>();
  for (const log of state.testLogs || []) {
    if (!log.topicId) continue;
    const cur = topicTestStats.get(log.topicId) || { total: 0, correct: 0 };
    cur.total += log.total;
    cur.correct += log.correct;
    topicTestStats.set(log.topicId, cur);
  }

  topicTestStats.forEach((stat, topicId) => {
    if (stat.total >= 5) {
      const acc = Math.round((stat.correct / stat.total) * 100);
      if (acc < 50) {
        const topic = topicMap.get(topicId);
        const subject = topic ? subjectMap.get(topic.subjectId) : undefined;
        if (topic && subject) {
          spots.push({
            topicId,
            topicName: topic.name,
            subjectId: subject.id,
            subjectName: subject.name,
            subjectColor: subject.color,
            reason: `دقت تست‌زنی پایین (${acc}٪ در ${stat.total} تست)`,
            severity: acc < 35 ? "high" : "medium",
            testAccuracy: acc,
            recommendation: "پیشنهاد: خواندن دوباره‌ی درسنامه و حل تست‌های تشریحی",
          });
        }
      }
    }
  });

  // ۲. بررسی فلش‌کارت‌های پرتکرار در فراموشی (Lapses)
  const topicLapses = new Map<string, number>();
  for (const card of state.flashcards || []) {
    if (card.topicId && card.lapses >= 3) {
      topicLapses.set(card.topicId, (topicLapses.get(card.topicId) || 0) + card.lapses);
    }
  }

  topicLapses.forEach((lapses, topicId) => {
    if (spots.some((s) => s.topicId === topicId)) return;
    const topic = topicMap.get(topicId);
    const subject = topic ? subjectMap.get(topic.subjectId) : undefined;
    if (topic && subject) {
      spots.push({
        topicId,
        topicName: topic.name,
        subjectId: subject.id,
        subjectName: subject.name,
        subjectColor: subject.color,
        reason: `${lapses} بار فراموشی در فلش‌کارت‌ها`,
        severity: lapses >= 5 ? "high" : "medium",
        lapseCount: lapses,
        recommendation: "پیشنهاد: ساخت کارت‌های خلاصه‌تر یا رمزگردانی ذهنی (Mnemonics)",
      });
    }
  });

  // ۳. برچسب‌های دستی ضعیفم
  for (const topic of state.topics || []) {
    if (topic.tags?.includes("weak") && !spots.some((s) => s.topicId === topic.id)) {
      const subject = subjectMap.get(topic.subjectId);
      if (subject) {
        spots.push({
          topicId: topic.id,
          topicName: topic.name,
          subjectId: subject.id,
          subjectName: subject.name,
          subjectColor: subject.color,
          reason: "علامت‌گذاری دستی به‌عنوان مبحث نیازمند تمرین",
          severity: "medium",
          recommendation: "پیشنهاد: قرار دادن در برنامه مرور زودهنگام فردا",
        });
      }
    }
  }

  return spots.sort((a, b) => (b.severity === "high" ? 1 : 0) - (a.severity === "high" ? 1 : 0));
}
