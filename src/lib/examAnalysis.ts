// ===== 🧠 تحلیلِ ساختاریِ پاسخنامهٔ بانک سؤال =====
//
// چرا این فایل وجود دارد؟
//  پاسخنامهٔ هر سؤال در بانک، یک متنِ چندخطی است که با نشان‌ها (کلید/💡/✔/✖/📌/🔍/🚩)
//  نوشته شده. اگر همان متن یک‌جا نمایش داده شود، تحلیلِ گزینه‌ها و نکته‌های آموزشی همه
//  در یک پاراگرافِ پیوسته قاطی می‌شوند — همان ایرادی که در نسخهٔ آزمایشی دیده شد.
//  این ماژول متن را به اجزای مستقل و قابل‌نمایش تجزیه می‌کند:
//
//    • `keyLine`    — «کلید: گزینهٔ ۴ (…) ✅» یا «⚠️ کلید ذخیره‌شده: …»
//    • `insights`   — بدنهٔ تحلیلِ پاسخ (💡) بدونِ بولت‌ها
//    • `options`    — تحلیلِ هر گزینه، وصل‌شده به شمارهٔ همان گزینه (✔/✖)
//    • `doubts`     — چرا کلید زیر سؤال است (🔍/⚠️)
//    • `reviewNote` — یادداشتِ بازبینی (🚩) که اسکریپتِ ساخت به پاسخنامه اضافه می‌کند
//    • `tips`       — نکتهٔ آزمونی (📌)
//    • `keyPoints`  — نکته‌های اتمی و آموزشی که هرکدام جداگانه به فلش‌کارت تبدیل می‌شوند
//    • `notes`      — هر خطِ باقی‌مانده (هیچ‌چیز دور ریخته نمی‌شود)
//
//  تجزیه «هنگامِ نمایش» انجام می‌شود نه هنگامِ ساختِ بانک. نتیجه:
//    – دادهٔ شاردها کوچک می‌ماند (همان پاسخنامه، بدونِ تکرار)؛
//    – برای سؤال‌های قدیمی، مجموعهٔ نمونهٔ داخلی و هر منبعِ دیگری یکسان کار می‌کند؛
//    – تابع خالص است و کامل تست می‌شود.

/** نتیجهٔ تحلیلِ یک گزینه: درست، نادرست، یا صرفاً یک توضیح (بدونِ حکم) */
export type OptionVerdict = "correct" | "wrong" | "neutral";

export interface OptionAnalysis {
  /** شمارهٔ گزینه (۰..۳) */
  index: number;
  verdict: OptionVerdict;
  /** متنِ تحلیل — برچسبِ خودِ گزینه از اولش حذف شده تا در UI تکراری دیده نشود */
  text: string;
  /** برچسبی که در پاسخنامه برای این گزینه آمده (وقتی عینِ متنِ گزینه نباشد) */
  label?: string;
}

export interface QuestionAnalysis {
  /** «کلید: گزینهٔ ۴ (…) ✅» — اگر در پاسخنامه باشد */
  keyLine?: string;
  /** شمارهٔ گزینه‌ای که در `keyLine` آمده (۰..۳) — برای تشخیصِ ناسازگاری با کلیدِ ذخیره‌شده */
  keyIndex?: number;
  /** بدنهٔ تحلیلِ پاسخ (💡) — هر بلوک یک رشته */
  insights: string[];
  /** نکتهٔ آزمونی (📌) */
  tips: string[];
  /** چرا کلید زیر سؤال است (🔍 / ⚠️) */
  doubts: string[];
  /** یادداشتِ بازبینیِ محتوا (🚩) */
  reviewNote?: string;
  /** تحلیلِ گزینه‌ها، به تفکیکِ شمارهٔ گزینه */
  options: OptionAnalysis[];
  /** هر خطِ دیگری که در هیچ دسته‌ای جا نشد — دور ریخته نمی‌شود */
  notes: string[];
  /** نکته‌های اتمی و آموزشی — کاندیدای فلش‌کارت */
  keyPoints: string[];
  /** چند خطِ تحلیل به یک گزینه وصل شد (برای گزارش/آمار) */
  matchedOptions: number;
}

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
/** هر دو مجموعهٔ رقمِ فارسی و عربی-هندی */
const ANY_DIGIT = "[0-9۰-۹٠-٩]";

/** رقم‌های فارسی/عربی → لاتین (برای مقایسه و خواندنِ شمارهٔ گزینه) */
export function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

