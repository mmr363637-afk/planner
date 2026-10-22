// ===== 🤖 پاسخنامه و گزینه‌های انحرافی با کمک هوش مصنوعی (اختیاری) =====
// اصلِ طراحی: **پاسخ درست هیچ‌وقت از AI گرفته نمی‌شود.** پاسخ درست همان پشتِ کارت
// است؛ AI فقط (۱) پاسخنامهٔ کوتاه می‌نویسد و (۲) می‌تواند گزینه‌های انحرافیِ بهتری
// پیشنهاد دهد. هر گزینهٔ پیشنهادی از همان فیلترهای آفلاینِ `isUsableDistractor`
// می‌گذرد و اگر رد شود، سؤال با همان گزینه‌های قبلی می‌ماند. پس خروجیِ AI هرگز
// نمی‌تواند «پاسخ درست» را عوض کند یا گزینهٔ هم‌پوشان/چندپاسخی بسازد.
//
// این ماژول خودش شبکه صدا نمی‌زند مگر با `aiEnrichQuestions`؛ توابعِ prompt/parse/
// apply خالص‌اند و تست می‌شوند. اگر دستیار وصل نباشد یا اینترنت نباشد، خطای روشن
// برمی‌گردد و UI به همان پاسخنامهٔ آفلاین تکیه می‌کند.
import type { CardQuestion, Flashcard } from "../types";
import { cardContentHash, isUsableDistractor, normalizeText, seededShuffle } from "./cardQuiz";
import { loadAiConfig, requestAiChat, type AiChatMessage } from "./ai";

export const AI_QUESTION_BATCH = 8;
export const AI_QUESTION_BATCH_MAX = 20;
export const AI_EXPLANATION_MAX = 700;

export interface AiQuestionInput {
  question: CardQuestion;
  card: Flashcard;
}

export interface AiQuestionPatch {
  id: string;
  explanation: string;
  distractors: string[];
}

/**
 * پرامپتِ دسته‌ای: یک درخواست برای چند سؤال (نه یک درخواست برای هر کارت) تا
 * هزینه/تعداد درخواست‌ها کم بماند. مدل اجازه ندارد پاسخ درست را عوض کند.
 */
export function buildAiQuestionsPrompt(items: AiQuestionInput[]): AiChatMessage[] {
  const payload = items.map(({ question, card }) => ({
    id: question.id,
    prompt: question.prompt,
    correct: question.options[question.correctIndex],
    options: question.options,
    cardFront: card.front,
    cardBack: card.back,
  }));
  const system =
    "تو به یک دانشجوی پزشکی برای مرورِ آزمون کمک می‌کنی. برای هر سؤال، پاسخنامهٔ کوتاه و " +
    "سه گزینهٔ انحرافی بنویس. قواعد سخت:\n" +
    "۱) پاسخ درست را تغییر نده و آن را از گزینه‌ها انتخاب نکن؛ فقط توضیح بده.\n" +
    "۲) هر گزینهٔ انحرافی باید «قطعاً غلط» باشد ولی برای کسی که خوب نخوانده «باورپذیر»؛ " +
    "نه هم‌معنای پاسخ درست، نه زیرمجموعهٔ آن، نه «همهٔ موارد»، نه «هیچ‌کدام»، نه گزینهٔ دوم‌درست.\n" +
    "۳) اگر ممکن است دو گزینه هم‌زمان درست باشند، آن سؤال را از خروجی حذف کن (اولویت با صحت است).\n" +
    "۴) اعداد/دوزها را عوض نکن تا گزینهٔ «کمی‌درست» ساخته نشود؛ در مباحثِ پزشکی، گزینهٔ " +
    "متفاوت فقط در یک عدد می‌تواند خطرناک باشد.\n" +
    "۵) توضیح حداکثر ۴ خط: «پاسخ درست چه بود»، «چرا»، «چرا بقیه غلط‌اند»، «یک نکتهٔ کلیدی برای آزمون».\n" +
    "۶) خروجی فقط JSON معتبر باشد و هیچ متن دیگری نداشته باشد.\n" +
    'قالب: [{"id":"...","explanation":"...","distractors":["...","...","..."]}]';
  return [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(payload) },
  ];
}

