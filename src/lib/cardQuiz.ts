// ===== آزمون‌سازی از فلش‌کارت‌ها — کاملاً خالص و آفلاین =====
// این ماژول از محتوای خودِ کارت‌ها سؤال چهارگزینه‌ای/جاخالی می‌سازد:
//  • گزینهٔ درست از پاسخِ کارت
//  • سه گزینهٔ انحرافی از پاسخِ کارت‌های *همان مبحث* (بعد همان درس، بعد بقیه)
//  • فیلترهای ضدِ ابهام: گزینهٔ تکراری، هم‌معنا/زیرمجموعهٔ پاسخ درست، یا گزینه‌ای که
//    در صورت سؤال آمده، حذف می‌شود. اگر سه گزینهٔ سالم پیدا نشود، سؤال ساخته
//    نمی‌شود و جلسه به حالت کلاسیک برمی‌گردد — تولید گزینهٔ نامعتبر ممنوع.
// همه‌ی توابع خالص‌اند تا در تست‌ها و در حالت آفلاین قابل اتکا باشند.
import type { CardQuestion, CardQuestionKind, Flashcard, Topic } from "../types";
import { mulberry32 } from "./random";
import { hasCloze, revealCloze } from "./cloze";

export const QUESTION_OPTIONS = 4;
export const MIN_OPTION_LENGTH = 3;
export const MAX_OPTION_LENGTH = 160;