/** نشانهٔ واریانتِ ایموجی (U+FE0F) و نویسه‌های نامرئی — بدونِ این، «💡» نصفه پاک می‌شد */
/**
 * نویزه‌های نامرئیِ قالب‌بندی: نشانهٔ واریانتِ ایموجی (U+FE0F)، علامت‌های جهتِ متن
 * (LRM/RLM و جداکننده‌های دوجهته) و BOM. این‌ها در دادهٔ بانک واقعاً هستند و دیده
 * نمی‌شوند؛ اگر پاک نشوند دو نکتهٔ «یکسان» متفاوت مقایسه می‌شوند و کلیدِ یکتای
 * فلش‌کارت برای یک نکته دو مقدار می‌سازد (یعنی فلش‌کارتِ تکراری).
 */
const INVISIBLE = /[\uFE0F\uFEFF\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

function stripInvisible(value: string): string {
  return value.replace(INVISIBLE, "").trim();
}

/** نرمال‌سازی برای مقایسهٔ متنِ گزینه با ابتدای خطِ تحلیل */
function comparable(value: string): string {
  return toLatinDigits(value.toLowerCase())
    .replace(INVISIBLE, "")
    .replace(/[\u200c\u200d]/g, "") // ZWNJ/ZWJ
    .replace(/[«»"'“”()\[\]{}؟?!.،,;:ـ\-–—•·]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function commonPrefixLength(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

/**
 * شباهتِ دو رشته با «طولانی‌ترین زیردنبالهٔ مشترک» — برای وقتی که برچسبِ گزینه در
 * پاسخنامه یک غلطِ املایی/ویرایشی جزئی دارد («هیدروکلورتیازید» در تحلیل،
 * «هیدروکلروتیازید» در گزینه). فقط روی برچسبِ کوتاهِ ابتدای خط اجرا می‌شود، پس
 * هزینه‌اش ناچیز است و فقط وقتی به کار می‌آید که تطبیقِ ابتدایِ رشته شکست خورده باشد.
 */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const n = Math.min(a.length, 48);
  const m = Math.min(b.length, 48);
  let prev = new Uint16Array(m + 1);
  let curr = new Uint16Array(m + 1);
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1]);
    }
    const swap = prev;
    prev = curr;
    curr = swap;
    curr.fill(0);
  }
  return prev[m] / Math.max(n, m);
}

/** برچسبِ ابتدای خطِ تحلیل: متن تا اولین «:» (اگر کوتاه باشد) */
function leadingLabel(text: string): string {
  const m = /^([^:：\n]{3,60})\s*[:：]/.exec(stripInvisible(text));
  return m ? m[1].trim() : "";
}

/** بیشترین طولِ نکتهٔ آموزشی که به فلش‌کارت می‌رود */
export const MAX_POINT_LENGTH = 400;
/** کمترین طولِ یک نکتهٔ آموزشیِ معنادار */
export const MIN_POINT_LENGTH = 8;
/** سقفِ نکته‌های یک سؤال — بیشتر از این، فهرستِ فلش‌کارت غیرقابل‌مرور می‌شود */
export const MAX_KEY_POINTS = 12;

/** «گزینهٔ ۳» / «گزینه 3» / «پاسخ ۴» — فقط در ابتدای عبارت جست‌وجو می‌شود */
const OPTION_WORD = new RegExp(`(?:گزینه|گزينه|پاسخ|بند)\\s*[ٔهً]?\\s*(${ANY_DIGIT})`);
/** رقمِ چسبیده به نشان: «✖ ۱ …» یا «✖ ۱) …» */
const LEADING_NUMBER = new RegExp(`^\\s*(${ANY_DIGIT})\\s*[).،,]?\\s*`);
const BULLET = /^[•·●◦‣]\s+|^[-\u2013\u2014]\s+/;
const NUMBERED_BULLET = new RegExp(`^\\s*(${ANY_DIGIT})\\s*[).،,]\\s+`);

/** حذفِ شمارهٔ سربی از متن (هم رقمِ فارسی هم لاتین) */
function dropLeadingNumber(text: string): string {
  return text.replace(LEADING_NUMBER, (m, d) => (m.trim() === toLatinDigits(String(d)) ? "" : m.replace(/^\s*[0-9۰-۹٠-٩]\s*[).،,]?\s*/, "")));
}

/**
 * آیا این متن با «خودِ گزینه» شروع می‌شود؟
 * برای بولت‌های گزینه‌محوری که دونقطه ندارند («• ۳ ترومبوز بدون ریسک‌فاکتور نیز …»)؛
 * بدونِ این تشخیص، آن خط به‌جای تحلیلِ گزینهٔ ۳، یک «نکتهٔ آموزشی» حساب می‌شد و
 * فلش‌کارتی می‌ساخت که بیرون از آن سؤال معنی ندارد.
 */