/** استخراج آرایهٔ JSON با تحمل ```json و متن اضافه — بدون پرتاب خطا */
export function parseAiQuestionsResponse(raw: string): AiQuestionPatch[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const arr = JSON.parse(body.slice(start, end + 1)) as unknown;
    if (!Array.isArray(arr)) return [];
    const out: AiQuestionPatch[] = [];
    for (const row of arr) {
      const r = row as Partial<AiQuestionPatch>;
      if (typeof r?.id !== "string" || !r.id.trim()) continue;
      if (typeof r.explanation !== "string") continue;
      const explanation = r.explanation.trim().slice(0, AI_EXPLANATION_MAX);
      if (explanation.length < 20) continue;
      const distractors = Array.isArray(r.distractors)
        ? r.distractors.filter((d): d is string => typeof d === "string").map((d) => d.trim()).filter(Boolean).slice(0, 3)
        : [];
      out.push({ id: r.id.trim(), explanation, distractors });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * اعمالِ یک پاسخ AI روی سؤال — با حفظ پاسخ درست.
 * • توضیح: اگر حداقل ۲۰ نویسه باشد پذیرفته می‌شود.
 * • گزینه‌ها: فقط اگر هر سه از فیلتر عبور کنند و با هم یکتا باشند، جایگزین می‌شوند؛
 *   وگرنه گزینه‌های قبلی دست‌نخورده می‌مانند (بهبود توضیح بدون خراب‌کردن سؤال).
 */
export function applyAiPatch(question: CardQuestion, card: Flashcard, patch: AiQuestionPatch, aiModel?: string): CardQuestion | null {
  if (!patch || patch.id !== question.id) return null;
  const explanation = (patch.explanation ?? "").trim().slice(0, AI_EXPLANATION_MAX);
  if (explanation.length < 20) return null;
  const correct = question.options[question.correctIndex];
  if (typeof correct !== "string" || !correct.trim()) return null;

  const seen = new Set<string>([normalizeText(correct)]);
  const valid: string[] = [];
  for (const candidate of patch.distractors ?? []) {
    const text = candidate.trim();
    if (!text) continue;
    const key = normalizeText(text);
    if (seen.has(key)) continue;
    if (!isUsableDistractor(text, correct, question.prompt)) continue;
    if (valid.some((v) => normalizeText(v) === key)) continue;
    seen.add(key);
    valid.push(text);
    if (valid.length === 3) break;
  }

  let options = question.options;
  let correctIndex = question.correctIndex;
  if (valid.length === 3) {
    const seed = Number.parseInt(cardContentHash(card.front, card.back), 36) ^ question.kind.length;
    const shuffled = seededShuffle([correct, ...valid], seed >>> 0);
    const idx = shuffled.findIndex((o) => normalizeText(o) === normalizeText(correct));
    if (idx >= 0) {
      options = shuffled;
      correctIndex = idx;
    }
  }

  return {
    ...question,
    options,
    correctIndex,
    explanation,
    source: "ai",
    aiModel: aiModel || undefined,
    aiAt: Date.now(),
  };
}

export interface AiEnrichResult {
  updated: CardQuestion[];
  /** شناسهٔ سؤال‌هایی که AI برایشان خروجیِ قابل‌استفاده نداد */
  skipped: string[];
  error?: string;
}

/**
 * تولید دسته‌ایِ پاسخنامه (و در صورت کیفیت، گزینه‌های بهتر).
 * اگر دستیار وصل نباشد یا شبکه نباشد، `error` روشن برمی‌گردد و هیچ داده‌ای عوض نمی‌شود.
 */
export async function aiEnrichQuestions(
  items: AiQuestionInput[],
  opts: { signal?: AbortSignal } = {},
): Promise<AiEnrichResult> {
  if (items.length === 0) return { updated: [], skipped: [] };
  const cfg = loadAiConfig();
  if (!cfg) return { updated: [], skipped: items.map((i) => i.question.id), error: "دستیار هوشمند در تنظیمات وصل نشده است." };
  const batch = items.slice(0, AI_QUESTION_BATCH_MAX);
  let raw: string;
  try {
    raw = await requestAiChat(buildAiQuestionsPrompt(batch), opts.signal);
  } catch (e) {
    return { updated: [], skipped: batch.map((i) => i.question.id), error: e instanceof Error ? e.message : "درخواست به دستیار ناموفق بود." };
  }
  const patches = parseAiQuestionsResponse(raw);
  if (patches.length === 0) {
    return { updated: [], skipped: batch.map((i) => i.question.id), error: "خروجی دستیار قابل استفاده نبود؛ دوباره تلاش کن." };
  }
  const byId = new Map(patches.map((p) => [p.id, p]));
  const updated: CardQuestion[] = [];
  const skipped: string[] = [];
  for (const { question, card } of batch) {
    const patch = byId.get(question.id);
    const next = patch ? applyAiPatch(question, card, patch, cfg.model) : null;
    if (next) updated.push(next);
    else skipped.push(question.id);
  }
  return { updated, skipped };
}

/** سؤال‌هایی که ارزشِ فرستادن به AI دارند: بی‌پاسخنامه یا با پاسخنامهٔ آفلاینِ کوتاه */
export function questionsNeedingAi(questions: CardQuestion[], limit = AI_QUESTION_BATCH): CardQuestion[] {
  return questions
    .filter((q) => q.status !== "flagged")
    .filter((q) => q.source !== "ai" || (q.explanation?.length ?? 0) < 80)
    .slice(0, Math.max(1, Math.min(AI_QUESTION_BATCH_MAX, limit)));
}
