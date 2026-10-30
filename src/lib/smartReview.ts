// ===== 🧠 مرور هوشمند — کجا را باید بیشتر بخوانم؟ =====
//
// «مرور هوشمند» یک لیستِ سادهٔ سررسید نیست: کارت‌های عقب‌افتاده، کارت‌هایی که زیاد
// فراموش شده‌اند (lapses)، پاسخ‌های غلطِ اخیر در آزمون‌های چهارگزینه‌ای، اشتباهات
// ثبت‌شده و درصدِ پایین در بانک سؤال را با هم می‌سنجد و «ضعیف‌ترین مباحث» را با
// دلیلِ روشن برمی‌گرداند. خالص و بدون React تا در تست و در چند صفحه قابل استفاده باشد.
//
// ⚠️ عمداً «حداقل داده» رعایت می‌شود: مبحثی که فقط ۱–۲ پاسخ دارد با درصدِ ۰٪
// ضعیف‌ترین اعلام نمی‌شود؛ وگرنه روزِ اول همه‌چیز «ضعیف» می‌شد.

import type { BankAttempt, CardAttempt, Flashcard, Mistake, Topic } from "../types";

export interface WeakSpot {
  /** کلید یکتا: topic:<id> یا bank:<topicId> */
  key: string;
  label: string;
  kind: "topic" | "bank";
  /** امتیاز ضعف (بزرگ‌تر = مهم‌تر) — فقط برای مرتب‌سازی، معنای عددی مستقل ندارد */
  score: number;
  /** جمله‌های کوتاهِ دلیل — مستقیم در UI نمایش داده می‌شوند */
  reasons: string[];
  /** تعداد کارت‌هایی که در این مبحث قابل مرور است */
  cardIds: string[];
  dueCount: number;
  /** درصد پاسخ درست در آزمون‌های کارتی (اگر داده باشد) */
  cardAccuracy?: number;
  /** درصد پاسخ درست در بانک سؤال (اگر داده باشد) */
  bankAccuracy?: number;
}

export interface SmartReviewInput {
  flashcards: Flashcard[];
  topics: Topic[];
  cardAttempts?: CardAttempt[];
  mistakes?: Mistake[];
  bankAttempts?: BankAttempt[];
  today: string;
  /** حداکثر مبحثِ پیشنهادی */
  limit?: number;
}

const DAY = 86_400_000;

function diffDays(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00`);
  const b = Date.parse(`${to}T00:00:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / DAY);
}

/** میانگینِ عقب‌افتادگی کارت‌های مبحث (روز) — برای وزن‌دادن به مباحثِ فراموش‌شده */
function overdueDays(cards: Flashcard[], today: string): number {
  const late = cards.filter((c) => c.dueDate < today).map((c) => diffDays(c.dueDate, today));
  if (late.length === 0) return 0;
  return late.reduce((a, b) => a + b, 0) / late.length;
}