function startsWithOption(text: string, option: string | undefined): boolean {
  if (!option) return false;
  const a = comparable(text);
  const o = comparable(option);
  if (o.length < 4 || a.length < 4) return false;
  const shared = commonPrefixLength(a, o);
  if (shared >= Math.min(8, o.length) && shared >= o.length * 0.6) return true;
  const label = leadingLabel(text);
  return Boolean(label) && similarity(comparable(label), o) >= 0.75;
}

/**
 * رقمِ سربیِ یک بولت به‌شمارهٔ گزینه (۱..۴) — یا null. رقمِ عربی (٠-٩) هم خوانده می‌شود.
 * قاعده‌اش باید با `leadingOptionNumber` در `scripts/buildQuestionBank.mjs` یکی بماند.
 */
function leadingOptionNumber(body: string): number | null {
  const ch = body.trim()[0] ?? "";
  const n = Number(toLatinDigits(ch));
  return Number.isFinite(n) && n >= 1 && n <= 4 ? n : null;
}

/**
 * آیا بولت‌های این پاسخنامه یک «دنبالهٔ شماره‌دارِ گزینه‌ها» هستند؟
 *
 * در ~۲٬۱۰۰ سؤالی که کلیدشان مشکوک/نامعتبر است، تحلیلِ گزینه‌ها به‌جای «✔/✖» با
 * «• ۱ … • ۲ … • ۳ … • ۴ …» نوشته شده و گاهی متنِ گزینه را تکرار نمی‌کند بلکه
 * بازنویسی‌اش می‌کند («۴ HIT دورهٔ حاد دارد…» برای گزینهٔ «ترومبوسیتوپنی ناشی از
 * هپارین»). تطبیقِ متن آن‌جا جواب نمی‌دهد، پس از خودِ دنباله کمک می‌گیریم: اگر دستِ‌کم
 * ۳ شمارهٔ متفاوت از ۱..۴ سرِ بولت‌ها آمده باشد، همهٔ بولت‌های شماره‌دار تحلیلِ
 * گزینه‌اند و باید زیرِ ردیفِ همان گزینه بنشینند — نه در فهرستِ نکته‌های آموزشی.
 * آستانهٔ ۳ محافظه‌کار است تا فهرستِ نکتهٔ شماره‌دارِ واقعی (۱–۲ مورد) دست‌نخورده بماند.
 */
export function hasNumberedOptionSeries(explanation: string | undefined | null): boolean {
  const digits = new Set<number>();
  for (const line of String(explanation ?? "").split(/\r?\n/)) {
    const trimmed = stripInvisible(line);
    if (!BULLET.test(trimmed)) continue;
    const body = trimmed.replace(BULLET, "").trim();
    const n = leadingOptionNumber(body);
    if (n == null) continue;
    if (!/^[\s).،,:ـ]/.test(body.slice(1))) continue;
    digits.add(n);
  }
  return digits.size >= 3;
}

/** شمارهٔ گزینه از یک خطِ تحلیل: رقمِ سربی، یا «گزینهٔ ۳» در ۶۰ نویسهٔ اول */
function optionIndexIn(text: string): number | null {
  const leading = LEADING_NUMBER.exec(text);
  if (leading && /^\s*[0-9۰-۹٠-٩]/.test(text)) {
    const n = Number(toLatinDigits(leading[1]));
    if (n >= 1 && n <= 4) return n - 1;
  }
  // «• گزینهٔ ۱ (سفترياکسون): …» — فقط در ۶۰ نویسهٔ اول تا شمارهٔ داخلِ توضیح
  // (مثلاً «دوز ۲») اشتباه جای گزینه ننشیند.
  const word = OPTION_WORD.exec(toLatinDigits(text.slice(0, 60)));
  if (word) {
    const n = Number(word[1]);
    if (n >= 1 && n <= 4) return n - 1;
  }
  return null;
}

/**
 * اگر خط با «متنِ خودِ گزینه» شروع شده باشد، آن برچسب و جداکننده‌اش از اولِ تحلیل
 * حذف می‌شود (چون گزینه همین بالا، در ردیفِ خودش نمایش داده شده)؛ وگرنه متن
 * دست‌نخورده برمی‌گردد.
 */
