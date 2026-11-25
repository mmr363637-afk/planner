// ===== 🔄 همگام‌سازیِ فلش‌کارت‌ها با مباحثِ خودِ اپ =====
//
// گلایهٔ واقعی: «بعداً فلش‌کارت اضافه کردم؛ می‌خواهم با مباحثِ خودِ اپ همگام شود.»
//
// سه جا این همگامی شکسته بود:
//   ۱. **ورودِ بستهٔ کارت**: مبحث فقط با «نامِ دقیقاً برابر» یا `sampleId` تطبیق داده
//      می‌شد. اگر نامِ مبحث در فایل کمی بلندتر/کوتاه‌تر بود (مثلاً «ارزیابی قبل از عمل»
//      در اپ و «ارزیابی قبل از عمل و مراقبت از بیمار جراحی» در فایل)، به‌جای وصل‌شدن به
//      مبحثِ خودِ اپ، یک **مبحثِ تکراری** ساخته می‌شد و کارت‌ها از برنامه/آمار جدا می‌ماندند.
//   ۲. **کارت‌های قدیمی**: کارت‌هایی که بدونِ مبحث ذخیره شده بودند (پکِ منتخب، ورودِ
//      قدیمی، اشتباهِ کاربر) هیچ‌وقت به مبحثی وصل نمی‌شدند — نه در فهرست دیده می‌شدند،
//      نه در آمارِ مبحث و نه در بررسیِ تسلط.
//   ۳. **بعد از همگام‌سازیِ نمونه**: وقتی اپ مباحثِ کاتالوگ را (دوباره) می‌آورد، کارت‌ها
//      با مبحثِ تازه هم‌پیوند نمی‌شدند.
//
// این ماژول خالص است: هیچ state را تغییر نمی‌دهد، فقط «چه چیزی به چه چیزی وصل شود» را
// می‌گوید؛ store آن را در یک تراکنش اعمال می‌کند و UI پیش‌نمایشِ شمارش را نشان می‌دهد.

import type { Flashcard, Subject, Topic } from "../types";
import { lessonTitleScore } from "./lessonTopic";
import { normalizeText } from "./cardQuiz";

/** حداقلِ اطمینان برای وصل‌کردنِ خودکار — عمداً سخت‌گیرانه‌تر از درسنامه‌ها */
export const CARD_TOPIC_MIN_SCORE = 0.86;
/** اختلافِ لازم با گزینهٔ بعدی (وقتی امتیاز کامل نیست) */
export const CARD_TOPIC_MIN_MARGIN = 0.06;
/** نام‌های کوتاه‌تر از این تعداد واژه، با «هم‌معنی/شامل‌بودن» تطبیق نمی‌گیرند */
const MIN_SHORT_WORDS = 2;

/** نرمال‌سازیِ سبکِ نام برای تطبیقِ مبحث‌ها (مستقل از normalizeText کارت‌ها) */
function canon(name: string): string {
  return normalizeText(name ?? "").replace(/\s+/g, " ").trim();
}

export interface TopicResolution {
  topicId: string;
  /** `sample` = کلیدِ کاتالوگ، `exact` = نامِ یکسان، `fuzzy` = نامِ نزدیک (حدسِ مطمئن) */
  via: "sample" | "exact" | "fuzzy";
  score: number;
  /** نامِ مبحثی که به آن وصل شد (برای گزارشِ خوانا) */
  topicName: string;
}

/**
 * بهترین مبحثِ اپ برای یک نامِ مبحثِ بیرونی.
 *
 * ترتیب: `sampleId` (کلیدِ پایدار) ← نامِ یکسان (در همان درس، بعد کلی) ← نامِ نزدیک.
 * در حالتِ نزدیک، هم درس/نامِ بسته و هم نامِ خودِ مبحث به‌عنوان نشانه استفاده می‌شود و
 * فقط وقتی نتیجهٔ یکتا و مطمئن باشد برمی‌گردد؛ در تساوی `undefined` (کاربر خودش می‌گوید).
 */
