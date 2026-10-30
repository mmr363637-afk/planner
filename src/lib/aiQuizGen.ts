// ===== 🤖 ساخت سؤال چهارگزینه‌ای با هوش مصنوعی (حالت آنلاین) =====
//
// تفاوت با `aiQuestions.ts` (نسخهٔ ۱٫۲۱): آن‌جا AI فقط *پاسخنامه* و گزینه‌های
// انحرافیِ سؤالِ ساخته‌شده از کارت را بهتر می‌کرد. این‌جا کاربر می‌خواهد AI خودش
// «سؤال استاندارد با یک پاسخ صحیح و سه گزینهٔ انحرافیِ منطقی» بسازد.
//
// قاعدهٔ ایمنی: پاسخ درست باید از **محتوای همان کارت** پشتیبانی شود. هر گزینه‌ای که
// AI به‌عنوان پاسخ درست اعلام کند، فقط وقتی پذیرفته می‌شود که محتوای پشت کارت
// (یا صورت کارت) واقعاً آن را پوشش دهد؛ وگرنه سؤال دور ریخته می‌شود. گزینه‌های
// دیگر هم از همان فیلترهای آفلاینِ ضدِ ابهام می‌گذرند. خروجی همیشه «غیرقطعی»
// برچسب می‌خورد و جای مرور آفلاین را نمی‌گیرد.
//
// بدون اتصال به دستیار (یا بدون اینترنت) این ماژول هیچ سؤالی نمی‌سازد و حالت
// آفلاینِ `cardQuiz` دست‌نخورده کار می‌کند.

import type { CardQuestion, Flashcard, Topic } from "../types";
import { cardContentHash, isUsableDistractor, normalizeText, QUESTION_OPTIONS } from "./cardQuiz";
import { revealCloze } from "./cloze";
import { loadAiConfig, requestAiChat, type AiChatMessage } from "./ai";

export const AI_QUIZ_BATCH = 6;
export const AI_QUIZ_MAX_PER_RUN = 30;
export const AI_QUIZ_MAX_STEM = 420;
export const AI_QUIZ_MAX_OPTION = 180;

export interface AiQuizCardInput {
  id: string;
  front: string;
  back: string;
  topicName?: string;
  subjectName?: string;
}

export interface AiQuizDraft {
  cardId: string;
  stem: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

/** پرامپت دسته‌ای — چند کارت در یک درخواست تا هزینه و تعداد درخواست کم بماند */
export function buildAiQuizPrompt(cards: AiQuizCardInput[]): AiChatMessage[] {
  const payload = cards.map((c) => ({
    cardId: c.id,
    front: c.front,
    back: c.back,
    topic: c.topicName ?? "",
    subject: c.subjectName ?? "",
  }));
  const system =
    "تو معلم یک دانشجوی پزشکی هستی و از هر فلش‌کارت یک سؤال چهارگزینه‌ایِ استاندارد می‌سازی. قواعد سخت:\n" +
    "۱) صورت سؤال باید یک مفهومِ واقعی از کارت را بسنجد (نه حفظِ عین جمله). صورت سؤال کوتاه و روشن باشد.\n" +
    "۲) دقیقاً چهار گزینه بده؛ فقط یکی درست است. correctIndex شمارهٔ گزینهٔ درست (۰ تا ۳) است.\n" +
    "۳) پاسخ درست باید در محتوای همان کارت پشتیبانی شود؛ چیزی از خودت اضافه نکن که در کارت نیست.\n" +
    "۴) سه گزینهٔ دیگر باید «قطعاً غلط» ولی «باورپذیر» باشند: از همان موضوع/درس، هم‌اندازه، بدون " +
    "«همهٔ موارد»/«هیچ‌کدام»، بدون هم‌معنای پاسخ درست و بدون گزینهٔ دوم‌درست.\n" +
    "۵) اعداد و دوزها را عوض نکن تا گزینهٔ «کمی‌درست» ساخته نشود؛ اگر کارت عدد دارد، سؤال را روی " +
    "مفهوم بساز نه روی عدد.\n" +
    "۶) توضیح کوتاه (حداکثر ۳ خط): چرا پاسخ درست است و چرا بقیه غلط‌اند. اگر مطمئن نیستی، آن کارت را حذف کن.\n" +
    "۷) خروجی فقط JSON معتبر و بدون هیچ متن اضافی.\n" +
    'قالب: [{"cardId":"...","stem":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"..."}]';
  return [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(payload) },
  ];
}

