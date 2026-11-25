// ===== 🎯 وصل‌کردنِ درسنامه به «مبحثِ برنامه» =====
//
// باگِ واقعی (گلایهٔ کاربر): «آبسهٔ ریه را خواندم؛ ساعتِ مطالعه در آمارِ روزانه ثبت شد
// ولی برنامه هنوز می‌گفت نخوانده‌ام».
//
// ریشه: واریزِ زمانِ درسنامه به تسک‌های برنامه فقط وقتی اتفاق می‌افتاد که یک «مبحث»
// پیدا شود، و پیداکردنش دو مشکل داشت:
//   ۱. درسنامه‌های درسِ «عفونی» در مخزنِ محتوا هیچ `appSubjectKeys` ندارند — کلید فقط
//      روی خودِ درس آمده است. نتیجه: `topicId = null` و زمان فقط در آمارِ روز می‌نشست.
//   ۲. وقتی کلید بود، کد قدیمی «اولین مبحثِ آن درس» را برمی‌داشت (نه مبحثِ هم‌نام)،
//      یعنی زمانِ «آبسهٔ ریه» به تسکِ «تب و هیپرترمی» واریز می‌شد.
//
// این ماژول خالص است و هیچ وابستگی به React/store ندارد:
//   • «کدام مبحث‌های اپ به این درسنامه نزدیک‌اند؟» را با امتیازدهیِ عنوان حساب می‌کند
//   • فقط وقتی با اطمینانِ کافی یک مبحث یکتا هست، خودکار وصل می‌کند
//   • در موارد مبهم/بی‌ربط چیزی را حدس نمی‌زند؛ انتخاب با کاربر می‌ماند (TopicLink UI)
//
// قاعدهٔ اتصال همان `Subject.sampleId` ↔ `appSubjectKeys` است (مثلِ بقیهٔ بخش‌ها).

import { normalizeFa } from "./textSearch";
import type { Subject, Topic } from "../types";

// ─────────────────────────────── نرمال‌سازی و توکن‌ها ───────────────────────────────

/**
 * واژه‌های پُرکاربردِ بی‌معنا برای تطبیق (حرف اضافه/نشانه + شمارهٔ فصل).
 * ⚠️ عمداً «فوق/بطنی/دهلیزی» این‌جا نیستند: «آریتمیِ فوقِ بطنی» و «آریتمیِ بطنی»
 * دو مبحثِ کاملاً متفاوت‌اند و حذفِ «فوق» آن‌ها را به هم می‌چسباند.
 */
const STOPWORDS = new Set([
  "و", "در", "از", "با", "به", "تا", "یا", "بر", "برای", "که", "این", "آن",
  "های", "ها", "یک", "فصل", "بخش", "مقدمه",
  "of", "the", "and", "in", "on", "for", "with", "to", "a", "an",
]);

/** هم‌معنی‌ها پس از نرمال‌سازی (فقط برای واژه‌های پرتکرارِ همین حوزه) */
const SYNONYMS: Record<string, string> = {
  کمخونی: "انمی",
  آنمی: "انمی",
  انمی: "انمی",
  ایدز: "اچایوی",
  hiv: "اچایوی",
};

/**
 * توکن‌های قابلِ‌مقایسهٔ یک عنوان: نرمال‌سازیِ فارسی (ی/ک/آ/ه، نیم‌فاصله، اعراب)،
 * حذفِ واژه‌های پُرکاربرد و عددها، و کندنِ پسوندِ جمع («ها/های/هایی») و «ی»ِ پایانی.
 */
const LATIN = /^[a-z][a-z0-9+\-]*$/;

export function topicTokens(text: string): string[] {
  // نیم‌فاصله «چسباندنِ» دو نیمهٔ یک واژه است («کم‌خونی» = «کمخونی»)، نه جداکردنشان؛
  // اگر به فاصله تبدیل شود، «کم» و «خونی» دو واژهٔ مستقل حساب می‌شوند و تطبیق می‌شکند.
  const normalized = normalizeFa(String(text ?? "").replace(/[\u200c\u200d]/g, ""));
  if (!normalized) return [];
  const out: string[] = [];
  for (let token of normalized.split(" ")) {
    if (!token || STOPWORDS.has(token)) continue;
    if (/^\d+$/.test(token)) continue;
    token = token.replace(/(هایی|های|ها)$/, "");
    if (token.length > 4 && token.endsWith("ی")) token = token.slice(0, -1);
    token = SYNONYMS[token] ?? token;
    if (token.length >= 2 && !STOPWORDS.has(token)) out.push(token);
  }
  // در عنوانِ فارسی، واژهٔ لاتین معمولاً اختصارِ داخلِ پرانتز است («آسیب حاد کلیوی (AKI)»)
  // و اگر حساب شود، پوشش را بی‌دلیل کم می‌کند؛ پس وقتی واژهٔ فارسی هست، لاتین‌ها می‌روند.
  const persian = out.filter((t) => !LATIN.test(t));
  return persian.length > 0 ? persian : out;
}