export function resolveTopicByName(
  wanted: { name: string; subjectName?: string; sampleId?: string },
  existing: { topics: Topic[]; subjects: Subject[] },
): TopicResolution | undefined {
  const bySample = wanted.sampleId ? existing.topics.find((t) => t.sampleId === wanted.sampleId) : undefined;
  if (bySample) return { topicId: bySample.id, via: "sample", score: 1, topicName: bySample.name };

  const target = canon(wanted.name);
  if (!target) return undefined;
  const subjectById = new Map(existing.subjects.map((s) => [s.id, s]));
  const wantedSubject = wanted.subjectName ? canon(wanted.subjectName) : "";

  const sameSubjectExact = existing.topics.filter(
    (t) => canon(t.name) === target && (!wantedSubject || canon(subjectById.get(t.subjectId)?.name ?? "") === wantedSubject),
  );
  if (sameSubjectExact.length === 1) {
    return { topicId: sameSubjectExact[0].id, via: "exact", score: 1, topicName: sameSubjectExact[0].name };
  }
  const anyExact = existing.topics.filter((t) => canon(t.name) === target);
  if (anyExact.length === 1) return { topicId: anyExact[0].id, via: "exact", score: 1, topicName: anyExact[0].name };

  // ── نامِ نزدیک: همان نمره‌دهندهٔ درسنامه‌ها، با سقفِ محافظه‌کارانه‌تر ──
  const words = target.split(" ").filter(Boolean);
  if (words.length < MIN_SHORT_WORDS) return undefined; // «سل»، «آسم» را حدس نمی‌زنیم
  const scored = existing.topics
    .map((t) => {
      const subjectName = canon(subjectById.get(t.subjectId)?.name ?? "");
      return {
        topic: t,
        subjectMatch: !!wantedSubject && subjectName === wantedSubject,
        score: lessonTitleScore(wanted.name, t.name),
      };
    })
    .filter((row) => row.score >= CARD_TOPIC_MIN_SCORE)
    .sort((a, b) => b.score - a.score || Number(b.subjectMatch) - Number(a.subjectMatch));
  const top = scored[0];
  if (!top) return undefined;
  const ties = scored.filter((row) => Math.abs(row.score - top.score) < 0.001);
  if (ties.length > 1) {
    const inSubject = ties.filter((row) => row.subjectMatch);
    if (inSubject.length !== 1) return undefined;
    return { topicId: inSubject[0].topic.id, via: "fuzzy", score: inSubject[0].score, topicName: inSubject[0].topic.name };
  }
  if (top.score < 0.99 && top.score - (scored[1]?.score ?? 0) < CARD_TOPIC_MIN_MARGIN) return undefined;
  return { topicId: top.topic.id, via: "fuzzy", score: top.score, topicName: top.topic.name };
}

/** یک پیشنهادِ اتصال برای کارتِ بی‌مبحث */
export interface CardLinkSuggestion {
  cardId: string;
  topicId: string;
  topicName: string;
  via: "lesson" | "pack" | "name";
  score: number;
  /** متنِ کوتاهِ روی کارت — برای پیش‌نمایش */
  preview: string;
}

/** نتیجهٔ کلِ همگام‌سازی: چه چیزی وصل می‌شود و چه چیزی دستِ کاربر است */
export interface CardSyncPlan {
  /** درس‌های تکراری/غیرِ کاتالوگ که فقط با نمونهٔ رسمی ادغام‌شدنی‌اند (اطلاع‌رسانی) */
  duplicateSubjects: { id: string; name: string; officialId: string; officialName: string; cards: number }[];
  /** پیشنهادهای اطمینان‌بخش — با یک تپ همه اعمال می‌شوند */
  suggestions: CardLinkSuggestion[];
  /** کارت‌هایی که خودکار پیدا نشدند (برای انتخابِ دستی) */
  unresolved: { cardId: string; preview: string }[];
  /** از پیش وصل‌شده‌ها — فقط برای گزارش */
  alreadyLinked: number;
}

export interface CardSyncInput {
  cards: Flashcard[];
  topics: Topic[];
  subjects: Subject[];
  /** اتصال‌هایی که کاربر قبلاً برای درسنامه‌ها ساخته (`lessonTopicLinks`: درسنامه → مبحث) */
  lessonLinks?: Record<string, string> | null;
  /** مبحثِ مؤثرِ هر پکِ منتخب (`packId` → `topicId`) — فقط پک‌هایی که مبحثشان در اپ هست */
  packTopic?: Map<string, string> | null;
}

/**
 * نقشهٔ همگام‌سازی — پیشنهادِ اتصال برای هر کارتِ بی‌مبحث.
 *
 * اولویت: (۱) کارتی که از یک درسنامه آمده و کاربر همان درسنامه را به مبحثی وصل کرده،
 * (۲) کارتِ پکِ منتخبی که مبحثش در اپ هست، (۳) تطبیقِ نام از تنها سرنخِ موجود روی کارت.
 */