/** استخراج آرایهٔ JSON با تحمل ```json و متن اضافه — هرگز خطا پرتاب نمی‌کند */
export function parseAiQuizResponse(raw: string): AiQuizDraft[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const arr = JSON.parse(body.slice(start, end + 1)) as unknown;
    if (!Array.isArray(arr)) return [];
    const out: AiQuizDraft[] = [];
    for (const row of arr) {
      const r = row as Partial<AiQuizDraft>;
      if (typeof r?.cardId !== "string" || !r.cardId.trim()) continue;
      if (typeof r.stem !== "string" || !r.stem.trim()) continue;
      if (!Array.isArray(r.options)) continue;
      const options = r.options.filter((o): o is string => typeof o === "string").map((o) => o.trim());
      if (options.length !== QUESTION_OPTIONS) continue;
      const idx = typeof r.correctIndex === "number" ? Math.floor(r.correctIndex) : -1;
      if (idx < 0 || idx >= QUESTION_OPTIONS) continue;
      out.push({
        cardId: r.cardId.trim(),
        stem: r.stem.trim().slice(0, AI_QUIZ_MAX_STEM),
        options,
        correctIndex: idx,
        explanation: typeof r.explanation === "string" ? r.explanation.trim().slice(0, 700) : undefined,
      });
    }
    return out;
  } catch {
    return [];
  }
}

const STOP = new Set([
  "است", "هست", "هستند", "می", "شود", "شوند", "کرد", "کند", "دارد", "دارند", "باشد", "بود",
  "برای", "در", "از", "با", "که", "این", "آن", "یک", "را", "به", "یا", "و", "هم", "شده",
  "بیمار", "درمان", "علامت", "نشانه", "علت", "شایع‌ترین", "شایع", "کدام", "چیست",
]);

function contentTokens(text: string): string[] {
  return normalizeText(text)
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

/**
 * آیا محتوای کارت، گزینهٔ اعلام‌شده به‌عنوان «پاسخ درست» را پشتیبانی می‌کند؟
 * معیار: گنجیده‌شدنِ متنی، یا پوششِ حداقل ۶۰٪ واژه‌های کلیدیِ گزینه در متن کارت.
 * این سد، جلوی «پاسخِ ساختگی/خارج از کارت» را می‌گیرد.
 */
export function answerSupportedByCard(correct: string, card: Pick<Flashcard, "front" | "back">): boolean {
  const guess = normalizeText(correct);
  if (!guess) return false;
  const source = normalizeText(`${revealCloze(card.front)} ${revealCloze(card.back)}`);
  if (!source) return false;
  if (source.includes(guess)) return true;
  const tokens = contentTokens(correct);
  if (tokens.length === 0) return false;
  const hit = tokens.filter((t) => source.includes(t)).length;
  return hit / tokens.length >= 0.6 && hit >= 1;
}

/** اعتبارسنجی کاملِ یک سؤالِ پیشنهادیِ AI و تبدیل به CardQuestion (یا null) */
export function aiDraftToQuestion(
  draft: AiQuizDraft,
  card: Flashcard,
  aiModel?: string,
  now = Date.now(),
): CardQuestion | null {
  if (!draft || draft.cardId !== card.id) return null;
  const stem = draft.stem.trim();
  if (stem.length < 8 || stem.length > AI_QUIZ_MAX_STEM) return null;
  if (draft.options.length !== QUESTION_OPTIONS) return null;
  const options = draft.options.map((o) => o.trim().slice(0, AI_QUIZ_MAX_OPTION));
  if (options.some((o) => o.length < 2)) return null;
  const normalized = options.map((o) => normalizeText(o));
  if (normalized.some((o) => !o)) return null;
  if (new Set(normalized).size !== QUESTION_OPTIONS) return null;
  const correctIndex = draft.correctIndex;
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= QUESTION_OPTIONS) return null;
  const correct = options[correctIndex];
  // پاسخ درست باید از خودِ کارت پشتیبانی شود
  if (!answerSupportedByCard(correct, card)) return null;
  // صورت سؤال نباید جواب را لو بدهد
  if (normalizeText(stem).includes(normalized[correctIndex])) return null;
  // سه گزینهٔ دیگر باید از فیلترهای ضدِ ابهام بگذرند
  const seen = new Set<string>([normalized[correctIndex]]);
  let usable = 0;
  for (let i = 0; i < options.length; i++) {
    if (i === correctIndex) continue;
    const candidate = options[i];
    if (!isUsableDistractor(candidate, correct, stem)) return null;
    const key = normalizeText(candidate);
    if (seen.has(key)) return null;
    seen.add(key);
    usable += 1;
  }
  if (usable !== QUESTION_OPTIONS - 1) return null;

  const hash = cardContentHash(card.front, card.back);
  return {
    id: `q:${card.id}:${hash}:ai`,
    cardId: card.id,
    topicId: card.topicId,
    kind: "mcq",
    prompt: stem,
    options,
    correctIndex,
    explanation:
      (draft.explanation?.trim() ||
        `✅ پاسخ درست: «${correct}»\n💡 ${revealCloze(card.back).slice(0, 220)}`) +
      "\n🤖 این سؤال با هوش مصنوعی ساخته شده و غیرقطعی است؛ با منبع بررسی کن.",
    source: "ai",
    aiModel: aiModel || undefined,
    aiAt: now,
    cardHash: hash,
    createdAt: now,
    status: "ok",
  };
}