/** فاصلهٔ ویرایشی ≤ ۱ (برای غلط‌های تایپی/املایی مثلِ «کلیوی» ↔ «کلیه») */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    }
    prev = cur;
  }
  return prev[b.length] <= 1;
}

/** امتیازِ تطبیقِ دو واژه: کامل > یک‌حرف اختلاف > شروعِ یکسان */
function wordPairScore(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length >= 4 && b.length >= 4 && a[0] === b[0] && withinOneEdit(a, b)) return 0.85;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return 0.8;
  return 0;
}

// ─────────────────────────────── امتیازِ عنوانِ درسنامه ↔ مبحث ───────────────────────────────

/**
 * امتیازِ شباهتِ عنوانِ درسنامه به نامِ مبحث (۰..۱؛ ۰ = بی‌ربط).
 *
 * الگو: تطبیقِ واژه‌به‌واژه (هر واژهٔ مبحث فقط یک‌بار مصرف می‌شود) + پوششِ دوطرفه:
 * اگر همهٔ واژه‌های عنوان در مبحث باشند ولی مبحث واژهٔ اضافه داشته باشد («آبسه ریه» ↔
 * «پنومونی و آبسه ریه») امتیاز بالا می‌گیرد، ولی یک واژهٔ مشترکِ عمومی («قلب») هرگز
 * به‌تنهایی کافی نیست. عنوانِ چندواژه‌ای که دقیقاً داخلِ دیگری آمده هم امتیازِ بالا دارد.
 */
export function lessonTitleScore(title: string, topicName: string): number {
  const nt = normalizeFa(String(title ?? "").replace(/[\u200c\u200d]/g, ""));
  const nn = normalizeFa(String(topicName ?? "").replace(/[\u200c\u200d]/g, ""));
  if (!nt || !nn) return 0;
  if (nt === nn) return 1;

  const T = topicTokens(title);
  const N = topicTokens(topicName);
  if (T.length === 0 || N.length === 0) return 0;

  // عبارتِ چندواژه‌ای که کامل داخلِ دیگری آمده: «آسیب حاد کلیوی» ≠ «آسیب حاد کلیه» این‌جا
  // نمی‌گیرد (واژه‌ها یکی نیستند)، ولی «فصل ۸ — سوختگی» ↔ «سوختگی» بعد از حذفِ عدد می‌گیرد.
  // «عبارتِ کوتاه‌تر کامل داخلِ بلندتر هست؟» — ولی فقط در مرزِ واژه، نه زیررشته.
  // دو باگِ واقعیِ نمونهٔ اولیه این‌جا بسته می‌شود: «سل» که زیررشتهٔ «سلول‌های بنیادی»
  // بود، و «تروما» که زیررشتهٔ «تروماهای قلبی» حساب می‌شد و درسنامهٔ قلب را به مبحثِ
  // جراحی می‌چسباند. هم‌چنین «تغذیه» نباید کلِ «مایعات، الکترولیت و تغذیه» راclaim کند.
  if ((nn.includes(" ") || nt.includes(" ")) && nn.length >= 5 && nt.length >= 5 && nn !== nt) {
    const nWords = nn.split(" ");
    const tWords = nt.split(" ");
    const containsWords = (long: string[], short: string[]) => {
      for (let i = 0; i + short.length <= long.length; i++) {
        if (short.every((w, j) => long[i + j] === w)) return true;
      }
      return false;
    };
    const covered = containsWords(tWords, nWords) ? nWords.length / tWords.length : containsWords(nWords, tWords) ? tWords.length / nWords.length : 0;
    if (covered >= 0.5) return 0.93;
  }

  const used = new Set<number>();
  const matched: number[] = [];
  for (const t of T) {
    let best = 0;
    let bestIndex = -1;
    for (let j = 0; j < N.length; j++) {
      if (used.has(j)) continue;
      const s = wordPairScore(t, N[j]);
      if (s > best) {
        best = s;
        bestIndex = j;
      }
    }
    if (bestIndex >= 0) {
      used.add(bestIndex);
      matched.push(best);
    }
  }
  if (matched.length === 0) return 0;

  const coverTitle = matched.reduce((a, b) => a + b, 0) / T.length;
  const coverTopic = matched.length / N.length;
  let score = 0.55 * coverTitle + 0.45 * coverTopic;

  // همهٔ واژه‌های عنوان در مبحث آمده‌اند (مبحثِ جزئی‌تر/کامل‌تر)
  if (coverTitle >= 0.999 && T.length >= 2) score = Math.max(score, 0.9);
  if (coverTitle >= 0.999 && T.length === 1) score = Math.max(score, N.length === 1 ? 0.88 : 0.82);
  // مبحث کاملاً پوشش داده شده و تقریباً همهٔ عنوان هم
  // (اگر واژهٔ معناداری از عنوان بی‌تطبیق بماند — مثلِ «فوق» در «آریتمیِ فوقِ بطنی»
  // در برابرِ «آریتمیِ بطنی» — این تقویت اعمال نمی‌شود تا دو مبحثِ متفاوت قاطی نشوند)
  if (coverTopic >= 0.999 && coverTitle >= 0.9) score = Math.max(score, 0.89);

  return Math.min(score, 0.95);
}