function splitOptionLabel(analysisText: string, optionText: string | undefined): { text: string; label?: string } {
  const clean = stripInvisible(analysisText);
  if (!optionText) return { text: clean };
  const a = comparable(clean);
  const o = comparable(optionText);
  if (o.length < 4) return { text: clean };
  const shared = commonPrefixLength(a, o);
  // هم‌پوشانی باید عملاً کلِ برچسبِ گزینه باشد (نه تصادفی دو سه نویسه‌ای)
  if (shared >= Math.min(8, o.length) && shared >= o.length * 0.6) {
    // همان مقدار را روی متنِ اصلی جلو می‌رویم (نویزه‌های جامانده از نرمال‌سازی شمرده نمی‌شوند)
    let i = 0;
    let matched = 0;
    const rawA = toLatinDigits(clean.toLowerCase());
    while (i < rawA.length && matched < shared) {
      const ch = rawA[i];
      if (/[\s\u200c\u200d«»"'“”()\[\]{}؟?!.،,;:ـ\-–—•·]/.test(ch)) {
        i += 1;
        continue;
      }
      matched += 1;
      i += 1;
    }
    // برش باید رویِ مرزِ کلمه باشد؛ وگرنه برچسب وسطِ کلمه قطع می‌شود و تحلیل با
    // تکهٔ باقی‌مانده («ها: …») شروع می‌شود. آن‌وقت سراغِ تطبیقِ تقریبی پایین می‌رویم.
    const atBoundary = i >= clean.length || /^[\s).،,;:ـ\-–—]/.test(clean.slice(i));
    if (atBoundary) {
      // جداکننده‌های میانِ برچسب و تحلیل
      while (i < clean.length && /^[\s).،,;:ـ\-–—]/.test(clean.slice(i))) i += 1;
      const rest = clean.slice(i).trim();
      const label = clean.slice(0, i).replace(/[\s).،,;:ـ\-–—]+$/, "").trim();
      if (rest) return { text: rest, label: label || undefined };
    }
  }
  // تلاشِ دوم: برچسبِ ابتدای خط با گزینه «تقریباً» یکی است (غلطِ املایی جزئی در یکی
  // از دو طرف، مثل «هیدروکلورتیازید» در تحلیل و «هیدروکلروتیازید» در گزینه)
  const label = leadingLabel(clean);
  if (label && similarity(comparable(label), o) >= 0.75) {
    const rest = clean.slice(label.length).replace(/^\s*[:：]\s*/, "").trim();
    if (rest) return { text: rest, label };
  }
  return { text: clean };
}