export interface AiQuizResult {
  questions: CardQuestion[];
  /** کارت‌هایی که AI برایشان سؤالِ قابل‌قبول نساخت (دور ریخته شدند) */
  rejected: string[];
  error?: string;
}

export interface AiQuizOptions {
  cards: Flashcard[];
  topics?: Topic[];
  batchSize?: number;
  maxQuestions?: number;
  now?: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

/**
 * ساخت سؤال با AI به‌صورت دسته‌ای. هر دسته یک درخواست است؛ کارت‌هایی که خروجی
 * نامعتبر/خارج از کارت داشتند در `rejected` برمی‌گردند تا UI صریح بگوید و همان
 * کارت‌ها در حالت آفلاین اجرا شوند.
 */
export async function aiGenerateQuestions(opts: AiQuizOptions): Promise<AiQuizResult> {
  const cfg = loadAiConfig();
  if (!cfg) return { questions: [], rejected: [], error: "دستیار هوشمند در تنظیمات وصل نشده است." };
  const max = Math.max(1, Math.min(AI_QUIZ_MAX_PER_RUN, opts.maxQuestions ?? AI_QUIZ_MAX_PER_RUN));
  const batchSize = Math.max(1, Math.min(AI_QUIZ_BATCH, opts.batchSize ?? AI_QUIZ_BATCH));
  const cards = opts.cards.slice(0, max);
  if (cards.length === 0) return { questions: [], rejected: [] };
  const topicById = new Map((opts.topics ?? []).map((t) => [t.id, t]));
  const byId = new Map(cards.map((c) => [c.id, c]));
  const questions: CardQuestion[] = [];
  const rejected = new Set<string>();
  let lastError: string | undefined;

  for (let i = 0; i < cards.length; i += batchSize) {
    if (opts.signal?.aborted) break;
    const batch = cards.slice(i, i + batchSize);
    const input: AiQuizCardInput[] = batch.map((c) => ({
      id: c.id,
      front: revealCloze(c.front).slice(0, 600),
      back: revealCloze(c.back).slice(0, 900),
      topicName: c.topicId ? topicById.get(c.topicId)?.name : undefined,
    }));
    let raw: string;
    try {
      raw = await requestAiChat(buildAiQuizPrompt(input), opts.signal);
    } catch (e) {
      lastError = e instanceof Error ? e.message : "درخواست به دستیار ناموفق بود.";
      break;
    }
    const drafts = parseAiQuizResponse(raw);
    const draftByCard = new Map(drafts.map((d) => [d.cardId, d]));
    for (const card of batch) {
      const draft = draftByCard.get(card.id);
      const q = draft ? aiDraftToQuestion(draft, card, cfg.model, opts.now) : null;
      if (q) questions.push(q);
      else rejected.add(card.id);
    }
    opts.onProgress?.(Math.min(cards.length, i + batchSize), cards.length);
  }
  // اگر یک کارت در دستهٔ اول رد شد ولی در دستهٔ بعد (به‌دلیل شکست شبکه) دوباره ساخته شد
  for (const q of questions) rejected.delete(q.cardId);
  void byId;
  return { questions, rejected: [...rejected], error: lastError };
}

/** آیا برای این کارت سؤالِ AIِ معتبرِ موجود داریم؟ (برای جلوگیری از درخواست تکراری) */
export function hasAiQuestion(existing: CardQuestion[], card: Flashcard): boolean {
  const hash = cardContentHash(card.front, card.back);
  return existing.some((q) => q.cardId === card.id && q.source === "ai" && q.cardHash === hash && q.status !== "flagged");
}

/** کارت‌هایی که هنوز سؤالِ AIِ به‌روز ندارند */
export function cardsNeedingAiQuestions(cards: Flashcard[], existing: CardQuestion[], limit = AI_QUIZ_MAX_PER_RUN): Flashcard[] {
  return cards.filter((c) => !hasAiQuestion(existing, c)).slice(0, Math.max(1, Math.min(AI_QUIZ_MAX_PER_RUN, limit)));
}
