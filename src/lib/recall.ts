// ===== 🧠 باغ حافظه — نیمه‌عمر حافظه بر اساس داده‌ی محلی =====
// برای هر کارت، «احتمال یادآوری امروز» را تقریب می‌زند و روی مبحث/درس جمع می‌زند.
// فرمول همان منحنی فراموشی است که FSRS استفاده می‌کند:
//   R = exp(ln(0.9) * t / S)
// که t = روزهای گذشته از آخرین مرور و S = پایداری حافظه ≈ فاصله‌ی فعلی کارت (intervalDays).
// برای کارت‌های SM-2 هم همین تقریب صادق است (intervalDays خروجی هر دو الگوریتم است).
// کاملاً آفلاین؛ فقط داده‌ی خودِ دستگاه.

import type { Flashcard, Subject, Topic } from "../types";
import { addDays, diffDays, todayKey } from "./jalali";

/** احتمال یادآوری ۰..۱ برای یک کارت در تاریخ today */
export function recallProbability(card: Flashcard, today: string): number | null {
  // کارتِ هرگز مرور نشده چیزی برای پیش‌بینی ندارد (هنوز «کاشته» نشده)
  if (!card.lastReviewedAt && card.repetitions <= 0) return null;
  const stability = Math.max(card.intervalDays, 0.5);
  let t: number;
  if (card.lastReviewedAt) {
    t = Math.max(0, (Date.now() - card.lastReviewedAt) / 86_400_000);
  } else {
    // داده‌ی قدیمی بدون زمانِ مرور: آخرین مرور ≈ dueDate منهای فاصله
    t = Math.max(0, diffDays(addDays(card.dueDate, -card.intervalDays), today));
  }
  const r = Math.exp(Math.log(0.9) * (t / stability));
  return Math.max(0, Math.min(1, r));
}

export interface TopicMemory {
  topicId: string;
  topicName: string;
  subjectId: string;
  cards: number;
  /** میانگین احتمال یادآوری کارت‌های مرورشده — null یعنی همه نو هستند */
  avgRecall: number | null;
  /** ضعیف‌ترین کارت (برای «به‌زودی خشک می‌شود») */
  weakest: number | null;
}

export interface MemoryGarden {
  topics: TopicMemory[];
  /** مبحث‌هایی که میانگین یادآوری‌شان زیر آستانه افتاده — «تشنگان» */
  thirsty: TopicMemory[];
  overall: number | null;
}

export const THIRSTY_THRESHOLD = 0.75;

export function buildMemoryGarden(
  cards: Flashcard[],
  topics: Topic[],
  _subjects: Subject[],
  today: string = todayKey(),
): MemoryGarden {
  const byTopic = new Map<string, Flashcard[]>();
  for (const c of cards) {
    if (c.topicId == null) continue;
    byTopic.set(c.topicId, [...(byTopic.get(c.topicId) ?? []), c]);
  }
  const list: TopicMemory[] = [];
  let sum = 0;
  let n = 0;
  for (const topic of topics) {
    const group = byTopic.get(topic.id);
    if (!group || group.length === 0) continue;
    let s = 0;
    let k = 0;
    let weakest: number | null = null;
    for (const card of group) {
      const r = recallProbability(card, today);
      if (r == null) continue;
      s += r;
      k += 1;
      weakest = weakest == null ? r : Math.min(weakest, r);
    }
    const avg = k > 0 ? s / k : null;
    if (avg != null) {
      sum += s;
      n += k;
    }
    list.push({
      topicId: topic.id,
      topicName: topic.name,
      subjectId: topic.subjectId,
      cards: group.length,
      avgRecall: avg,
      weakest,
    });
  }
  // تشنگان اول (کمترین میانگین)، بقیه به ترتیب قوی‌ترین
  const thirsty = list
    .filter((t) => t.avgRecall != null && t.avgRecall < THIRSTY_THRESHOLD)
    .sort((a, b) => (a.avgRecall ?? 0) - (b.avgRecall ?? 0));
  const sorted = [...list].sort((a, b) => (a.avgRecall ?? 2) - (b.avgRecall ?? 2));
  return { topics: sorted, thirsty, overall: n > 0 ? sum / n : null };
}

/** برچسب رنگی/فارسی برای نمایش درصد یادآوری */
export function recallLevel(r: number | null): { label: string; color: string } {
  if (r == null) return { label: "نو 🌱", color: "#94a3b8" };
  if (r < 0.5) return { label: "در حال خشک شدن 🥀", color: "#f43f5e" };
  if (r < 0.75) return { label: "تشنه 💧", color: "#f59e0b" };
  if (r < 0.9) return { label: "سرحال 🌿", color: "#84cc16" };
  return { label: "قوی 🌳", color: "#10b981" };
}