/** نرمال‌سازی فارسی/عربی برای مقایسه — بدون تغییر در متنِ نمایشی */
export function normalizeText(input: string): string {
  return String(input)
    .replace(/[\u064A\u0649]/g, "ی")
    .replace(/\u0643/g, "ک")
    .replace(/[\u200C\u200F\u200E]/g, " ")
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/[«»"'`“”‘’()[\]{}،,.:;؛|/\\\-–—_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** هشِ محتوا (FNV-1a) — برای تشخیص ویرایش کارت و شناسهٔ پایدار سؤال */
export function cardContentHash(front: string, back: string): string {
  const text = normalizeText(front) + "\u0000" + normalizeText(back);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const STOPWORDS = new Set([
  "است", "هست", "هستند", "می", "شود", "شوند", "کرد", "کند", "دارد", "دارند", "باشد", "بود",
  "برای", "در", "از", "با", "که", "این", "آن", "یک", "را", "به", "یا", "و", "هم", "ترین",
  "بیشتر", "کمتر", "حدود", "شامل", "باعث", "میان", "روی", "زیر", "بین", "پس", "قبل", "بعد",
  "چند", "چه", "کدام", "کجا", "چگونه", "چرا", "داروی", "بیماری", "درمان", "علامت", "نشانه",
]);

function truncate(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trim()}…`;
}

/**
 * «پاسخ کلیدی» کارت: بخشِ کوتاه و قابل‌مقایسهٔ پشتِ کارت.
 * اگر پاسخ چند جمله/بخش دارد، بخش اول کافی است؛ و اگر خیلی بلند بود کوتاه می‌شود.
 */
export function keyAnswer(back: string): string {
  const text = revealCloze(back).replace(/\s+/g, " ").trim();
  if (!text) return "";
  const parts = text.split(/[؛;|\n]|\s—\s|\.\s/);
  let key = (parts.find((p) => p.trim().length >= MIN_OPTION_LENGTH) ?? text).trim();
  // پیشوندهای تزئینیِ پاسخ («پاسخ:»، «جواب ۲ —» و…) گزینه را مصنوعی می‌کنند
  key = key
    .replace(
      /^(?:پاسخ|جواب)(?:\s+(?:[۰-۹0-9]+|یک|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده)(?![آ-ی]))?/i,
      "",
    )
    .replace(/^\s*[:：\-–]\s*/, "")
    .trim();
  return truncate(key, MAX_OPTION_LENGTH);
}

function tokensOf(text: string): string[] {
  return normalizeText(text).split(" ").filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

/** شباهت واژگانی ۰..۱ — برای ردکردن گزینه‌های بیش‌ازحد نزدیک (چندپاسخی) */
export function similarity(a: string, b: string): number {
  const ta = new Set(tokensOf(a));
  const tb = new Set(tokensOf(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / Math.min(ta.size, tb.size);
}

/**
 * آیا این گزینه برای سؤالِ «پاسخ درست کدام است؟» قابل قبول است؟
 * معیارها عمداً سخت‌گیرانه‌اند تا در مباحث پزشکی سؤال چندپاسخی ساخته نشود.
 */
export function isUsableDistractor(candidate: string, correct: string, prompt: string): boolean {
  const c = candidate.trim();
  const k = correct.trim();
  if (c.length < MIN_OPTION_LENGTH || c.length > MAX_OPTION_LENGTH) return false;
  const nc = normalizeText(c);
  const nk = normalizeText(k);
  if (!nc || nc === nk) return false;
  // گزینه‌ای که پاسخ درست داخلش است (یا برعکس) از نظر علمی هم درست می‌شود
  if (nc.includes(nk) || nk.includes(nc)) return false;
  // گزینه‌ای که در صورت سؤال آمده، جواب را لو می‌دهد
  if (normalizeText(prompt).includes(nc)) return false;
  // گزینهٔ بیش‌ازحد هم‌واژه با پاسخ درست = احتمال چندپاسخی
  if (similarity(c, k) >= 0.75) return false;
  // اختلاف طولِ فاحش، جواب را لو می‌دهد
  const ratio = c.length / Math.max(1, k.length);
  if (ratio < 0.35 || ratio > 2.6) return false;
  // عددِ متفاوت از عددِ پاسخ درست: در مباحث پزشکی معمولاً «کمی درست/کمی غلط» است
  const correctNum = k.match(/\d+(?:[.,]\d+)?/);
  const candidateNum = c.match(/\d+(?:[.,]\d+)?/);
  if (correctNum && candidateNum && correctNum[0] !== candidateNum[0] && similarity(c, k) >= 0.4) return false;
  return true;
}

/** گزینه‌ها را با seed ثابت جابه‌جا می‌کند تا بازکردن دوبارهٔ سؤال ترتیب را عوض نکند */
export function seededShuffle<T>(items: T[], seed: number): T[] {
  const rnd = mulberry32(seed >>> 0);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** استخراج عبارت‌های کلیدی از سایر کارت‌ها، با اولویت همان مبحث */
export function distractorPool(
  card: Flashcard,
  pool: Flashcard[],
  topics: Topic[] = [],
): { text: string; sameTopic: boolean; sameSubject: boolean }[] {
  const topicSubject = new Map(topics.map((t) => [t.id, t.subjectId]));
  const subject = card.topicId ? topicSubject.get(card.topicId) : undefined;
  const seen = new Set<string>([normalizeText(keyAnswer(card.back))]);
  const out: { text: string; sameTopic: boolean; sameSubject: boolean }[] = [];
  for (const other of pool) {
    if (other.id === card.id) continue;
    const text = keyAnswer(other.back);
    const key = normalizeText(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const sameTopic = card.topicId != null && other.topicId === card.topicId;
    const otherSubject = other.topicId ? topicSubject.get(other.topicId) : undefined;
    const sameSubject = !sameTopic && subject != null && otherSubject === subject;
    out.push({ text, sameTopic, sameSubject });
  }
  // اول همان مبحث، بعد همان درس، بعد بقیه — برای ارتباط معنایی بیشتر
  return [
    ...out.filter((x) => x.sameTopic),
    ...out.filter((x) => x.sameSubject),
    ...out.filter((x) => !x.sameTopic && !x.sameSubject),
  ];
}

/** سه گزینهٔ انحرافیِ سالم از استخر؛ اگر کافی نبود null */
export function pickDistractors(
  correct: string,
  prompt: string,
  pool: { text: string }[],
  count = QUESTION_OPTIONS - 1,
  seed?: number,
): string[] | null {
  const picked: string[] = [];
  const seen = new Set<string>();
  // کمی تنوع در انتخاب، ولی پاسخ همیشه یکسان می‌ماند
  const ordered = seed == null ? pool : seededShuffle(pool, seed);
  for (const item of ordered) {
    if (picked.length >= count) break;
    if (!isUsableDistractor(item.text, correct, prompt)) continue;
    const key = normalizeText(item.text);
    if (seen.has(key) || picked.some((p) => similarity(p, item.text) >= 0.8)) continue;
    seen.add(key);
    picked.push(item.text.trim());
  }
  return picked.length >= count ? picked : null;
}

/** همهٔ کلمه‌های نامزدِ جاخالی در یک متن (طولی ≥ ۴، غیرِ ایستا، یکتا در متن) */
export function clozeTermCandidates(text: string): string[] {
  const clean = revealCloze(text);
  const words = clean
    .split(/[\s،,.:;؛()\[\]{}«»"']+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  const unique = words.filter((w) => (clean.match(new RegExp(escapeRegExp(w), "g")) ?? []).length === 1);
  return [...new Set(unique.length > 0 ? unique : words)];
}

/** کلمه/عبارتِ کلیدی برای جاخالی از یک متن */
export function pickClozeTerm(text: string): string | null {
  const candidates = clozeTermCandidates(text);
  if (candidates.length === 0) return null;
  // طولانی‌ترین کلمه معمولاً اصطلاح تخصصی است (فوروزماید، پنوموتوراکس…)
  return candidates.reduce((a, b) => (b.length > a.length ? b : a), candidates[0]);
}

/**
 * جاخالیِ «متمایز»: کلمه‌ای که در سایر کارت‌های همان استخر کمتر تکرار شده باشد،
 * تا سؤال با اصطلاحِ مشترکِ همهٔ کارت‌ها بی‌معنا نشود. طول و اصطلاح‌بودن هم امتیاز دارد.
 */
export function pickDistinctiveTerm(text: string, pool: Flashcard[] = []): string | null {
  const candidates = clozeTermCandidates(text);
  if (candidates.length === 0) return null;
  const poolText = pool
    .map((c) => `${revealCloze(c.front)} ${revealCloze(c.back)}`)
    .join(" ");
  const normalizedPool = normalizeText(poolText);
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const term of candidates) {
    const key = normalizeText(term);
    const shared = key.length > 0 && normalizedPool.includes(key);
    const score =
      term.length +
      (shared ? -6 : 8) +
      (/[A-Za-z]/.test(term) ? 3 : 0) +
      (/[۰-۹0-9]/.test(term) ? 1 : 0);
    if (score > bestScore) {
      best = term;
      bestScore = score;
    }
  }
  return best;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * ساخت سؤال از یک کارت.
 * kind = mcq → صورت سؤال، پشت کارت به‌عنوان پاسخ درست.
 * kind = cloze → یک اصطلاح از متن پنهان می‌شود.
 * اگر گزینه‌های سالم کافی نبود، null برمی‌گردد (هیچ‌وقت گزینهٔ نامعتبر نمی‌سازیم).
 */
export function buildQuestionFromCard(
  card: Flashcard,
  pool: Flashcard[],
  opts: { kind?: CardQuestionKind; topics?: Topic[]; now?: number; idFactory?: () => string } = {},
): CardQuestion | null {
  const kind = opts.kind ?? "mcq";
  const now = opts.now ?? Date.now();
  const hash = cardContentHash(card.front, card.back);
  const seed = seedFrom(`${card.id}:${hash}:${kind}`);

  if (kind === "mcq") {
    const prompt = revealCloze(card.front).trim();
    const correct = keyAnswer(card.back);
    if (!prompt || !correct) return null;
    const distractors = pickDistractors(correct, prompt, distractorPool(card, pool, opts.topics), QUESTION_OPTIONS - 1, seed);
    if (!distractors) return null;
    const options = seededShuffle([correct, ...distractors], seed);
    const correctIndex = options.findIndex((o) => normalizeText(o) === normalizeText(correct));
    if (correctIndex < 0) return null;
    return {
      id: `q:${card.id}:${hash}:${kind}`,
      cardId: card.id,
      topicId: card.topicId,
      kind,
      prompt,
      options,
      correctIndex,
      explanation: buildOfflineExplanation(card, correct),
      source: "offline",
      cardHash: hash,
      createdAt: now,
      status: "ok",
    };
  }

  // ---- جاخالی ----
  const source = hasCloze(card.front) ? card.front : hasCloze(card.back) ? card.back : revealCloze(card.back).length >= 12 ? card.back : card.front;
  let term: string | null = null;
  const clozeMatch = source.match(/\{\{([^{}]+)\}\}/);
  if (clozeMatch) term = clozeMatch[1].trim();
  else term = pickDistinctiveTerm(source, pool.filter((other) => other.id !== card.id));
  if (!term) return null;
  const prompt = revealCloze(source).replace(term, "____");
  if (!prompt.includes("____")) return null;
  const sameTopic = opts.topics ? pool : pool;
  const candidates: { text: string }[] = [];
  for (const other of sameTopic) {
    if (other.id === card.id) continue;
    const otherSource = hasCloze(other.front) ? other.front : other.back;
    const otherMatch = otherSource.match(/\{\{([^{}]+)\}\}/);
    const otherTerm = otherMatch
      ? otherMatch[1].trim()
      : pickDistinctiveTerm(otherSource, pool.filter((x) => x.id !== other.id));
    if (otherTerm) candidates.push({ text: otherTerm });
  }
  const distractors = pickDistractors(term, prompt, candidates, QUESTION_OPTIONS - 1, seed);
  if (!distractors) return null;
  const options = seededShuffle([term, ...distractors], seed);
  const correctIndex = options.findIndex((o) => normalizeText(o) === normalizeText(term));
  if (correctIndex < 0) return null;
  return {
    id: `q:${card.id}:${hash}:${kind}`,
    cardId: card.id,
    topicId: card.topicId,
    kind,
    prompt,
    options,
    correctIndex,
    explanation: `✅ عبارت درست: «${term}»\n💡 ${truncate(revealCloze(source), 220)}`,
    source: "offline",
    cardHash: hash,
    createdAt: now,
    status: "ok",
  };
}

/** پاسخنامهٔ کوتاهِ آفلاین — از خود کارت، بدون هیچ درخواست شبکه */
export function buildOfflineExplanation(card: Flashcard, correct = keyAnswer(card.back)): string {
  const answer = revealCloze(card.back);
  const note = card.note?.trim();
  const lines = [`✅ پاسخ درست: «${correct}»`, `💡 نکتهٔ کارت: ${truncate(answer, 220)}`];
  if (note) lines.push(`📝 یادداشت تو: ${truncate(note, 140)}`);
  if (card.evidence) lines.push(`📄 منبع: ${card.evidence.documentTitle} — صفحهٔ ${card.evidence.page}`);
  lines.push("ℹ️ این پاسخنامه از محتوای همین کارت ساخته شده؛ جای بررسیِ نهایی با منبع را نمی‌گیرد.");
  return lines.join("\n");
}

/** اعتبارسنجی سؤال ذخیره‌شده — مخصوصاً بعد از ویرایش کارت */
export function questionIsValid(q: CardQuestion, card: Flashcard | undefined): boolean {
  if (!card) return false;
  if (q.status === "flagged") return false;
  if (q.cardHash !== cardContentHash(card.front, card.back)) return false;
  if (!q.prompt.trim()) return false;
  if (!Array.isArray(q.options) || q.options.length !== QUESTION_OPTIONS) return false;
  if (q.correctIndex < 0 || q.correctIndex >= q.options.length) return false;
  const normalized = q.options.map((o) => normalizeText(o));
  if (normalized.some((o) => !o)) return false;
  if (new Set(normalized).size !== normalized.length) return false;
  const nCorrect = normalized[q.correctIndex];
  if (q.options.some((o, i) => i !== q.correctIndex && o.trim() === q.options[q.correctIndex].trim())) return false;
  // گزینه‌های دیگر نباید پاسخِ درست را در خود داشته باشند (چندپاسخی)
  if (normalized.some((o, i) => i !== q.correctIndex && (o.includes(nCorrect) || nCorrect.includes(o)))) return false;
  return true;
}

export interface EnsureQuestionsResult {
  /** سؤال‌های معتبر (شامل سؤال‌های flag‌شدهٔ قدیمی برای نگه‌داشتن سابقه) */
  questions: CardQuestion[];
  created: number;
  rebuilt: number;
  /** کارت‌هایی که با محتوای فعلی امکان ساخت سؤال سالم نداشتند */
  unsupported: string[];
}

/**
 * «تولید تدریجی + ذخیره» با اولویتِ سؤال‌های موجود:
 * سؤال معتبرِ قبلی دوباره ساخته نمی‌شود؛ سؤالِ کهنه (کارت ویرایش شده) بازسازی
 * می‌شود و سؤال تازه فقط برای کارت‌های بدون سؤال ساخته می‌شود.
 * این رویکرد نسبت به تولید یک‌جای همهٔ سؤال‌ها ارزان‌تر است: هر کارت فقط یک‌بار
 * (یا بعد از ویرایش) تولید می‌شود و در آزمون‌های بعدی همان ذخیره‌شده استفاده می‌شود.
 */
export function ensureQuestionsForCards(
  cards: Flashcard[],
  allCards: Flashcard[],
  existing: CardQuestion[],
  opts: { kind?: CardQuestionKind; topics?: Topic[]; now?: number } = {},
): EnsureQuestionsResult {
  const byCard = new Map<string, CardQuestion>();
  for (const q of existing) {
    // برای هر کارت یک سؤال در هر نوع نگه می‌داریم (نوع جدید جای قدیمی را نمی‌گیرد)
    byCard.set(`${q.cardId}:${q.kind}`, q);
  }
  const cardById = new Map(allCards.map((c) => [c.id, c]));
  const result: CardQuestion[] = [...existing];
  let created = 0;
  let rebuilt = 0;
  const unsupported: string[] = [];
  for (const card of cards) {
    const kind = opts.kind ?? "mcq";
    const key = `${card.id}:${kind}`;
    const prev = byCard.get(key);
    if (prev && questionIsValid(prev, cardById.get(card.id))) continue;
    const fresh = buildQuestionFromCard(card, allCards, { ...opts, kind });
    if (!fresh) {
      unsupported.push(card.id);
      continue;
    }
    const idx = result.findIndex((q) => q.id === prev?.id || (q.cardId === card.id && q.kind === kind));
    if (idx >= 0) {
      result[idx] = { ...fresh, createdAt: opts.now ?? Date.now() };
      rebuilt += 1;
    } else {
      result.push(fresh);
      created += 1;
    }
  }
  return { questions: result, created, rebuilt, unsupported };
}

export type SessionOrder = "due" | "random" | "bookmarked" | "weak";

export interface SessionPickOptions {
  today: string;
  onlyDue?: boolean;
  count?: number;
  order?: SessionOrder;
  seed?: number;
}

/** انتخاب کارت‌های یک جلسه — ترتیب/تعداد/فیلتر یک‌جا و قابل تست */
export function pickSessionCards(cards: Flashcard[], opts: SessionPickOptions): Flashcard[] {
  const onlyDue = opts.onlyDue ?? false;
  let list = onlyDue ? cards.filter((c) => c.dueDate <= opts.today) : [...cards];
  const order = opts.order ?? "due";
  if (order === "bookmarked") list = list.filter((c) => c.bookmark);
  if (order === "weak") list.sort((a, b) => b.lapses - a.lapses || a.dueDate.localeCompare(b.dueDate));
  else if (order === "random") list = seededShuffle(list, opts.seed ?? seedFrom(opts.today));
  else list.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
  const count = opts.count && opts.count > 0 ? Math.min(opts.count, list.length) : list.length;
  return list.slice(0, count);
}

export type SessionMode = "classic" | "mcq" | "cloze" | "timed" | "mixed";

export interface QuizItem {
  card: Flashcard;
  mode: "classic" | "mcq" | "cloze";
  question?: CardQuestion;
}

/**
 * صف جلسه: هر کارت می‌تواند کلاسیک، چهارگزینه‌ای یا جاخالی باشد.
 * در حالت‌های mcq/cloze/mixed اگر سؤال معتبر نباشد، همان کارت کلاسیک می‌شود
 * (به‌جای ساختن گزینهٔ نامعتبر یا حذف بی‌صدا). تعداد fallback گزارش می‌شود.
 */
export function buildQuizQueue(
  cards: Flashcard[],
  questions: CardQuestion[],
  mode: SessionMode,
  opts: { seed?: number; kind?: CardQuestionKind } = {},
): { items: QuizItem[]; fallback: number } {
  const byCard = new Map(questions.map((q) => [`${q.cardId}:${q.kind}`, q]));
  const order: ("mcq" | "cloze")[] = mode === "mixed" ? ["mcq", "cloze"] : mode === "cloze" ? ["cloze"] : ["mcq"];
  let fallback = 0;
  const items = cards.map((card, i) => {
    if (mode === "classic" || mode === "timed") {
      // آزمون زمان‌دار پیش‌فرض چهارگزینه‌ای است اگر سؤال موجود باشد؛ وگرنه کلاسیک
      const q = mode === "timed" ? byCard.get(`${card.id}:mcq`) : undefined;
      if (q && questionIsValid(q, card)) return { card, mode: "mcq" as const, question: q };
      return { card, mode: "classic" as const };
    }
    const pickMode = mode === "mixed" ? order[i % order.length] : (opts.kind ?? order[0]);
    const q = byCard.get(`${card.id}:${pickMode}`);
    if (q && questionIsValid(q, card)) return { card, mode: pickMode, question: q };
    fallback += 1;
    return { card, mode: "classic" as const };
  });
  return { items, fallback };
}

/** زمان جلسه به قالب دقیقه:ثانیه با ارقام فارسی */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const fa = (n: number) => String(n).padStart(2, "0").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
  return `${fa(m)}:${fa(sec)}`;
}

export const SESSION_TIME_PRESETS = [5, 10, 15, 20, 30, 45, 60] as const;
export const SESSION_COUNT_PRESETS = [5, 10, 20, 30, 50] as const;

/** کلیدِ یکتای پاسخ هر کارت در جلسه — مانع ثبت چندباره در رفت‌وبرگشت */
export function answerKey(item: QuizItem): string {
  return `${item.card.id}:${item.question?.id ?? "classic"}`;
}

export interface AnswerRecord {
  /** گزینهٔ انتخاب‌شده؛ در حالت کلاسیک null */
  selectedIndex: number | null;
  /** درست/غلط — در کارت کلاسیک خودارزیابی کاربر */
  correct: boolean;
  /** زمان صرف‌شده روی کارت (میلی‌ثانیه) */
  ms?: number;
  answeredAt: number;
}

export interface SessionScore {
  total: number;
  answered: number;
  correct: number;
  wrong: number;
  skipped: number;
  accuracy: number | null;
}

export function scoreSession(items: QuizItem[], answers: Record<string, AnswerRecord>): SessionScore {
  let correct = 0;
  let wrong = 0;
  let answered = 0;
  for (const item of items) {
    const a = answers[answerKey(item)];
    if (!a) continue;
    answered += 1;
    if (a.correct) correct += 1;
    else wrong += 1;
  }
  return {
    total: items.length,
    answered,
    correct,
    wrong,
    skipped: items.length - answered,
    accuracy: answered > 0 ? Math.round((correct / answered) * 100) : null,
  };
}

/** تبدیل درست/غلط سؤال به کیفیت SM-2 (بدون ثبت چندباره) */
export function qualityForMcq(correct: boolean): 1 | 4 {
  return correct ? 4 : 1;
}
