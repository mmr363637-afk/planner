// ===== تکلیفِ مباحثِ عقب‌افتاده =====
// «دیر شروع شد» با «فراموش شد» و «نیاز به مرور دارد» یکی نیست. این ماژول با
// سابقهٔ واقعیِ مطالعه/آزمون/فلش‌کارت، وضعیت را تشخیص می‌دهد و چهار انتخاب
// (یادگیری مجدد، مرور، ارزیابی با سؤال، مرور هدفمند) با پیشنهادِ اول می‌دهد.
// تصمیم نهایی همیشه با کاربر است؛ هیچ‌چیز خودکار اعمال نمی‌شود.
import type { Flashcard, Review, StudySession, StudyTask, TestLog, Topic } from "../types";
import { diffDays } from "./jalali";
import { recallProbability, THIRSTY_THRESHOLD } from "./recall";

export type LateTopicState = "not_started" | "needs_review" | "forgotten" | "on_track";
export type LateActionId = "relearn" | "review" | "quiz" | "targeted";

export interface LateActionOption {
  id: LateActionId;
  label: string;
  description: string;
  recommended: boolean;
  /** زمان تقریبی پیشنهادی به دقیقه — ۰ یعنی دادهٔ کافی برای تخمین نیست */
  minutes: number;
  /** آیا این گزینه با داده‌های فعلی (کارت/سابقه) قابل اجراست؟ */
  available: boolean;
}

export interface LateTopicAssessment {
  state: LateTopicState;
  stateLabel: string;
  /** چرا این وضعیت تشخیص داده شد — جملهٔ کوتاه و قابل نمایش */
  reason: string;
  studiedMinutes: number;
  lastStudiedDate: string | null;
  daysSinceStudy: number | null;
  avgRecall: number | null;
  pendingReviews: number;
  cardCount: number;
  weakCards: number;
  /** میانگین درصد تست‌های اخیر این مبحث (۰..۱۰۰) — null یعنی تستی ثبت نشده */
  testAccuracy: number | null;
  recommended: LateActionId;
  options: LateActionOption[];
}

export const LATE_STATE_LABEL: Record<LateTopicState, string> = {
  not_started: "هنوز شروع نشده",
  needs_review: "نیاز به مرور",
  forgotten: "قبلاً خوانده شده، احتمال فراموشی",
  on_track: "روی مسیر",
};

const STATE_ICON: Record<LateTopicState, string> = {
  not_started: "🌱",
  needs_review: "🔁",
  forgotten: "🥀",
  on_track: "✅",
};

export function lateStateIcon(state: LateTopicState): string {
  return STATE_ICON[state];
}

function round5(n: number): number {
  return Math.max(10, Math.round(n / 5) * 5);
}

/**
 * ارزیابی وضعیت یک مبحث. `reviews` و `tasks` کل داده‌ها هستند؛ فقط موارد همین مبحث
 * استفاده می‌شوند تا خروجی برای هر مبحث مستقل باشد.
 */