export function smartWeakSpots(input: SmartReviewInput): WeakSpot[] {
  const { flashcards, topics, today } = input;
  const limit = input.limit ?? 5;
  const mistakes = input.mistakes ?? [];
  const cardAttempts = input.cardAttempts ?? [];
  const bankAttempts = input.bankAttempts ?? [];

  const byTopic = new Map<string, Flashcard[]>();
  for (const card of flashcards) {
    if (!card.topicId) continue;
    const arr = byTopic.get(card.topicId) ?? [];
    arr.push(card);
    byTopic.set(card.topicId, arr);
  }
  const topicById = new Map(topics.map((t) => [t.id, t]));

  const cardTopic = new Map(flashcards.map((c) => [c.id, c.topicId]));
  const attemptsByTopic = new Map<string, { total: number; correct: number; at: number }>();
  for (const a of cardAttempts) {
    const topicId = cardTopic.get(a.cardId);
    if (!topicId) continue;
    const row = attemptsByTopic.get(topicId) ?? { total: 0, correct: 0, at: 0 };
    row.total += 1;
    if (a.correct) row.correct += 1;
    row.at = Math.max(row.at, a.at ?? 0);
    attemptsByTopic.set(topicId, row);
  }

  const mistakesByTopic = new Map<string, number>();
  for (const m of mistakes) {
    const id = m.topicId;
    if (!id) continue;
    mistakesByTopic.set(id, (mistakesByTopic.get(id) ?? 0) + (m.dueDate <= today ? 1 : 0));
  }

  const spots: WeakSpot[] = [];

  for (const [topicId, cards] of byTopic) {
    const topic = topicById.get(topicId);
    if (!topic) continue;
    const due = cards.filter((c) => c.dueDate <= today).length;
    const lapses = cards.reduce((sum, c) => sum + (c.lapses ?? 0), 0);
    const late = overdueDays(cards, today);
    const attempts = attemptsByTopic.get(topicId);
    const accuracy = attempts && attempts.total >= 3 ? Math.round((attempts.correct / attempts.total) * 100) : undefined;
    const dueMistakes = mistakesByTopic.get(topicId) ?? 0;

    const reasons: string[] = [];
    if (due > 0) reasons.push(`${due} کارت سررسید`);
    if (late >= 2) reasons.push(`میانگین ${Math.round(late)} روز عقب‌افتادگی`);
    if (lapses >= 3) reasons.push(`${lapses} بار فراموشی`);
    if (accuracy != null && accuracy < 70) reasons.push(`دقت آزمون ${accuracy}٪`);
    if (dueMistakes > 0) reasons.push(`${dueMistakes} اشتباهِ آمادهٔ مرور`);

    if (reasons.length === 0) continue;

    let score = 0;
    score += due * 1.4;
    score += Math.min(late, 20) * 1.8;
    score += Math.min(lapses, 20) * 2.2;
    score += dueMistakes * 3;
    if (accuracy != null) score += Math.max(0, 70 - accuracy) * 0.55;
    // مبحثی که هیچ کارتِ آماده‌ای ندارد، ارزشِ پیشنهاد ندارد
    if (cards.length === 0) continue;

    spots.push({
      key: `topic:${topicId}`,
      label: topic.name,
      kind: "topic",
      score: Math.round(score * 10) / 10,
      reasons: reasons.slice(0, 3),
      cardIds: cards
        .slice()
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || (b.lapses ?? 0) - (a.lapses ?? 0))
        .map((c) => c.id),
      dueCount: due,
      cardAccuracy: accuracy,
    });
  }

  // ---- ضعف در بانک سؤال (مبحث‌های بانک با نام متفاوت از مباحث کاربر) ----
  const bankByTopic = new Map<string, { label: string; total: number; correct: number }>();
  for (const a of bankAttempts) {
    const row = bankByTopic.get(a.topicId) ?? { label: a.topicTitle ?? a.topicId, total: 0, correct: 0 };
    row.total += 1;
    if (a.correct) row.correct += 1;
    bankByTopic.set(a.topicId, row);
  }
  for (const [topicId, row] of bankByTopic) {
    // همان قاعدهٔ «دادهٔ کافی»: زیر ۵ پاسخ، درصد گمراه‌کننده است
    if (row.total < 5) continue;
    const accuracy = Math.round((row.correct / row.total) * 100);
    if (accuracy >= 65) continue;
    const matching = topics.find((t) => t.name === row.label);
    spots.push({
      key: `bank:${topicId}`,
      label: row.label,
      kind: "bank",
      score: Math.round(Math.max(0, 70 - accuracy) * 1.6 + Math.min(row.total, 40) * 0.2),
      reasons: [`دقت بانک سؤال ${accuracy}٪ از ${row.total} پاسخ`],
      cardIds: matching ? (byTopic.get(matching.id) ?? []).map((c) => c.id) : [],
      dueCount: matching ? (byTopic.get(matching.id) ?? []).filter((c) => c.dueDate <= today).length : 0,
      bankAccuracy: accuracy,
    });
  }

  return spots.sort((a, b) => b.score - a.score || b.dueCount - a.dueCount).slice(0, limit);
}

/** یک جملهٔ کوتاه برای کارتِ «امروز چه بخوانم؟» */
export function smartReviewHeadline(spots: WeakSpot[]): string {
  if (spots.length === 0) return "دادهٔ کافی برای تحلیل نیست؛ چند کارت مرور کن تا پیشنهاد دقیق‌تر شود.";
  const top = spots[0];
  if (spots.length === 1) return `امروز روی «${top.label}» تمرکز کن: ${top.reasons[0]}.`;
  return `امروز روی «${top.label}» و ${spots.length - 1} مبحث دیگر تمرکز کن — ${top.reasons[0]}.`;
}

/** کارت‌های پیشنهادی برای یک جلسهٔ هوشمند (بدون تکرار) */
export function smartReviewCardIds(spots: WeakSpot[], max = 40): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const spot of spots) {
    for (const id of spot.cardIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      if (out.length >= max) return out;
    }
  }
  return out;
}