// ─────────────────────────────── رتبه‌بندیِ مبحث‌های کاندید ───────────────────────────────

export interface TopicCandidate {
  topicId: string;
  /** نامِ مبحث در اپ */
  name: string;
  subjectId: string;
  subjectName: string;
  /** امتیازِ خامِ شباهتِ عنوان (۰..۱) */
  score: number;
  /** درسِ این مبحث با `appSubjectKeys` درسنامه یکی است */
  sameSubject: boolean;
  /** این مبحث تسکِ در انتظار در برنامه دارد */
  hasPendingTask: boolean;
}

export interface RankTopicsInput {
  /** عنوانِ درسنامه/بخش — مثلاً «آبسهٔ ریه» */
  title?: string;
  /** کلیدهای درسِ اپ (`Subject.sampleId`) که درسنامه به آن‌ها وصل است */
  appSubjectKeys?: string[];
  subjects: Subject[];
  topics: Topic[];
  /** مبحث‌هایی که تسکِ در انتظار دارند — برای ترجیح در تساویِ امتیاز */
  pendingTopicIds?: Set<string>;
  /** اگر false باشد، فقط محدود به درس‌های هم‌کلید امتیاز می‌دهد (برای بخش‌های کلی مثلِ اسکچ‌نوت) */
  allowCrossSubject?: boolean;
}

/** حداقلِ امتیازِ قابلِ‌اتکا برای وصلِ خودکار */
export const AUTO_TOPIC_MIN_SCORE = 0.85;
/** اختلافِ لازم با کاندیدِ بعدی (وقتی امتیاز کامل نیست) */
export const AUTO_TOPIC_MIN_MARGIN = 0.06;

/**
 * مبحث‌های کاندیدِ یک درسنامه، از بهترین به بدترین.
 * فقط مبحث‌هایی می‌آیند که امتیازشان صفر نیست؛ مبحث‌های هم‌درس (با کلیدِ کاتالوگ)
 * و مبحث‌هایی که برنامه برایشان تسکِ در انتظار دارد، در تساوی جلو می‌افتند.
 */
export function rankTopicsForLesson(input: RankTopicsInput): TopicCandidate[] {
  const keySet = new Set(input.appSubjectKeys ?? []);
  const subjectById = new Map(input.subjects.map((s) => [s.id, s]));
  const pending = input.pendingTopicIds ?? new Set<string>();
  const allowCross = input.allowCrossSubject ?? true;
  const out: TopicCandidate[] = [];
  for (const topic of input.topics) {
    const subject = subjectById.get(topic.subjectId);
    const sameSubject = !!subject?.sampleId && keySet.has(subject.sampleId);
    if (!allowCross && keySet.size > 0 && !sameSubject) continue;
    const score = input.title ? lessonTitleScore(input.title, topic.name) : 0;
    if (score <= 0) continue;
    out.push({
      topicId: topic.id,
      name: topic.name,
      subjectId: topic.subjectId,
      subjectName: subject?.name ?? "",
      score,
      sameSubject,
      hasPendingTask: pending.has(topic.id),
    });
  }
  return out.sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.sameSubject) - Number(a.sameSubject) ||
      Number(b.hasPendingTask) - Number(a.hasPendingTask) ||
      a.name.localeCompare(b.name, "fa"),
  );
}

const EPS = 0.001;

