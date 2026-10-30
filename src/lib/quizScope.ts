// ===== 🎯 انتخابِ «محدودهٔ مرور» برای آزمون چهارگزینه‌ای =====
//
// کاربر باید *قبل از شروع* مبحث/مجموعه را انتخاب کند؛ آزمون سراسریِ بی‌هدف ممنوع.
// این ماژول از کارت‌های شخصی، «دامنه»های قابل انتخاب می‌سازد:
//   • هر مبحثی که کارت دارد (کلید `t:<topicId>` — همان کلید مجموعه‌ها)
//   • یک دامنه به‌ازای هر درس (چند مبحث با هم) — کلید `s:<subjectId>`
//   • دامنهٔ «همهٔ کارت‌ها» برای مرور ترکیبیِ آگاهانه
// خالص و بدون React؛ در تنظیمات جلسه و در مرور هوشمند استفاده می‌شود.

import type { Flashcard, Subject, Topic } from "../types";

export interface QuizScope {
  /** کلید دامنه: all | t:<topicId> | s:<subjectId> */
  key: string;
  label: string;
  /** نام درس برای نمایش زیرعنوان */
  subjectName?: string;
  color?: string;
  /** تعداد کل کارت‌های دامنه */
  count: number;
  /** کارت‌های سررسیدشده */
  dueCount: number;
  /** تعداد کارت‌هایی که سؤال چهارگزینه‌ایِ معتبر دارند */
  questionCount: number;
  /** نوع دامنه — برای آیکن و گروه‌بندی */
  kind: "all" | "topic" | "subject";
}

/**
 * ساخت دامنه‌ها از کارت‌ها. کارت‌های بدون مبحث فقط در دامنهٔ «همه» و دامنهٔ درسِ
 * نامعلوم دیده می‌شوند (مبحثِ حذف‌شده باعث crash نمی‌شود).
 */
export function buildQuizScopes(
  flashcards: Flashcard[],
  topics: Topic[],
  subjects: Subject[],
  today: string,
  /** شناسهٔ سؤال‌های دارای چهارگزینه‌ای معتبر (اختیاری) */
  questionCardIds?: Set<string>,
): QuizScope[] {
  const topicById = new Map(topics.map((t) => [t.id, t]));
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const byTopic = new Map<string, Flashcard[]>();
  const loose: Flashcard[] = [];
  for (const card of flashcards) {
    if (card.topicId && topicById.has(card.topicId)) {
      const arr = byTopic.get(card.topicId) ?? [];
      arr.push(card);
      byTopic.set(card.topicId, arr);
    } else {
      loose.push(card);
    }
  }

  const withQuestions = (cards: Flashcard[]) =>
    questionCardIds ? cards.filter((c) => questionCardIds.has(c.id)).length : cards.length;

  const scopes: QuizScope[] = [];

  for (const [topicId, cards] of byTopic) {
    const topic = topicById.get(topicId)!;
    const subject = subjectById.get(topic.subjectId);
    scopes.push({
      key: `t:${topicId}`,
      label: topic.name,
      subjectName: subject?.name,
      color: subject?.color,
      count: cards.length,
      dueCount: cards.filter((c) => c.dueDate <= today).length,
      questionCount: withQuestions(cards),
      kind: "topic",
    });
  }

  // دامنهٔ درس: فقط اگر بیش از یک مبحثِ کارت‌دار داشته باشد ارزش انتخاب دارد
  const bySubject = new Map<string, { cards: Flashcard[]; topics: number }>();
  for (const [topicId, cards] of byTopic) {
    const subjectId = topicById.get(topicId)!.subjectId;
    const row = bySubject.get(subjectId) ?? { cards: [], topics: 0 };
    row.cards.push(...cards);
    row.topics += 1;
    bySubject.set(subjectId, row);
  }
  for (const [subjectId, row] of bySubject) {
    if (row.topics < 2) continue;
    const subject = subjectById.get(subjectId);
    scopes.push({
      key: `s:${subjectId}`,
      label: `همهٔ ${subject?.name ?? "این درس"}`,
      subjectName: `${row.topics} مبحث`,
      color: subject?.color,
      count: row.cards.length,
      dueCount: row.cards.filter((c) => c.dueDate <= today).length,
      questionCount: withQuestions(row.cards),
      kind: "subject",
    });
  }

  const allCards = [...byTopic.values()].flat().concat(loose);
  scopes.push({
    key: "all",
    label: "همهٔ کارت‌ها (ترکیبی)",
    subjectName: undefined,
    count: allCards.length,
    dueCount: allCards.filter((c) => c.dueDate <= today).length,
    questionCount: withQuestions(allCards),
    kind: "all",
  });

  // مرتب‌سازی: دامنه‌های آماده‌تر (سررسید بیشتر) اول، بعد تعداد
  return scopes.sort(
    (a, b) => b.dueCount - a.dueCount || b.count - a.count || a.label.localeCompare(b.label, "fa"),
  );
}

/** کارت‌های داخل یک دامنه — همان قاعدهٔ کلیدها */
export function cardsInQuizScope(flashcards: Flashcard[], topics: Topic[], scopeKey: string): Flashcard[] {
  if (!scopeKey || scopeKey === "all") return flashcards;
  if (scopeKey.startsWith("t:")) {
    const topicId = scopeKey.slice(2);
    return flashcards.filter((c) => c.topicId === topicId);
  }
  if (scopeKey.startsWith("s:")) {
    const subjectId = scopeKey.slice(2);
    const ids = new Set(topics.filter((t) => t.subjectId === subjectId).map((t) => t.id));
    return flashcards.filter((c) => c.topicId != null && ids.has(c.topicId));
  }
  return flashcards;
}

/** دامنهٔ مناسب برای پیشنهادِ خودکار: ضعیف‌ترین مبحثی که کارتِ آماده دارد */
export function recommendQuizScope(scopes: QuizScope[]): QuizScope | null {
  const candidates = scopes.filter((s) => s.kind === "topic" && s.count >= 4);
  if (candidates.length === 0) return scopes.find((s) => s.kind === "topic" && s.count > 0) ?? null;
  return [...candidates].sort((a, b) => b.dueCount - a.dueCount || b.count - a.count)[0] ?? null;
}
