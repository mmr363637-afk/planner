// ===== 🔎 پیدا کردنِ «همان مبحث» در فهرستِ فلش‌کارت‌ها =====
//
// نقطهٔ دردِ گزارش‌شده: وقتی برای یک مبحث کارت می‌سازیم و بعداً می‌خواهیم کارتِ
// تازه به «همان مبحث» اضافه کنیم، پیدا کردنش بینِ ده‌ها مجموعه سخت است — چون
// فهرست فقط بر اساسِ «سررسید» مرتب می‌شد و جست‌وجویی هم نداشت.
//
// این ماژول یک رتبه‌بندیِ کوچک و قابلِ تست می‌دهد: نامِ مبحث، نامِ درس، نامِ فصلِ
// پکِ منتخب و زیرنویس، همه نرمال‌سازی و امتیازدهی می‌شوند (همان موتورِ مشترکِ
// `textSearch` که کتابخانهٔ درسنامه هم از آن استفاده می‌کند).

import type { CuratedPack } from "./curatedPacks";
import { scoreQuery } from "./textSearch";

export interface DeckSearchInput {
  title: string;
  subtitle?: string;
  /** نامِ درسی که مبحث به آن تعلق دارد (اگر معلوم باشد) */
  subjectName?: string;
  packs?: Pick<CuratedPack, "topicName" | "subjectName">[];
  /** شمارِ کارت‌های خودِ کاربر — برای مرتب‌سازیِ مساوی‌ها */
  myCount?: number;
  dueCount?: number;
}

/**
 * فیلتر + مرتب‌سازیِ مجموعه‌ها بر اساسِ عبارتِ جست‌وجو.
 * • عبارتِ خالی: همان ترتیبِ ورودی (سررسیددارها اول) دست‌نخورده می‌ماند.
 * • عبارتِ داده‌شده: فقط مجموعه‌های مرتبط، از بهترین تطبیق؛ در امتیازِ مساوی
 *   آن‌که کارتِ بیشتری دارد (و بعد سررسیدِ بیشتری) اول می‌آید.
 */
export function rankDecks<T>(
  decks: T[],
  query: string,
  describe: (deck: T) => DeckSearchInput,
): T[] {
  const q = query.trim();
  if (!q) return decks;
  const scored: { deck: T; score: number; myCount: number; dueCount: number }[] = [];
  for (const deck of decks) {
    const d = describe(deck);
    const fields = [
      { text: d.title, weight: 1.3 },
      { text: d.subjectName ?? "", weight: 1 },
      { text: d.subtitle ?? "", weight: 0.7 },
      ...(d.packs ?? []).map((p) => ({ text: `${p.topicName} ${p.subjectName}`, weight: 0.8 })),
    ];
    const score = scoreQuery(q, fields);
    if (score > 0) scored.push({ deck, score, myCount: d.myCount ?? 0, dueCount: d.dueCount ?? 0 });
  }
  scored.sort((a, b) => b.score - a.score || b.myCount - a.myCount || b.dueCount - a.dueCount);
  return scored.map((s) => s.deck);
}