/**
 * انتخابِ خودکارِ مبحث از فهرستِ رتبه‌بندی‌شده — فقط وقتی با اطمینان کافی یک مبحث یکتا باشد.
 *
 *  • امتیازِ بهترین کاندید باید ≥ `AUTO_TOPIC_MIN_SCORE` باشد.
 *  • اگر امتیازِ کامل (≈۱) نداشته باشد، لازم است از کاندیدِ بعدی حداقل `AUTO_TOPIC_MIN_MARGIN`
 *    بهتر باشد («آبسهٔ ریه» ↔ «پنومونی و آبسه ریه»: ۰٫۹ در برابرِ گزینه‌های ۰٫۵ → قبول).
 *  • در تساویِ امتیاز، مبحثِ هم‌درس (کلیدِ کاتالوگ) و بعد مبحثی که تسکِ در انتظار دارد
 *    ترجیح داده می‌شود؛ اگر باز هم دو کاندیدِ برابر بمانند، هیچ‌چیز خودکار وصل نمی‌شود
 *    (حدسِ اشتباه بدتر از نبودِ اتصال است — کاربر خودش انتخاب می‌کند).
 */
export function pickAutoTopic(candidates: TopicCandidate[]): string | null {
  const top = candidates[0];
  if (!top || top.score < AUTO_TOPIC_MIN_SCORE) return null;

  const ties = candidates.filter((c) => Math.abs(c.score - top.score) < EPS);
  if (ties.length > 1) {
    const sameSubject = ties.filter((c) => c.sameSubject);
    if (sameSubject.length === 1) return sameSubject[0].topicId;
    const pool = sameSubject.length > 0 ? sameSubject : ties;
    const withTasks = pool.filter((c) => c.hasPendingTask);
    return withTasks.length === 1 ? withTasks[0].topicId : null;
  }

  // امتیازِ کامل خودش گویاست؛ وگرنه فاصله از کاندیدِ بعدی هم شرط است
  if (top.score >= 0.99) return top.topicId;
  if (top.score - candidates[1].score < AUTO_TOPIC_MIN_MARGIN) return null;
  return top.topicId;
}

/**
 * مبحثِ مؤثرِ یک درسنامه (خالص و مشترک بینِ خوانندهٔ درسنامه و اسکچ‌نوت/آزمایشگاه):
 *  ۱. اگر کاربر خودش مبحثی وصل کرده باشد (`links[trackId]`) و آن مبحث هنوز وجود داشته باشد، همان.
 *  ۲. وگرنه مبحثِ خودکار (فقط اگر یکتا و مطمئن باشد).
 *  ۳. وگرنه null → زمان فقط در آمارِ روز می‌ماند و UI از کاربر می‌خواهد مبحث را انتخاب کند.
 */
export function resolveTopicForTrack(input: {
  trackId: string;
  links?: Record<string, string> | null;
  title?: string;
  appSubjectKeys?: string[];
  subjects: Subject[];
  topics: Topic[];
  pendingTopicIds?: Set<string>;
  autoMatch?: boolean;
}): { topicId: string | null; linked: boolean; candidates: TopicCandidate[] } {
  const linkedId = input.links?.[input.trackId];
  const linkedTopic = linkedId ? input.topics.find((t) => t.id === linkedId) : undefined;
  if (linkedTopic) {
    return {
      topicId: linkedTopic.id,
      linked: true,
      candidates: rankTopicsForLesson({ ...input, title: input.title }).slice(0, 8),
    };
  }
  const candidates = rankTopicsForLesson({
    title: input.autoMatch === false ? undefined : input.title,
    appSubjectKeys: input.appSubjectKeys,
    subjects: input.subjects,
    topics: input.topics,
    pendingTopicIds: input.pendingTopicIds,
  }).slice(0, 8);
  return { topicId: input.autoMatch === false ? null : pickAutoTopic(candidates), linked: false, candidates };
}

/**
 * مبحثِ خودکار از فهرستِ رتبه‌بندی‌شده — همان تصمیمی که store می‌گیرد.
 * UI هم باید همین را صدا بزند تا برچسبِ «خودکار» با آنچه واقعاً واریز می‌شود یکی باشد.
 */
export function autoTopicCandidate(candidates: TopicCandidate[]): TopicCandidate | null {
  const id = pickAutoTopic(candidates);
  return id ? candidates.find((c) => c.topicId === id) ?? null : null;
}

/** مبحث‌هایی که تسکِ در انتظار دارند — برای ترجیح در تساویِ امتیاز */
export function pendingTopicIdsOf(tasks: { topicId: string; status: string }[]): Set<string> {
  const out = new Set<string>();
  for (const t of tasks) if (t.status === "pending") out.add(t.topicId);
  return out;
}