/** بهترین گزینه‌ای که خطِ تحلیل با آن شروع می‌شود (وقتی شماره ندارد) */
function matchOptionByText(text: string, options: readonly string[]): number | null {
  const clean = stripInvisible(text);
  const a = comparable(clean);
  if (a.length < 6) return null;
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < options.length; i += 1) {
    const o = comparable(options[i] ?? "");
    if (o.length < 4) continue;
    const shared = commonPrefixLength(a, o);
    const score = shared / Math.max(1, Math.min(o.length, a.length));
    if (shared >= Math.min(10, o.length) && score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (bestScore >= 0.6) return best;
  // تلاشِ دوم با شباهتِ برچسب (برای غلط‌های املایی/ویرایشیِ جزئی در خودِ داده)
  const label = comparable(leadingLabel(clean));
  if (label.length < 4) return null;
  let fuzzy = -1;
  let fuzzyScore = 0;
  for (let i = 0; i < options.length; i += 1) {
    const o = comparable(options[i] ?? "");
    if (o.length < 4) continue;
    const s = similarity(label, o);
    if (s > fuzzyScore) {
      fuzzyScore = s;
      fuzzy = i;
    }
  }
  return fuzzyScore >= 0.75 ? fuzzy : null;
}

type BlockKind = "insight" | "tip" | "doubt" | "correct" | "wrong" | "key" | "review" | "other";

/** نشانِ شروعِ بلوک؛ `null` یعنی خطِ ادامه/بولت */
function blockKindOf(line: string): { kind: BlockKind; rest: string } | null {
  const t = stripInvisible(line);
  if (!t) return null;
  if (/^🚩/.test(t)) return { kind: "review", rest: t.replace(/^🚩\s*/, "") };
  if (/^کلید\s*[:：]/.test(t)) return { kind: "key", rest: t };
  if (/^⚠/.test(t) && /کلید/.test(t.slice(0, 60))) return { kind: "key", rest: t.replace(/^⚠+\s*/, "") };
  if (/^💡/.test(t)) return { kind: "insight", rest: t.replace(/^💡\s*/, "") };
  if (/^📌/.test(t)) return { kind: "tip", rest: t.replace(/^📌\s*/, "") };
  if (/^🔍/.test(t)) return { kind: "doubt", rest: t.replace(/^🔍\s*/, "") };
  if (/^[✔✓✅]/.test(t)) return { kind: "correct", rest: t.replace(/^[✔✓✅]\s*/, "") };
  if (/^[✖✗❌]/.test(t)) return { kind: "wrong", rest: t.replace(/^[✖✗❌]\s*/, "") };
  if (/^⚠/.test(t)) return { kind: "doubt", rest: t.replace(/^⚠+\s*/, "") };
  return null;
}

/** سربرگ‌های خالیِ «نکات کلیدی:» — ارزشِ آموزشی ندارند و نکتهٔ فلش‌کارت نمی‌شوند */
function isHeaderOnly(text: string): boolean {
  const t = stripInvisible(text).replace(/[«»"'“”]/g, "");
  return /^(نکات?\s*کلیدی|نکتهٔ?\s*کلیدی|تحلیل|توضیح|بررسی|چرا\s*کلید[^\n]{0,40})\s*[:：]?\s*$/.test(t);
}

/** «نکات کلیدی:» از ابتدای بدنهٔ 💡 جدا می‌شود تا متنِ تمیز بماند */
function stripLeadHeader(text: string): string {
  return stripInvisible(text)
    .replace(/^(نکات?\s*کلیدی|نکتهٔ?\s*کلیدی)\s*[:：]\s*/, "")
    .trim();
}

function normalizeSpace(value: string): string {
  return stripInvisible(value).replace(/\s+/g, " ").trim();
}

function pushUnique(list: string[], value: string): void {
  const v = normalizeSpace(value);
  if (v.length < MIN_POINT_LENGTH) return;
  if (list.some((x) => comparable(x) === comparable(v))) return;
  list.push(v.slice(0, MAX_POINT_LENGTH));
}

export interface ParseAnalysisOptions {
  /** گزینه‌های خودِ سؤال — برای وصل‌کردنِ تحلیل به شمارهٔ گزینه */
  options?: readonly string[];
  /** کلیدِ ذخیره‌شده؛ برای تعیینِ حکمِ تحلیل‌های بی‌نشان */
  correctIndex?: number;
  /** اگر کلید «مشکوک/نامعتبر» باشد، حکم‌ها خنثی می‌مانند تا گمراه‌کننده نباشند */
  keyUnreliable?: boolean;
}

/**
 * تجزیهٔ پاسخنامه به اجزای ساختاریافته.
 * هیچ خطی دور ریخته نمی‌شود: چیزی که دسته‌بندی نشود در `notes` می‌ماند.
 */
export function parseQuestionAnalysis(
  explanation: string | undefined | null,
  opts: ParseAnalysisOptions = {},
): QuestionAnalysis {
  const raw = String(explanation ?? "");
  const empty: QuestionAnalysis = {
    insights: [],
    tips: [],
    doubts: [],
    options: [],
    notes: [],
    keyPoints: [],
    matchedOptions: 0,
  };
  if (!raw.trim()) return empty;

  const options = opts.options ?? [];
  const out: QuestionAnalysis = { ...empty };
  const bullets: string[] = [];
  const byIndex = new Map<number, OptionAnalysis>();
  /** خط‌های ✔/✖ که به گزینه‌ای نچسبیدند، به همان ترتیبِ پاسخنامه */
  const pending: { verdict: OptionVerdict; rest: string }[] = [];
  // یک‌بار برای کلِ پاسخنامه: بولت‌های شماره‌دار دنبالهٔ گزینه‌ها هستند؟
  const numberedSeries = hasNumberedOptionSeries(raw);
  /** آخرین گزینه‌ای که تحلیلش شروع شده — خط‌های ادامه به آن می‌چسبند */
  let lastIndex: number | null = null;

  const addOption = (index: number, verdict: OptionVerdict, text: string, label?: string) => {
    const body = normalizeSpace(text);
    if (index < 0 || index > 3 || !body) return;
    const existing = byIndex.get(index);
    if (existing) {
      existing.text = `${existing.text} ${body}`.slice(0, MAX_POINT_LENGTH * 2);
      if (existing.verdict === "neutral" && verdict !== "neutral") existing.verdict = verdict;
      if (label && !existing.label) existing.label = label;
      lastIndex = index;
      return;
    }
    const row: OptionAnalysis = { index, verdict, text: body.slice(0, MAX_POINT_LENGTH * 2) };
    if (label && comparable(label) !== comparable(options[index] ?? "")) row.label = label;
    byIndex.set(index, row);
    out.matchedOptions += 1;
    lastIndex = index;
  };

  let current: BlockKind = "other";
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = stripInvisible(line);
    if (!trimmed) continue;
    const head = blockKindOf(trimmed);

    // ————————— خطِ نشان‌دار: شروعِ یک بلوک تازه
    if (head) {
      current = head.kind;
      const rest = stripInvisible(head.rest);
      switch (head.kind) {
        case "key": {
          out.keyLine = out.keyLine ? `${out.keyLine} ${rest}` : rest;
          const idx = optionIndexIn(rest.replace(/^کلید\s*[:：]\s*/, ""));
          if (idx != null && out.keyIndex == null) out.keyIndex = idx;
          continue;
        }
        case "review": {
          const body = rest.replace(/^یادداشتِ\s*بازبینی\s*[:：]\s*/, "");
          out.reviewNote = out.reviewNote ? `${out.reviewNote} ${body}` : body;
          continue;
        }
        case "tip":
          pushUnique(out.tips, rest);
          continue;
        case "insight": {
          const body = stripLeadHeader(rest);
          if (body && !isHeaderOnly(body)) pushUnique(out.insights, body);
          continue;
        }
        case "doubt":
          if (!isHeaderOnly(rest)) pushUnique(out.doubts, rest);
          continue;
        default:
          break;
      }
      // correct / wrong
      const verdict: OptionVerdict = head.kind === "correct" ? "correct" : "wrong";
      const idx = optionIndexIn(rest);
      const withoutNumber = dropLeadingNumber(rest);
      if (idx != null) {
        const { text, label } = splitOptionLabel(withoutNumber, options[idx]);
        addOption(idx, verdict, text || withoutNumber, label);
      } else {
        const guessed = matchOptionByText(rest, options);
        if (guessed != null) {
          const { text, label } = splitOptionLabel(rest, options[guessed]);
          addOption(guessed, verdict, text || rest, label);
        } else {
          // تحلیلِ درست/غلط بدونِ گزینهٔ قابلِ تطبیق (مثلاً برچسبِ فارسی‌نویس برای
          // گزینهٔ لاتین: «✔ نزیریتاید» روی گزینهٔ «Nesiritide»). فعلاً نگهشان
          // می‌داریم تا بعد از پایانِ حلقه با ترتیبِ خطوط به گزینه‌ها وصلشان کنیم؛
          // اگر آن هم نشد، به بدنهٔ پاسخنامه برمی‌گردند.
          pending.push({ verdict, rest });
          lastIndex = null;
        }
      }
      continue;
    }

    // ————————— خطِ بدونِ نشان: بولت یا ادامهٔ بلوکِ قبلی
    const isBullet = BULLET.test(trimmed) || NUMBERED_BULLET.test(trimmed);
    const body = normalizeSpace(trimmed.replace(BULLET, ""));

    // بولتِ گزینه‌محور حتی داخلِ بلوکِ 💡 یک تحلیلِ گزینه است، نه نکتهٔ آموزشی.
    // دو شکل دارد: با دونقطه («• گزینهٔ ۱ (…): …»، «• ۱ MIBG Scan: …») و بدونِ
    // دونقطه ولی با خودِ متنِ گزینه در ادامه («• ۳ ترومبوز بدون ریسک‌فاکتور نیز …»).
    if (isBullet) {
      const idx = optionIndexIn(body);
      if (idx != null) {
        const withoutNumber = dropLeadingNumber(body);
        const coloned = /[:：]/.test(body.slice(0, 90));
        // داخلِ دنبالهٔ شماره‌دار، خودِ شماره کافی است (متنِ گزینه بازنویسی شده)
        const inSeries = numberedSeries && leadingOptionNumber(body) != null;
        if (coloned || inSeries || startsWithOption(withoutNumber, options[idx])) {
          const { text, label } = splitOptionLabel(withoutNumber, options[idx]);
          const verdict: OptionVerdict = opts.keyUnreliable ? "neutral" : idx === opts.correctIndex ? "correct" : "wrong";
          addOption(idx, verdict, text || body, label);
          continue;
        }
      }
    }

    switch (current) {
      case "insight":
      case "doubt": {
        const target = current === "insight" ? out.insights : out.doubts;
        if (isBullet) {
          const bulletText = normalizeSpace(body.replace(NUMBERED_BULLET, ""));
          if (bulletText && !isHeaderOnly(bulletText)) pushUnique(bullets, bulletText);
        } else if (body && !isHeaderOnly(body)) {
          pushUnique(target, body);
        }
        continue;
      }
      case "tip": {
        const text = isBullet ? normalizeSpace(body.replace(NUMBERED_BULLET, "")) : body;
        if (text && !isHeaderOnly(text)) pushUnique(out.tips, text);
        continue;
      }
      case "key":
        out.keyLine = out.keyLine ? `${out.keyLine} ${body}` : body;
        continue;
      case "review":
        out.reviewNote = out.reviewNote ? `${out.reviewNote} ${body}` : body;
        continue;
      case "correct":
      case "wrong": {
        // ادامهٔ تحلیلِ آخرین گزینهٔ دیده‌شده
        if (lastIndex != null && body) {
          const last = byIndex.get(lastIndex);
          if (last) {
            last.text = `${last.text} ${body}`.slice(0, MAX_POINT_LENGTH * 2);
            continue;
          }
        }
        pushUnique(out.notes, body);
        continue;
      }
      default:
        pushUnique(out.notes, body);
        continue;
    }
  }

  // ————— وصل‌کردنِ ✔/✖های بی‌نشانه با ترتیبِ خطوط
  // پاسخنامه‌ها گزینه‌ها را به‌ترتیب ۱..۴ بحث می‌کنند، پس:
  //   • تنها خطِ ✔ (اگر هست) به خودِ کلیدِ ذخیره‌شده می‌چسبد — این لنگر، قطعی است؛
  //   • خط‌های ✖ فقط وقتی وصل می‌شوند که جای خالیِ باقی‌مانده دقیقاً به تعدادشان
  //     باشد (وگرنه جای درستشان معلوم نیست و در بدنهٔ پاسخنامه می‌مانند).
  if (pending.length > 0) {
    const keyAt = opts.correctIndex ?? null;
    const okLine = pending.find((p) => p.verdict === "correct");
    const freeOf = (skip: number | null) => [0, 1, 2, 3].filter((i) => !byIndex.has(i) && i !== skip);
    let anchored: number | null = null;
    if (okLine && keyAt != null && !byIndex.has(keyAt) && pending.filter((p) => p.verdict === "correct").length === 1) {
      anchored = keyAt;
    }
    const wrongLines = pending.filter((p) => p.verdict !== "correct");
    const free = freeOf(anchored);
    const placeable = anchored != null || wrongLines.length === free.length;
    if (placeable) {
      if (anchored != null && okLine) {
        const { text, label } = splitOptionLabel(okLine.rest, options[anchored]);
        addOption(anchored, opts.keyUnreliable ? "neutral" : "correct", text || okLine.rest, label);
      }
      const rest = anchored != null ? wrongLines : pending;
      const slots = [0, 1, 2, 3].filter((i) => !byIndex.has(i));
      if (rest.length === slots.length) {
        rest.forEach((p, k) => {
          const index = slots[k];
          const { text, label } = splitOptionLabel(p.rest, options[index]);
          addOption(index, opts.keyUnreliable ? "neutral" : p.verdict === "correct" ? "correct" : "wrong", text || p.rest, label);
        });
      } else {
        for (const p of rest) pushUnique(out.notes, `${p.verdict === "correct" ? "✔" : "✖"} ${normalizeSpace(p.rest)}`);
      }
      pending.length = 0;
    } else {
      for (const p of pending) pushUnique(out.notes, `${p.verdict === "correct" ? "✔" : "✖"} ${normalizeSpace(p.rest)}`);
      pending.length = 0;
    }
  }

  out.options = [0, 1, 2, 3].map((i) => byIndex.get(i)).filter((x): x is OptionAnalysis => !!x && x.text.length > 0);

  // نکته‌های آموزشی = بدنهٔ تحلیلِ آموزشی (💡) + بولت‌های آن + نکتهٔ آزمونی (📌).
  // تحلیلِ «چرا این گزینه درست/بقیه غلط» عمداً این‌جا نمی‌آید: آن بخش در ردیفِ خودِ
  // هر گزینه نمایش داده می‌شود و نکاتِ فلش‌کارت باید مستقل از سؤال معنی بدهند.
  const points: string[] = [];
  for (const ins of out.insights) pushUnique(points, ins);
  for (const b of bullets) pushUnique(points, b);
  for (const t of out.tips) pushUnique(points, t);
  // هیچ سؤالی نباید بدونِ کاندیدای فلش‌کارت بماند
  if (points.length === 0) for (const d of out.doubts) pushUnique(points, d);
  if (points.length === 0) for (const n of out.notes) pushUnique(points, n);
  out.keyPoints = points.slice(0, MAX_KEY_POINTS);
  return out;
}

/**
 * پاسخنامهٔ خوانا برای جاهایی که ساختار لازم نیست (خروجی Anki، پشتِ فلش‌کارت،
 * اشتراک‌گذاری). تحلیلِ گزینه‌ها زیرِ خودشان می‌آید، نه چسبیده به هم.
 */
export function renderAnalysisText(analysis: QuestionAnalysis, options?: readonly string[]): string {
  const lines: string[] = [];
  if (analysis.keyLine) lines.push(analysis.keyLine);
  for (const i of analysis.insights) lines.push(`💡 ${i}`);
  for (const o of analysis.options) {
    const label = options?.[o.index] ?? o.label ?? "";
    const mark = o.verdict === "correct" ? "✔" : o.verdict === "wrong" ? "✖" : "•";
    lines.push(`${mark} ${label ? `${label}: ` : ""}${o.text}`);
  }
  for (const d of analysis.doubts) lines.push(`🔍 ${d}`);
  for (const t of analysis.tips) lines.push(`📌 ${t}`);
  if (analysis.reviewNote) lines.push(`🚩 ${analysis.reviewNote}`);
  for (const n of analysis.notes) lines.push(n);
  return lines.join("\n").trim();
}

/** آیا این پاسخنامه اصلاً ساختارِ نشان‌دار دارد؟ (متنِ ساده → همان یک‌جا نمایش داده می‌شود) */
export function hasStructuredAnalysis(analysis: QuestionAnalysis): boolean {
  return Boolean(
    analysis.keyLine ||
      analysis.insights.length ||
      analysis.tips.length ||
      analysis.options.length ||
      analysis.doubts.length ||
      analysis.reviewNote,
  );
}

/** کلیدِ پایدارِ یک نکتهٔ آموزشی — برای جلوگیری از فلش‌کارتِ تکراری */
export function pointKey(questionId: string, point: string): string {
  const norm = comparable(point).slice(0, 160);
  let hash = 0x811c9dc5;
  for (let i = 0; i < norm.length; i += 1) {
    hash ^= norm.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `bkp:${questionId}:${hash.toString(36)}`;
}

// ---------- پلِ راحت به دادهٔ بانک ----------

/** شکلِ حداقلیِ سؤالی که این ماژول لازم دارد (بدونِ وابستگیِ سخت به نوعِ بانک) */
export interface AnalysableQuestion {
  id: string;
  options: readonly string[];
  correctIndex: number;
  explanation?: string;
  keyPoints?: string[];
  keyStatus?: "confirmed" | "doubtful" | "incorrect";
}

const analysisCache = new WeakMap<object, QuestionAnalysis>();

/**
 * تجزیهٔ پاسخنامهٔ یک سؤال، با کش.
 * سؤال‌های بانک در حافظهٔ همان نشست نگه داشته می‌شوند و هر رندر چند بار تحلیل
 * می‌خواهند (کارت سؤال، فهرست نتیجه، خروجی Anki)؛ کشِ WeakMap یعنی یک‌بار محاسبه
 * و بدونِ نگه‌داشتنِ هیچ سؤالِ رهاشده‌ای در حافظه.
 */
export function analysisForQuestion(question: AnalysableQuestion): QuestionAnalysis {
  const cached = analysisCache.get(question as object);
  if (cached) return cached;
  const analysis = parseQuestionAnalysis(question.explanation, {
    options: question.options,
    correctIndex: question.correctIndex,
    keyUnreliable: question.keyStatus === "doubtful" || question.keyStatus === "incorrect",
  });
  analysisCache.set(question as object, analysis);
  return analysis;
}

/**
 * نکته‌های آموزشیِ یک سؤال — منبعِ حقیقت برای «افزودن به فلش‌کارت».
 *
 * اولویت با «فهرستِ آمادهٔ خودِ داده» است: آن فهرست در زمانِ ساختِ بانک بازبینی و
 * ذخیره شده و هویتِ پایدار دارد (کلیدِ یکتای فلش‌کارت از همان متن ساخته می‌شود، پس
 * نکتهٔ دیروز و امروز یکی می‌مانند). بعد هر نکتهٔ «ساختاردارِ» دیگری که در پاسخنامهٔ
 * همان سؤال هست (💡/📌) و در فهرستِ اول نیامده، اضافه می‌شود تا چیزی از قلم نیفتد.
 *
 * اگر پاسخنامه ساختار ندارد (فقط متنِ ساده) و سؤال نکتهٔ آماده دارد، آن متنِ ساده را
 * به نکات اضافه نمی‌کنیم — وگرنه جمله‌های توضیحِ گزینه‌ها یک‌بار دیگر در بخشِ نکات
 * تکرار می‌شد. فقط وقتی هیچ نکتهٔ آماده‌ای نیست، همان تحلیل به‌عنوانِ آخرین راهِ چاره
 * برمی‌گردد تا هیچ سؤالی بدونِ کاندیدای فلش‌کارت نماند.
 */
export function teachingPoints(question: AnalysableQuestion): string[] {
  const analysis = analysisForQuestion(question);
  const out: string[] = [];
  for (const p of question.keyPoints ?? []) if (typeof p === "string") pushUnique(out, p);
  if (hasStructuredAnalysis(analysis) || out.length === 0) {
    for (const p of analysis.keyPoints) pushUnique(out, p);
  }
  return out.slice(0, MAX_KEY_POINTS);
}

/** تحلیلِ گزینهٔ شمارهٔ `index` (اگر در پاسخنامه باشد) */
export function optionAnalysisFor(analysis: QuestionAnalysis, index: number): OptionAnalysis | undefined {
  return analysis.options.find((o) => o.index === index);
}