export function planCardTopicSync(input: CardSyncInput): CardSyncPlan {
  const topicIds = new Set(input.topics.map((t) => t.id));
  const topicNameById = new Map(input.topics.map((t) => [t.id, t.name]));
  const lessonLinks = input.lessonLinks ?? {};
  const packTopic = input.packTopic ?? new Map<string, string>();
  const suggestions: CardLinkSuggestion[] = [];
  const unresolved: { cardId: string; preview: string }[] = [];
  let alreadyLinked = 0;
  const seen = new Set<string>();

  for (const card of input.cards) {
    if (card.topicId && topicIds.has(card.topicId)) {
      alreadyLinked += 1;
      continue;
    }
    const preview = (card.front ?? "").replace(/\s+/g, " ").trim().slice(0, 70);
    if (seen.has(card.id)) continue;
    seen.add(card.id);

    // (۱) پیوندِ درسنامه: کارتی که از یک بخشِ درسنامه آمده و آن درسنامه مبحث دارد
    const lessonTopic = card.lessonId ? lessonLinks[card.lessonId] : undefined;
    if (lessonTopic && topicIds.has(lessonTopic)) {
      suggestions.push({ cardId: card.id, topicId: lessonTopic, topicName: topicNameById.get(lessonTopic) ?? "", via: "lesson", score: 1, preview });
      continue;
    }
    // (۲) پکِ منتخب با مبحثِ مشخص — منبعِ حقیقت همان نقشهٔ پک است
    const packTopicId = card.packId ? packTopic.get(card.packId) : undefined;
    if (packTopicId && topicIds.has(packTopicId)) {
      suggestions.push({ cardId: card.id, topicId: packTopicId, topicName: topicNameById.get(packTopicId) ?? "", via: "pack", score: 1, preview });
      continue;
    }
    unresolved.push({ cardId: card.id, preview });
  }

  // درس‌های تکراری: نامِ یکسان با یک درسِ کاتالوگ (یا `sampleId` یکسان) — ادغام خودکار نه، ولی گزارش بله
  const byOfficialKey = new Map<string, Subject>();
  for (const s of input.subjects) if (s.sampleId) byOfficialKey.set(canon(s.name), s);
  const duplicateSubjects: CardSyncPlan["duplicateSubjects"] = [];
  const cardCountBySubject = new Map<string, number>();
  const topicSubject = new Map(input.topics.map((t) => [t.id, t.subjectId]));
  for (const c of input.cards) {
    if (!c.topicId) continue;
    const subjectId = topicSubject.get(c.topicId);
    if (subjectId) cardCountBySubject.set(subjectId, (cardCountBySubject.get(subjectId) ?? 0) + 1);
  }
  for (const s of input.subjects) {
    if (s.sampleId) continue;
    const official = byOfficialKey.get(canon(s.name));
    if (!official) continue;
    duplicateSubjects.push({
      id: s.id,
      name: s.name,
      officialId: official.id,
      officialName: official.name,
      cards: cardCountBySubject.get(s.id) ?? 0,
    });
  }

  return { duplicateSubjects, suggestions, unresolved, alreadyLinked };
}

/**
 * نقشهٔ «پک → مبحث» از پک‌های منتخبِ ثبت‌شده روی مباحثِ اپ.
 * فقط پک‌هایی که `topicSampleId` دارند و مبحثش واقعاً در فهرست است.
 */
export function packTopicMap(
  packs: { id: string; topicSampleId?: string }[],
  topics: Topic[],
): Map<string, string> {
  const bySample = new Map(topics.filter((t) => t.sampleId).map((t) => [t.sampleId as string, t.id]));
  const out = new Map<string, string>();
  for (const p of packs) {
    if (!p.topicSampleId) continue;
    const topicId = bySample.get(p.topicSampleId);
    if (topicId) out.set(p.id, topicId);
  }
  return out;
}

/** متنِ خلاصهٔ نقشه — همان چیزی که در پیش‌نمایش و توست استفاده می‌شود */
export function cardSyncSummary(plan: CardSyncPlan): string {
  const fa = (n: number) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
  const parts: string[] = [];
  if (plan.suggestions.length > 0) parts.push(`${fa(plan.suggestions.length)} کارت به مبحثِ اپ وصل می‌شود`);
  if (plan.unresolved.length > 0) parts.push(`${fa(plan.unresolved.length)} کارت هنوز بی‌مبحث است`);
  if (plan.duplicateSubjects.length > 0) parts.push(`${fa(plan.duplicateSubjects.length)} درسِ تکراری`);
  return parts.length > 0 ? parts.join(" · ") : "همهٔ کارت‌ها از قبل با مبحث‌ها همگام بودند ✅";
}
