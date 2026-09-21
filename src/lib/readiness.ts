import { addDays, todayKey } from "./jalali";
import { leafTopics } from "./topics";
// ===== نمره‌ی آمادگی برای امتحان =====
// ترکیبِ وزن‌دارِ سه سیگنال: تسلط روی مباحث درس + وضعیت مرورها + قوت فلش‌کارت‌ها.
// همه‌چیز از داده‌های محلی محاسبه می‌شود (آفلاین). توابع خالص و تست‌پذیر.

import type { Exam, Flashcard, Review, Subject, Topic, TestLog } from "../types";

/** نرمال‌سازی نام فارسی/عربی برای تطبیق نام درس امتحان با کتابخانه */
export function normalizeFaName(s: string): string {
  return s
    .trim()
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[\s‌]+/g, " ")
    .toLowerCase();
}

/** پیدا کردن درسِ کتابخانه برای یک امتحان: اول subjectId صریح، بعد تطبیق نام */
export function matchExamSubject(exam: Pick<Exam, "subjectId" | "subject">, subjects: Subject[]): Subject | null {
  if (exam.subjectId) {
    const byId = subjects.find((s) => s.id === exam.subjectId);
    if (byId) return byId;
  }
  if (!exam.subject) return null;
  const needle = normalizeFaName(exam.subject);
  if (!needle) return null;
  const exact = subjects.find((s) => normalizeFaName(s.name) === needle);
  if (exact) return exact;
  // تطبیق جزئی: نام درس داخل عنوان امتحان یا برعکس (مثلاً «قلب» ↔ «قلب و عروق»)
  return subjects.find((s) => {
    const n = normalizeFaName(s.name);
    return n.includes(needle) || needle.includes(n);
  }) ?? null;
}

/** امتیاز تسلط هر مبحث از ۰ تا ۱ */
export function masteryWeight(status: Topic["status"]): number {
  switch (status) {
    case "mastered": return 1;
    case "needs_review": return 0.65;
    case "learning": return 0.35;
    case "not_started": return 0;
  }
}

export interface ReadinessParts {
  /** درصد تسلط روی مباحث (۰..۱۰۰) */
  masteryPct: number;
  /** درصد مرورهای انجام‌شده از کل — null اگر مروری ثبت نشده */
  reviewPct: number | null;
  /** درصد کارت‌های قوی (تکرار موفق ≥ ۲) — null اگر کارتی نیست */
  cardPct: number | null;
  mastered: number;
  totalTopics: number;
  reviewsDone: number;
  reviewsTotal: number;
  cardsStrong: number;
  cardsTotal: number;
}

export interface ReadinessResult {
  evidence: { tests: number; accuracy: number | null; coverage: number; confidence: "limited" | "developing"; };
  matched: boolean;
  subjectId: string | null;
  /** نمره‌ی نهایی ۰..۱۰۰ */
  score: number;
  parts: ReadinessParts;
}

// وزن‌دهی: تسلط ۵۵٪ + مرور ۳۰٪ + فلش‌کارت ۱۵٪؛ در نبودِ بخشی، وزن‌ها نرمال می‌شوند
export const READINESS_WEIGHTS = { mastery: 0.55, review: 0.3, card: 0.15 } as const;

export function examReadiness(
  exam: Pick<Exam, "subjectId" | "subject">,
  input: { subjects: Subject[]; topics: Topic[]; reviews: Pick<Review, "topicId" | "status">[]; flashcards: Pick<Flashcard, "topicId" | "repetitions">[]; testLogs?: TestLog[]; today?: string },
): ReadinessResult {
  const subject = matchExamSubject(exam, input.subjects);
  if (!subject) {
    return {
      evidence: { tests: 0, accuracy: null, coverage: 0, confidence: "limited" },
      matched: false,
      subjectId: null,
      score: 0,
      parts: { masteryPct: 0, reviewPct: null, cardPct: null, mastered: 0, totalTopics: 0, reviewsDone: 0, reviewsTotal: 0, cardsStrong: 0, cardsTotal: 0 },
    };
  }
  const topics = leafTopics(input.topics).filter((t) => t.subjectId === subject.id);
  const totalTopics = topics.length;
  let masteryPct = 0;
  let mastered = 0;
  if (totalTopics > 0) {
    const sum = topics.reduce((acc, t) => acc + masteryWeight(t.status), 0);
    masteryPct = Math.round((sum / totalTopics) * 100);
    mastered = topics.filter((t) => t.status === "mastered").length;
  }
  // مباحث برگ (بدون فرزند) در مرورها شرکت می‌کنند، ولی برای سادگی وضعیتِ همه را می‌سنجیم
  const topicIds = new Set(topics.map((t) => t.id));
  const rel = input.reviews.filter((r) => topicIds.has(r.topicId));
  const reviewsTotal = rel.length;
  const reviewsDone = rel.filter((r) => r.status === "done").length;
  const reviewPct = reviewsTotal > 0 ? Math.round((reviewsDone / reviewsTotal) * 100) : null;
  const cards = input.flashcards.filter((c) => c.topicId != null && topicIds.has(c.topicId));
  const cardsTotal = cards.length;
  const cardsStrong = cards.filter((c) => (c.repetitions ?? 0) >= 2).length;
  const cardPct = cardsTotal > 0 ? Math.round((cardsStrong / cardsTotal) * 100) : null;

  let num = masteryPct * READINESS_WEIGHTS.mastery;
  let den = READINESS_WEIGHTS.mastery;
  if (reviewPct != null) {
    num += reviewPct * READINESS_WEIGHTS.review;
    den += READINESS_WEIGHTS.review;
  }
  if (cardPct != null) {
    num += cardPct * READINESS_WEIGHTS.card;
    den += READINESS_WEIGHTS.card;
  }
  const today = input.today ?? todayKey();
  const logs = (input.testLogs ?? []).filter(l => l.date >= addDays(today, -30) && l.date <= today && (l.topicId ? topicIds.has(l.topicId) : l.subjectId === subject.id) && l.total > 0 && l.correct >= 0 && l.correct <= l.total);
  const tests = logs.reduce((n,l) => n+l.total,0);
  const accuracy = tests ? Math.round(logs.reduce((n,l)=>n+l.correct,0)/tests*100) : null;
  const testedTopics = new Set(logs.filter(l=>l.topicId).map(l=>l.topicId));
  const coverage = totalTopics ? Math.round(testedTopics.size/totalTopics*100) : 0;
  if (accuracy != null) { num += accuracy * .4; den += .4; }
  const score = Math.round(num / den);
  const evidence = { tests, accuracy, coverage, confidence: tests >= 20 && coverage >= 50 ? "developing" as const : "limited" as const };
  return { evidence, matched: true, subjectId: subject.id, score, parts: { masteryPct, reviewPct, cardPct, mastered, totalTopics, reviewsDone, reviewsTotal, cardsStrong, cardsTotal } };
}

/** A heuristic progress indicator, never a guarantee of exam performance. */
export function readinessAdvice(score: number): string {
  if (score >= 85) return "شاخص بالا؛ آمادگی را با آزمون تازه بررسی کن";
  if (score >= 65) return "پیشرفت ثبت‌شده خوب؛ آزمون و رفع ضعف را ادامه بده";
  if (score >= 40) return "بخشی از مسیر طی شده؛ مباحث ضعیف را تمرین کن";
  if (score > 0) return "دادهٔ اولیه ثبت شده؛ با قدم‌های کوتاه ادامه بده";
  return "برای برآورد، مطالعه و ارزیابی را شروع کن";
}