export function assessLateTopic(input: {
  topic: Topic;
  today: string;
  tasks?: StudyTask[];
  sessions?: StudySession[];
  reviews?: Review[];
  flashcards?: Flashcard[];
  testLogs?: TestLog[];
}): LateTopicAssessment {
  const { topic, today } = input;
  const tasks = (input.tasks ?? []).filter((t) => t.topicId === topic.id);
  const sessions = (input.sessions ?? []).filter((s) => s.topicId === topic.id);
  const reviews = (input.reviews ?? []).filter((r) => r.topicId === topic.id);
  const cards = (input.flashcards ?? []).filter((c) => c.topicId === topic.id);
  const logs = (input.testLogs ?? []).filter((l) => l.topicId === topic.id);

  const studiedMinutes = sessions.reduce((sum, s) => sum + Math.max(0, s.durationMinutes), 0) +
    tasks.reduce((sum, t) => sum + Math.max(0, t.doneMinutes), 0);
  const lastStudiedDate = sessions.reduce<string | null>((latest, s) => (!latest || s.date > latest ? s.date : latest), null);
  const daysSinceStudy = lastStudiedDate ? Math.max(0, diffDays(lastStudiedDate, today)) : null;
  const pendingReviews = reviews.filter((r) => r.status === "pending" && r.dueDate <= today).length +
    tasks.filter((t) => t.kind === "review" && t.status === "pending" && t.date <= today).length;

  const recalls = cards
    .map((c) => recallProbability(c, today))
    .filter((r): r is number => r != null);
  const avgRecall = recalls.length > 0 ? recalls.reduce((a, b) => a + b, 0) / recalls.length : null;
  const weakCards = cards.filter((c) => c.lapses > 0 || c.bookmark || c.needsCheck).length;
  const testAccuracy = logs.length > 0
    ? Math.round((logs.reduce((s, l) => s + l.correct, 0) / Math.max(1, logs.reduce((s, l) => s + l.total, 0))) * 100)
    : null;

  // مرورِ سررسیدشده هم شاهدِ «قبلاً برنامه‌ریزی/مطالعه شده» است؛ حتی اگر جلسه‌ای ثبت نشده باشد
  const hasHistory = studiedMinutes >= 20 || tasks.some((t) => t.status === "done") || pendingReviews > 0;
  let state: LateTopicState;
  let reason: string;
  if (!hasHistory) {
    state = "not_started";
    reason = "هنوز جلسه یا تسکِ انجام‌شده‌ای برای این مبحث ثبت نشده است.";
  } else if (avgRecall != null && avgRecall < 0.55 && (daysSinceStudy ?? 0) >= 21) {
    state = "forgotten";
    reason = `حدود ${daysSinceStudy} روز از آخرین مطالعه گذشته و احتمال یادآوری کارت‌ها ${Math.round(avgRecall * 100)}٪ است؛ اما این لزوماً «از صفر» نیست.`;
  } else if (pendingReviews > 0 || (avgRecall != null && avgRecall < THIRSTY_THRESHOLD)) {
    state = "needs_review";
    reason = pendingReviews > 0
      ? `${pendingReviews} مرورِ سررسیدشده برای همین مبحث مانده است.`
      : `احتمال یادآوری کارت‌ها ${Math.round((avgRecall ?? 0) * 100)}٪ است؛ یک مرور کوتاه کافی است.`;
  } else {
    state = "on_track";
    reason = daysSinceStudy != null
      ? `آخرین مطالعه ${daysSinceStudy} روز پیش بوده و مرورِ سررسیدشده‌ای نداری.`
      : "سابقهٔ کافی و بدون مرورِ عقب‌افتاده داری.";
  }

  // پیشنهاد بر اساس سابقه: خطای تستِ زیاد → تمرین سؤال؛ فراموشی → یادگیری مجدد؛
  // ضعف فقط در چند کارت → مرور هدفمند.
  let recommended: LateActionId;
  if (state === "not_started") recommended = "relearn";
  else if (state === "forgotten") recommended = cards.length >= 4 && testAccuracy != null ? "quiz" : "relearn";
  else if (cards.length >= 4 && (weakCards >= 2 || (testAccuracy != null && testAccuracy < 60))) recommended = "targeted";
  else if (state === "needs_review") recommended = "review";
  else recommended = cards.length >= 4 ? quizOrReview(cards.length, weakCards) : "review";

  const base = Math.max(20, topic.estimatedMinutes);
  const remainingFactor = Math.max(0.2, 1 - Math.min(1, studiedMinutes / Math.max(1, base)));
  const options: LateActionOption[] = [
    {
      id: "relearn",
      label: "یادگیری مجدد",
      description: "از ابتدا و مثل یک مبحث تازه — برای وقتی که واقعاً چیزی یادت نیست.",
      recommended: recommended === "relearn",
      minutes: round5(base * remainingFactor),
      available: true,
    },
    {
      id: "review",
      label: "مرور",
      description: "فقط نکات مهم و مطالبی که قبلاً خوانده‌ای؛ کارت‌های همین مبحث.",
      recommended: recommended === "review",
      minutes: round5(Math.max(15, base * 0.2)),
      available: true,
    },
    {
      id: "quiz",
      label: "ارزیابی با سؤال",
      description: "با چند سؤال چهارگزینه‌ای بسنج کجای کاری؛ نتیجه تعیین می‌کند بعدش چه کنی.",
      recommended: recommended === "quiz",
      minutes: round5(Math.max(10, Math.min(30, cards.length * 1.5))),
      available: cards.length >= 4,
    },
    {
      id: "targeted",
      label: "مرور هدفمند",
      description: weakCards > 0
        ? `فقط ${weakCards} کارتِ ضعیف/علامت‌خوردهٔ همین مبحث.`
        : "فقط بخش‌هایی که در آزمون‌ها ضعیف بودی (نیاز به کارت یا سابقهٔ تست دارد).",
      recommended: recommended === "targeted",
      minutes: round5(Math.max(10, weakCards * 1.5 || base * 0.15)),
      available: weakCards > 0 || cards.length >= 4,
    },
  ];

  return {
    state,
    stateLabel: LATE_STATE_LABEL[state],
    reason,
    studiedMinutes,
    lastStudiedDate,
    daysSinceStudy,
    avgRecall,
    pendingReviews,
    cardCount: cards.length,
    weakCards,
    testAccuracy,
    recommended,
    options,
  };
}

function quizOrReview(cards: number, weak: number): LateActionId {
  if (cards >= 4 && weak >= 1) return "targeted";
  return cards >= 4 ? "quiz" : "review";
}
