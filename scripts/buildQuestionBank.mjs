#!/usr/bin/env node
// ===== 🏥 ساختِ «شارد»های بانک سؤال پره‌انترنی و دستیاری =====
//
//   npm run bank:build                 # از qbank-source/ می‌خواند، در public/qbank می‌نویسد
//   npm run bank:build -- --dry-run    # فقط اعتبارسنجی و گزارش
//   npm run bank:build -- --source=path/to/file.json --out=public/qbank
//
// ورودی: یک یا چند فایل در `qbank-source/` با پسوند `.json` یا `.csv`
//
//   JSON : آرایه‌ای از سؤال‌ها یا { "questions": [...] }
//   JSONL: هر خط یک سؤال (خروجیِ «reviewed_all_export» هم مستقیماً همین‌جا خوانده می‌شود:
//          فیلدهای uid/exam/course/topic/year/text/options/correct/flashcard/references)
//   CSV : ستون‌های
//         id,examType,year,subject,topicId,topicTitle,stem,option1,option2,option3,option4,correctIndex,explanation,keyPoints,sourceRef
//         (correctIndex می‌تواند ۰..۳ یا ۱..۴ باشد؛ اگر همهٔ ردیف‌ها ۱..۴ باشند خودکار
//          یک واحد کم می‌شود. keyPoints با «|» جدا می‌شود.)
//
// خروجی:
//   public/qbank/manifest.json                 ← سبک؛ فقط در ورود به بخش دانلود می‌شود
//   public/qbank/topics/<topicId>.json         ← فقط با انتخاب همان مبحث دانلود می‌شود
//
// چرا فایل‌های ایستا؟ GitHub Pages/هر هاست ساده کافی است، بدون سرور و دیتابیس؛
// اپ فقط مانیفست + شاردِ مبحثِ انتخابی را می‌گیرد و هیچ‌چیز را روی گوشی ذخیره نمی‌کند.
// همین اسکریپت برای بانک ۱۰ تا ۱۵ هزار سؤالی هم در چند ثانیه اجرا می‌شود.

import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const MIN_YEAR = 1390;
export const MAX_YEAR = 1500;
export const EXAM_TYPES = ["pre_internship", "residency"];

/**
 * نویزه‌های نامرئیِ قالب‌بندی (نشانهٔ واریانتِ ایموجی، علامت‌های جهتِ متن، BOM).
 * در دادهٔ بانک واقعاً هستند و دیده نمی‌شوند؛ اگر بمانند دو متنِ «یکسان» متفاوت
 * مقایسه می‌شوند — هم در تشخیصِ سؤالِ تکراری، هم در کلیدِ یکتای فلش‌کارت.
 * قاعده‌اش باید با `src/lib/examAnalysis.ts` و `src/lib/examBank.ts` یکی بماند.
 */
const INVISIBLE = /[\uFE0F\uFEFF\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

const clean = (v, max) => (typeof v === "string" ? v.replace(INVISIBLE, "").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** برشِ امن در سقفِ طول — جفتِ جای‌نشین (ایموجی) نصف نمی‌شود */
function sliceSafe(text, max) {
  if (text.length <= max) return text;
  let end = max;
  const code = text.charCodeAt(end - 1);
  // اگر برش وسطِ یک جفتِ جای‌نشین بیفتد، یک نویسه عقب‌تر می‌بریم
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  return text.slice(0, end);
}

/**
 * پاک‌سازیِ متنِ «چندخطی» با نگه‌داشتنِ ساختارِ خط‌ها.
 *
 * چرا جدا از `clean`؟ پاسخنامهٔ هر سؤال خط‌به‌خط با نشان‌ها نوشته شده
 * (کلید: / 💡 / ✔ / ✖ / 📌 / 🔍 / 🚩) و `src/lib/examAnalysis.ts` همان خط‌ها را
 * تجزیه می‌کند تا تحلیلِ هر گزینه زیرِ ردیفِ خودش و نکته‌های آموزشی در بخشِ خودش
 * بنشیند. اگر خط‌ها را در یک خط ادغام کنیم، دیگر هیچ گزینه‌ای تحلیلِ خودش را نمی‌گیرد
 * و کلِ پاسخنامه یک تکهٔ به‌هم‌چسبیده می‌شود.
 *
 * کاری که می‌کند: یکسان‌سازیِ پایانِ خط، ادغامِ فاصله/تبِ اضافه در هر خط، حذفِ
 * خط‌های خالیِ اول و آخر (و یکی‌کردنِ خط‌های خالیِ پشتِ سرِ هم)، و برش در سقفِ طول
 * رویِ مرزِ خط — تا آخرین خط نصفه ذخیره نشود.
 */
export function cleanMultiline(v, max) {
  if (typeof v !== "string") return "";
  const lines = [];
  for (const line of v.replace(/\r\n?/g, "\n").split("\n")) {
    const text = line.replace(INVISIBLE, "").replace(/[ \t\u00a0]+/g, " ").trim();
    if (!text) {
      // حداکثر یک خطِ خالی، آن هم نه در ابتدا
      if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
      continue;
    }
    lines.push(text);
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  let total = lines.reduce((sum, l) => sum + l.length, 0) + Math.max(0, lines.length - 1);
  if (total <= max) return lines.join("\n");
  const kept = [];
  for (const line of lines) {
    const cost = line.length + (kept.length > 0 ? 1 : 0);
    if (total - cost < 0) break;
    kept.push(line);
    total -= cost;
    if (total <= max) break;
  }
  // اگر حتی خطِ اول هم از سقف بزرگ‌تر بود، همان یک خط برش می‌خورد
  if (kept.length === 0) return sliceSafe(lines[0] ?? "", max);
  const joined = kept.join("\n");
  return joined.length > max ? sliceSafe(joined, max) : joined;
}

// —— سقف‌های مشترک با `src/lib/examAnalysis.ts` و `src/lib/examBank.ts` ——
// اگر این عددها با سمتِ اپ یکی نباشند، سؤال‌هایی که در ساخت «سالم» بوده‌اند در
// لحظهٔ بارگذاری رد می‌شوند (حذفِ بی‌صدا). هر تغییر باید در هر سه جا انجام شود.
/** کمترین طولِ یک نکتهٔ آموزشیِ معنادار */
export const MIN_POINT = 8;
/** بیشترین طولِ یک نکتهٔ آموزشی */
export const MAX_POINT = 400;
/** سقفِ نکته‌های هر سؤال */
export const MAX_POINTS = 12;
/** بیشترین طولِ پاسخنامه — طولانی‌ترین پاسخنامهٔ واقعیِ بانک ~۱۰٬۰۰۰ نویسه است */
export const MAX_EXPLANATION = 12_000;
/** بیشترین طولِ صورت سؤال و هر گزینه */
export const MAX_STEM = 1600;
export const MAX_OPTION = 400;

/** همان قاعدهٔ سالم‌سازیِ src/lib/examBank.ts — این‌جا برای اجرای بدون بیلد */

// ---------- قالبِ «خروجیِ بازبینی‌شده» (JSONL بانک آزمون) ----------
// این قالب ستون‌های فارسی دارد (exam/course/topic/year/…). آفستِ «correct» صفرپایه است،
// سال به‌شکل «خرداد 1402» می‌آید و پاسخنامه در فیلدِ «flashcard» است. این‌جا همان
// چیزهایی که اپ لازم دارد استخراج می‌شود تا سؤال‌ها بدونِ دست‌کاریِ داده اضافه شوند.

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function latinDigits(value) {
  return String(value ?? "").replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)));
}

/** سالِ شمسی از «خرداد 1402» / «۱۴۰۲» / متن دلخواه — یا null */
export function jalaliYear(value) {
  const text = latinDigits(value);
  for (const match of text.matchAll(/\d{4}/g)) {
    const year = Number(match[0]);
    if (year >= MIN_YEAR && year <= MAX_YEAR) return year;
  }
  return null;
}

/** هشِ کوتاهِ پایدار (FNV-1a) — هم برای شناسهٔ مبحث، هم نسخهٔ محتوا */
export function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(7, "0");
}

/** شناسهٔ پایدارِ مبحث از «درس + عنوان مبحث» (با تغییرِ ترتیبِ فایل‌ها تغییر نمی‌کند) */
export function topicIdFor(subject, topicTitle) {
  return `tp-${fnv1a(`${clean(subject, 80)}||${clean(topicTitle, 120)}`)}`;
}

/** نرمال‌سازی برای مقایسهٔ «آیا این متن با همان گزینه شروع می‌شود» */
const normForMatch = (value) =>
  latinDigits(String(value ?? "").toLowerCase())
    .replace(INVISIBLE, "")
    .replace(/[\u200c\u200d]/g, "")
    .replace(/[«»"'“”()\[\]{}؟?!.،,;:ـ\-–—•·\s]/g, "");

/**
 * آیا `text` با خودِ `option` شروع می‌شود؟ همان قاعدهٔ `splitOptionLabel` در
 * `src/lib/examAnalysis.ts` — هم‌پوشانی باید عملاً کلِ برچسبِ گزینه باشد.
 */
export function startsWithOptionText(text, option) {
  const a = normForMatch(text);
  const o = normForMatch(option);
  if (o.length < 4 || a.length < 4) return false;
  let shared = 0;
  while (shared < Math.min(a.length, o.length) && a[shared] === o[shared]) shared += 1;
  return shared >= Math.min(8, o.length) && shared >= o.length * 0.6;
}

/** رقمِ اولِ متن به‌شمارهٔ گزینه (۱..۴) — یا null. رقمِ عربی (٠-٩) هم خوانده می‌شود */
export function leadingOptionNumber(body) {
  const ch = String(body ?? "").trim()[0] ?? "";
  const n = Number(latinDigits(ch));
  return Number.isFinite(n) && n >= 1 && n <= 4 ? n : null;
}

const BULLET_LINE = /^[•·●◦‣]\s+|^[-\u2013\u2014]\s+/u;

/**
 * آیا بولت‌های این پاسخنامه یک «دنبالهٔ شماره‌دارِ گزینه‌ها» هستند؟
 *
 * در ~۲٬۱۰۰ سؤالی که کلیدشان مشکوک/نامعتبر است، تحلیلِ گزینه‌ها به‌جای «✔/✖» با
 * «• ۱ … • ۲ … • ۳ … • ۴ …» نوشته شده و گاهی متنِ گزینه را تکرار نمی‌کند بلکه
 * بازنویسی‌اش می‌کند («۴ HIT دورهٔ حاد دارد…» برای گزینهٔ «ترومبوسیتوپنی ناشی از
 * هپارین»). تطبیقِ متن در این حالت جواب نمی‌دهد، پس از خودِ دنباله کمک می‌گیریم:
 * اگر دستِ‌کم ۳ شمارهٔ متفاوت از ۱..۴ سرِ بولت‌ها آمده باشد، همهٔ بولت‌های شماره‌دار
 * تحلیلِ گزینه‌اند. آستانهٔ ۳ عمداً محافظه‌کار است: فهرستِ نکتهٔ شماره‌دارِ واقعی
 * (۱ یا ۲ مورد) دست‌نخورده می‌ماند.
 */
export function hasNumberedOptionSeries(text) {
  const digits = new Set();
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const trimmed = line.trim().replace(/\uFE0F/g, "");
    if (!BULLET_LINE.test(trimmed)) continue;
    const body = trimmed.replace(BULLET_LINE, "").trim();
    const n = leadingOptionNumber(body);
    if (n == null) continue;
    if (!/^[\s).،,:ـ]/.test(body.slice(1))) continue;
    digits.add(n);
  }
  return digits.size >= 3;
}

const OPTION_WORD_LEAD = /^(?:گزینه|گزينه|پاسخ|بند)\s*[ٔهً]?\s*[0-9۰-۹٠-٩]/u;
const DIGIT_LEAD = /^\s*[0-9۰-۹٠-٩]\s*[).،,:ـ]?\s+/u;

/**
 * آیا این بولت «تحلیلِ یک گزینه» است (نه نکتهٔ آموزشیِ مستقل)؟
 *
 * سه شکلِ رایج در دادهٔ بانک:
 *   ۱) «• گزینهٔ ۱ (MIBG Scan): اسکن MIBG …»            → دونقطه دارد
 *   ۲) «• ۱ MIBG Scan: اسکن MIBG …»                      → شمارهٔ خالی + دونقطه
 *   ۳) «• ۱ در بدخیمی متاستاتیک معمولاً ضدانعقاد …»       → شماره + خودِ متنِ گزینه، بی‌دونقطه
 * هر سه در اپ زیرِ ردیفِ همان گزینه نمایش داده می‌شوند. اگر این‌جا به‌عنوان نکتهٔ
 * آموزشی ذخیره شوند، دو اتفاقِ بد می‌افتد: متن یک‌بار دیگر در بخشِ نکات تکرار می‌شود
 * و فلش‌کارتِ بی‌معنی («📌 ۱ MIBG Scan: …») ساخته می‌شود که بیرون از آن سؤال مفهوم ندارد.
 */
export function isOptionBullet(body, options = [], series = false) {
  const text = String(body ?? "").trim();
  const n = leadingOptionNumber(text);
  const worded = OPTION_WORD_LEAD.test(text);
  if (n == null && !worded) return false;
  // بولتِ شماره‌دار داخلِ یک دنبالهٔ کاملِ گزینه‌ها، حتی بدونِ دونقطه و بدونِ
  // تکرارِ متنِ گزینه، تحلیلِ همان گزینه است
  if (series && n != null && /^[\s).،,:ـ]/.test(text.slice(1))) return true;
  const index = worded ? Number(latinDigits(text.match(OPTION_WORD_LEAD)?.[0] ?? "").replace(/\D/g, "")) : n;
  if (/[:：]/.test(text.slice(0, 90))) return true;
  // بی‌دونقطه: فقط وقتی که ادامهٔ متن با خودِ گزینه شروع شود (وگرنه نکتهٔ شماره‌دار است)
  const option = options[index - 1];
  if (!option) return false;
  const rest = text
    .replace(OPTION_WORD_LEAD, "")
    .replace(/^\s*[0-9۰-۹٠-٩]\s*[).،,:ـ]?\s*/u, "")
    .replace(/^\s*\([^)]*\)\s*/u, "")
    .replace(/^\s*[:：]\s*/u, "");
  return startsWithOptionText(rest, option);
}

/**
 * نکته‌های آموزشیِ قابل‌تبدیل به فلش‌کارت از پاسخنامه.
 *
 * قانونِ مشترک با `src/lib/examAnalysis.ts` (تجزیهٔ سمتِ اپ):
 *   – بدنهٔ «💡» (تحلیلِ آموزشی) بدونِ سربرگِ «نکات کلیدی:»
 *   – بولت‌های «•» زیرِ 💡/🔍 که تحلیلِ یک گزینهٔ مشخص نباشند
 *   – نکتهٔ آزمونیِ «📌»
 * تحلیلِ «✔/✖» و بولت‌های گزینه‌محور عمداً این‌جا نمی‌آیند: آن متن به خودِ گزینه
 * وابسته است و در اپ زیرِ ردیفِ همان گزینه نمایش داده می‌شود، نه به‌عنوان یک نکتهٔ
 * مستقل. `options` برای تشخیصِ شکلِ سوم (شماره + متنِ گزینه، بدونِ دونقطه) لازم است.
 */
export function keyPointsFrom(text, options = []) {
  const insights = [];
  const bullets = [];
  const tips = [];
  // یک‌بار برای کلِ پاسخنامه: آیا بولت‌های شماره‌دار دنبالهٔ گزینه‌ها هستند؟
  const series = hasNumberedOptionSeries(text);
  let current = "other";
  for (const line of String(text ?? "").split(/\r?\n/)) {
    // پرچمِ u لازم است: 💡 و ✅ دو واحدِ کد هستند و بدون آن، فقط نیمهٔ اول حذف می‌شد
    const trimmed = line.trim().replace(/\uFE0F/g, "");
    if (!trimmed) continue;
    if (/^🚩/u.test(trimmed)) {
      current = "other";
      continue;
    }
    if (/^💡/u.test(trimmed)) {
      current = "insight";
      const body = trimmed
        .replace(/^💡\s*/u, "")
        .replace(/^(نکات?\s*کلیدی|نکتهٔ?\s*کلیدی)\s*[:：]\s*/, "")
        .trim();
      if (body.length >= MIN_POINT) insights.push(clean(body, MAX_POINT));
      continue;
    }
    if (/^📌/u.test(trimmed)) {
      current = "tip";
      const body = trimmed.replace(/^📌\s*/u, "").trim();
      if (body.length >= MIN_POINT) tips.push(clean(body, MAX_POINT));
      continue;
    }
    if (/^🔍/u.test(trimmed)) {
      current = "doubt";
      continue;
    }
    if (/^[✔✓✅✖✗❌کلید⚠]/u.test(trimmed)) {
      current = "other";
      continue;
    }
    const bullet = /^[•·●◦‣]\s+|^[-\u2013\u2014]\s+/u.test(trimmed);
    if (!bullet) continue;
    const body = trimmed.replace(/^[•·●◦‣]\s+|^[-\u2013\u2014]\s+/u, "").trim();
    if (body.length < MIN_POINT) continue;
    // بولتِ گزینه‌محور («گزینهٔ ۱ (…): …»، «۱ MIBG Scan: …»، «۱ در بدخیمی …»)
    // تحلیلِ همان گزینه است و زیرِ ردیفِ خودش نمایش داده می‌شود، نه در بخشِ نکات
    if (isOptionBullet(body, options, series)) continue;
    if (current === "insight" || current === "doubt") bullets.push(clean(body, MAX_POINT));
    else if (current === "tip") tips.push(clean(body, MAX_POINT));
  }
  const out = [];
  for (const value of [...insights, ...bullets, ...tips]) {
    if (!out.includes(value)) out.push(value);
  }
  return out.slice(0, MAX_POINTS);
}

/** یک ردیف از خروجیِ JSONL → همان ساختارِ داخلی (یا null با دلیل در `rejectExportRow`) */
export function normalizeExportRow(raw) {
  const uid = clean(raw.uid, 80);
  if (!uid) return null;
  const exam = clean(raw.exam, 80);
  const examType = exam.includes("دستیاری") ? "residency" : "pre_internship";
  const year = jalaliYear(raw.year);
  if (!year) return null;
  const course = clean(raw.course, 80);
  // «کورس قلب» و «دستیاری قلب» یک درس‌اند تا سؤال‌های دو آزمون کنارِ هم بیایند
  const subject = course.replace(/^(کورس|دستیاری|دستیای)\s+/, "").trim() || "عمومی";
  const topicTitle = clean(raw.topic, 120) || subject;
  // صورتِ سؤال هم می‌تواند چندخطی باشد (شرحِ حال + پرسش) — ساختارِ خط نگه داشته می‌شود
  const stem = cleanMultiline(raw.text, MAX_STEM);
  if (stem.length < 8) return null;
  // گزینه‌ها عمداً تک‌خطی می‌مانند: هر گزینه یک ردیفِ مستقل در UI است
  const options = Array.isArray(raw.options) ? raw.options.map((o) => clean(o, MAX_OPTION)) : [];
  // فقط ساختارِ غیرقابل‌استفاده رد می‌شود؛ گزینهٔ تکراری «حذف» نمی‌شود، فقط هشدار می‌گیرد
  if (options.length !== 4 || options.some((o) => !o)) return null;
  const correctIndex = Number.parseInt(latinDigits(raw.correct), 10);
  if (![0, 1, 2, 3].includes(correctIndex)) return null;
  // یادداشتِ بازبینی (key_note) توضیح می‌دهد چرا کلیدِ ذخیره‌شده مشکوک/نادرست است؛
  // دور ریخته نمی‌شود تا کاربر در صفحهٔ پاسخ، دلیلِ هشدار را ببیند.
  const reviewNote = clean(raw.key_note, 1200);
  const explanation = [cleanMultiline(raw.flashcard, MAX_EXPLANATION), reviewNote ? `🚩 یادداشتِ بازبینی: ${reviewNote}` : ""]
    .filter(Boolean)
    .join("\n");
  const keyPoints = keyPointsFrom(raw.flashcard, options);
  const references = Array.isArray(raw.references) ? raw.references.map((r) => clean(r, 160)).filter(Boolean) : [];
  return {
    id: uid,
    examType,
    year,
    subject,
    topicId: topicIdFor(subject, topicTitle),
    topicTitle,
    stem,
    options,
    correctIndex,
    explanation,
    ...(keyPoints.length > 0 ? { keyPoints } : {}),
    difficulty: 2,
    ...(references.length > 0 ? { sourceRef: references.slice(0, 2).join(" · ").slice(0, 300) } : {}),
    // کلیدِ «مشکوک/نامعتبر» هم وارد بانک می‌شود (هیچ سؤالی حذف نمی‌شود)؛ اپ با برچسب
    // ⚠️/🚫 نشانش می‌دهد و در حالتِ آزمونی به‌طور پیش‌فرض کنارش می‌گذارد.
    keyStatus:
      raw.key_status === "doubtful" ? "doubtful" : raw.key_status === "incorrect" ? "incorrect" : "confirmed",
  };
}

/** ردیفِ خروجیِ بازبینی‌شده است؟ */
export function isExportRow(raw) {
  return !!raw && typeof raw === "object" && typeof raw.uid === "string" && typeof raw.flashcard === "string";
}

export function normalizeRow(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (isExportRow(raw)) return normalizeExportRow(raw);
  const id = clean(raw.id, 80);
  if (!id) return null;
  if (!EXAM_TYPES.includes(raw.examType)) return null;
  const year = Number.parseInt(String(raw.year ?? "").replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)), 10);
  if (!Number.isFinite(year) || year < MIN_YEAR || year > MAX_YEAR) return null;
  const stem = cleanMultiline(raw.stem ?? raw.question, MAX_STEM);
  if (stem.length < 8) return null;
  const rawOptions = Array.isArray(raw.options)
    ? raw.options
    : [raw.option1, raw.option2, raw.option3, raw.option4];
  if (!Array.isArray(rawOptions) || rawOptions.length !== 4) return null;
  const options = rawOptions.map((o) => clean(o, MAX_OPTION));
  if (options.some((o) => !o)) return null;
  const correctIndex = Number.parseInt(String(raw.correctIndex ?? "").replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)), 10);
  if (![0, 1, 2, 3].includes(correctIndex)) return null;
  const subject = clean(raw.subject, 80) || "عمومی";
  const topicTitle = clean(raw.topicTitle ?? raw.topic, 120) || subject;
  const topicId = clean(raw.topicId, 80) || slugify(topicTitle);
  const rawPoints = Array.isArray(raw.keyPoints)
    ? raw.keyPoints.map((p) => clean(p, MAX_POINT))
    : typeof raw.keyPoints === "string"
      ? raw.keyPoints.split("|").map((p) => clean(p, MAX_POINT))
      : [];
  // همان قاعدهٔ قالبِ JSONL: بولتِ گزینه‌محور نکتهٔ آموزشی نیست
  const series = hasNumberedOptionSeries(rawPoints.join("\n"));
  const keyPoints = rawPoints
    .filter((p) => p.length >= MIN_POINT && !isOptionBullet(p, options, series))
    .slice(0, MAX_POINTS);
  return {
    id,
    examType: raw.examType,
    year,
    subject,
    topicId,
    topicTitle,
    stem,
    options,
    correctIndex,
    explanation: cleanMultiline(raw.explanation ?? raw.answerExplanation, MAX_EXPLANATION),
    ...(keyPoints.length > 0 ? { keyPoints } : {}),
    difficulty: raw.difficulty === 1 || raw.difficulty === 3 ? raw.difficulty : 2,
    ...(clean(raw.sourceRef, 160) ? { sourceRef: clean(raw.sourceRef, 160) } : {}),
  };
}

export function slugify(text) {
  const latin = clean(text, 120)
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return latin || "topic";
}

/** CSV ساده با پشتیبانی از کوتیشن و کامای داخل فیلد */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.replace(/^\uFEFF/, "").trim());
  return rows.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = cells[i] ?? "";
    });
    return obj;
  });
}

/** همهٔ ردیف‌های خام یک فایل (JSON یا CSV) */
export function readFileRows(file) {
  const text = readFileSync(file, "utf8");
  if (/\.csv$/i.test(file)) return parseCsv(text);
  if (/\.jsonl$/i.test(file)) {
    const rows = [];
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        rows.push(JSON.parse(trimmed));
      } catch {
        // خطِ خراب کلِ فایل را از کار نمی‌اندازد؛ در شمارشِ رد‌شده‌ها می‌آید
        rows.push(null);
      }
    }
    return rows;
  }
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.questions)) return parsed.questions;
  throw new Error(`${basename(file)}: ساختار JSON باید آرایه یا {questions:[...]} باشد`);
}

/**
 * ساخت مانیفست و شاردها از ردیف‌های خام.
 * خروجی: { manifest, shards: Map<topicId, questions>, stats }
 */
export function buildShards(rows, { version, sample = false, rowSources = null, existingIds = null } = {}) {
  const questions = [];
  // «رد‌شده» فقط یعنی ساختار آن‌قدر ناقص است که نمی‌شود نمایشش داد (سؤالِ بی‌متن،
  // گزینهٔ خالی، سالِ نامعتبر، شناسهٔ تکراری). هیچ سؤالی به‌خاطرِ کیفیتِ کلید یا
  // گزینهٔ تکراری حذف نمی‌شود — آن‌ها با نشان هشدار می‌آیند و هشدارهایشان ثبت می‌شود.
  const errors = [];
  const warnings = [];
  /** سؤال‌های تکراریِ محتوایی که ادغام شدند — با شناسه، برای بازبینیِ دستی */
  const duplicates = [];
  /** پذیرفته‌شده‌ها به تفکیکِ فایلِ ورودی (برای گزارشِ «چند سؤال از کدام مجموعه») */
  const bySource = new Map();
  let incorrectKey = 0;
  let doubtfulKey = 0;

  // —— گذرِ اول: سالم‌سازی و حذفِ شناسهٔ تکراری ——
  const candidates = [];
  const seen = new Set();
  rows.forEach((row, i) => {
    const source = rowSources ? rowSources[i] ?? "?" : "?";
    const q = normalizeRow(row);
    if (!q) {
      errors.push({ line: i + 1, id: row && (row.uid ?? row.id), reason: "ساختار ناقص/نامعتبر", source });
      return;
    }
    if (seen.has(q.id)) {
      errors.push({ line: i + 1, id: q.id, reason: "شناسهٔ تکراری", source });
      return;
    }
    seen.add(q.id);
    candidates.push({ q, source, line: i + 1 });
  });

  // —— گذرِ دوم: جلوگیری از سؤالِ تکراریِ محتوایی ——
  // دو ردیف با صورت و گزینه‌های یکسان، یک سؤال‌اند حتی اگر uid/سال/مبحث‌شان فرق کند
  // (در دادهٔ واقعی دیده شده). قاعدهٔ نگه‌داشتن:
  //   ۱) اگر کپی‌ای از قبل در بانکِ منتشرشده بود، همهٔ کپی‌های منتشرشده می‌مانند —
  //      شناسه‌ای که کاربر رویش نشانه/سابقهٔ پاسخ دارد هرگز بی‌صدا حذف نمی‌شود.
  //   ۲) کپی‌های تازه (از مجموعهٔ جدید) که با سؤالِ موجود یا با یکدیگر یکی‌اند،
  //      ادغام می‌شوند: فقط اولی می‌ماند.
  // پس افزودنِ مجموعهٔ جدید هیچ سؤالِ تکراری به بانک اضافه نمی‌کند و بانکِ قبلی هم
  // دست‌نخورده می‌ماند. همهٔ کپی‌های ادغام‌شده با شناسه گزارش می‌شوند.
  const groups = new Map();
  for (const item of candidates) {
    const fingerprint = fnv1a(
      `${item.q.stem.toLowerCase()}¦${item.q.options.map((o) => o.toLowerCase()).join("¦")}`,
    );
    const arr = groups.get(fingerprint);
    if (arr) arr.push(item);
    else groups.set(fingerprint, [item]);
  }
  /** تکراری‌هایی که از قبل در بانکِ منتشرشده بودند و عمداً نگه داشته شدند */
  const preExistingDuplicates = [];
  for (const group of groups.values()) {
    const published = existingIds ? group.filter((item) => existingIds.has(item.q.id)) : [];
    const keepers = published.length > 0 ? published : [group[0]];
    const keepIds = new Set(keepers.map((k) => k.q.id));
    if (published.length > 1) {
      preExistingDuplicates.push(published.map((p) => p.q.id));
    }
    for (const item of group) {
      if (keepIds.has(item.q.id)) continue;
      duplicates.push({
        keptId: keepers[0].q.id,
        droppedId: item.q.id,
        source: item.source,
        line: item.line,
        sameYear: keepers[0].q.year === item.q.year,
        sameTopic: keepers[0].q.topicId === item.q.topicId,
        sameKey: keepers[0].q.correctIndex === item.q.correctIndex,
      });
      if (!keepers.some((k) => k.q.correctIndex === item.q.correctIndex)) {
        warnings.push({
          id: item.q.id,
          reason: `تکراری با کلیدِ متفاوت (کلیدِ «${keepers[0].q.id}» نگه داشته شد؛ باید در فایل بازبینی حل شود)`,
        });
      }
    }
    for (const keeper of keepers) {
      const q = keeper.q;
      if (q.keyStatus === "doubtful") doubtfulKey += 1;
      if (q.keyStatus === "incorrect") incorrectKey += 1;
      if (new Set(q.options.map((o) => o.toLowerCase())).size !== q.options.length) {
        warnings.push({ id: q.id, reason: "گزینهٔ تکراری (نگه داشته شد؛ بهتر است در فایل بازبینی اصلاح شود)" });
      }
      questions.push(q);
      bySource.set(keeper.source, (bySource.get(keeper.source) ?? 0) + 1);
    }
  }
  const shards = new Map();
  for (const q of questions) {
    const arr = shards.get(q.topicId) ?? [];
    arr.push(q);
    shards.set(q.topicId, arr);
  }
  // مانیفست
  const topics = [];
  const byTopic = new Map();
  for (const q of questions) {
    const t = byTopic.get(q.topicId) ?? {
      topicId: q.topicId,
      subject: q.subject,
      topicTitle: q.topicTitle,
      count: 0,
      byExamType: {},
      years: [],
    };
    t.count += 1;
    if (q.keyStatus && q.keyStatus !== "confirmed") t.flagged = (t.flagged ?? 0) + 1;
    t.byExamType[q.examType] = (t.byExamType[q.examType] ?? 0) + 1;
    if (!t.years.includes(q.year)) t.years.push(q.year);
    byTopic.set(q.topicId, t);
  }
  for (const t of byTopic.values()) {
    t.years.sort((a, b) => b - a);
    topics.push(t);
  }
  topics.sort((a, b) => a.subject.localeCompare(b.subject, "fa") || a.topicTitle.localeCompare(b.topicTitle, "fa"));
  // نسخهٔ محتوا از خودِ داده می‌آید (نه ساعت): تا وقتی سؤال‌ها عوض نشده‌اند، نسخه هم
  // عوض نمی‌شود و کشِ مانیفست بی‌دلیل باطل نمی‌گردد؛ با هر تغییر، خودکار بالا می‌رود.
  const contentVersion =
    version ??
    `c${questions.length.toString(36)}-${fnv1a(
      // همهٔ متنِ مؤثر در هش می‌آید (نه فقط شناسه و طول)؛ وگرنه اصلاحِ یک گزینه یا
      // پاسخنامه نسخه را عوض نمی‌کرد و کشِ مانیفست محتوای کهنه نشان می‌داد.
      questions
        .map(
          (q) =>
            // نکته‌های آموزشی هم در هش می‌آیند: همان‌ها فلش‌کارت می‌سازند، پس تغییرشان
            // باید نسخهٔ محتوا (و در نتیجه کشِ مانیفستِ کاربر) را عوض کند.
            `${q.id}|${q.correctIndex}|${q.keyStatus ?? ""}|${q.stem}|${q.options.join("¦")}|${q.explanation}|${(q.keyPoints ?? []).join("¦")}`,
        )
        .sort()
        .join(","),
    )}`;
  const manifest = {
    version: contentVersion,
    updatedAt: new Date().toISOString(),
    shardBase: "topics",
    sample,
    topics,
  };
  return {
    manifest,
    shards,
    stats: {
      total: questions.length,
      topics: topics.length,
      subjects: new Set(questions.map((q) => q.subject)).size,
      rejected: errors.length,
      errors: errors.slice(0, 50),
      warningCount: warnings.length,
      warnings: warnings.slice(0, 50),
      /** چند ردیفِ تکراریِ محتوایی ادغام شد (همه با شناسه در `duplicates` آمده‌اند) */
      duplicateCount: duplicates.length,
      duplicates: duplicates.slice(0, 200),
      /**
       * تکراری‌هایی که از قبل در بانکِ منتشرشده بودند و عمداً حذف نشدند (تا شناسهٔ
       * نشانه‌گذاری‌ها و سابقهٔ پاسخِ کاربر از دست نرود) — فقط گزارش می‌شوند.
       */
      preExistingDuplicateGroups: preExistingDuplicates.length,
      preExistingDuplicates: preExistingDuplicates.slice(0, 200),
      /** پذیرفته‌شده‌ها به تفکیکِ فایلِ ورودی */
      bySource: Object.fromEntries([...bySource.entries()].sort()),
      byExamType: questions.reduce((acc, q) => {
        acc[q.examType] = (acc[q.examType] ?? 0) + 1;
        return acc;
      }, {}),
      years: [...new Set(questions.map((q) => q.year))].sort((a, b) => b - a),
      doubtfulKey,
      incorrectKey,
      /** چند سؤال دست‌کم یک نکتهٔ آموزشیِ قابل‌تبدیل به فلش‌کارت دارند */
      withKeyPoints: questions.filter((q) => Array.isArray(q.keyPoints) && q.keyPoints.length > 0).length,
      keyPointsTotal: questions.reduce((acc, q) => acc + (Array.isArray(q.keyPoints) ? q.keyPoints.length : 0), 0),
      withExplanation: questions.filter((q) => q.explanation && q.explanation.length > 0).length,
      averagePerTopic: topics.length ? Math.round((questions.length / topics.length) * 10) / 10 : 0,
    },
  };
}

/**
 * شناسهٔ سؤال‌هایی که در بانکِ ساخته‌شدهٔ قبلی هستند.
 *
 * چرا لازم است؟ وقتی دو ردیفِ مختلف (مثلاً از دو مجموعهٔ جدا) دقیقاً یک سؤال‌اند،
 * باید یکی نگه داشته شود. اگر کپیِ تازه را نگه داریم، شناسهٔ قبلی ناپدید می‌شود و
 * هر نشانه‌گذاری/سابقهٔ پاسخی که کاربر روی آن داشت بی‌صدا بی‌معنی می‌شود. پس میانِ
 * کپی‌ها، اول آن‌که از قبل منتشر شده بود نگه داشته می‌شود.
 */
export function existingBankIds(outDir) {
  const ids = new Set();
  const topicsDir = join(outDir, "topics");
  if (!existsSync(topicsDir)) return ids;
  for (const file of readdirSync(topicsDir)) {
    if (!/\.json(\.gz)?$/.test(file)) continue;
    try {
      const buffer = readFileSync(join(topicsDir, file));
      const text = file.endsWith(".gz") ? gunzipSync(buffer).toString("utf8") : buffer.toString("utf8");
      const payload = JSON.parse(text);
      for (const q of Array.isArray(payload) ? payload : payload.questions ?? []) {
        if (q && typeof q.id === "string") ids.add(q.id);
      }
    } catch {
      /* شاردِ خراب نباید ساختِ بانک را بشکند */
    }
  }
  return ids;
}

/** نوشتن خروجی روی دیسک */
/**
 * نوشتن خروجی روی دیسک.
 *
 * `gzip: true` ⇒ هر شارد به‌صورت `<topicId>.json.gz` (سطح ۹) و مانیفست با
 * `encoding: "gzip"` نوشته می‌شود. چرا؟ کلِ بانکِ ۱۰هزار سؤالیِ بدونِ فشرده‌سازی
 * ۳۳ مگابایت است؛ با gzip به ~۵ مگابایت می‌رسد — هم ریپو/دیپلوی سبک می‌ماند و هم
 * روی اینترنتِ موبایل، شاردِ ۱.۲ مگابایتی به ۱۸۰ کیلوبایت تبدیل می‌شود.
 * نوشتنِ فایل‌ها فقط وقتی مقدارشان عوض شده باشد انجام می‌شود تا بی‌دلیل churn نسازد.
 */
export function writeShards({ manifest, shards }, outDir, opts = {}) {
  const gzip = opts.gzip === true;
  const topicsDir = join(outDir, "topics");
  mkdirSync(topicsDir, { recursive: true });
  const manifestPath = join(outDir, "manifest.json");
  // پاک‌کردن شاردهای قدیمی تا سؤالِ حذف‌شده در نسخهٔ قبلی باقی نماند
  for (const file of readdirSync(topicsDir)) {
    if (/\.json(\.gz)?$/.test(file)) rmSync(join(topicsDir, file));
  }
  // updatedAt فقط وقتی معنا دارد که محتوا عوض شده باشد؛ وگرنه ساختِ دوباره با همان
  // داده، همان فایل را می‌دهد (بیلد تکرارپذیر).
  let updatedAt = manifest.updatedAt;
  try {
    const previous = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (previous && previous.version === manifest.version && previous.updatedAt) updatedAt = previous.updatedAt;
  } catch {
    /* مانیفست قبلی نداشتیم */
  }
  const nextManifest = { ...manifest, updatedAt, ...(gzip ? { encoding: "gzip" } : {}) };
  writeFileSync(manifestPath, JSON.stringify(nextManifest, null, gzip ? 0 : 2), "utf8");
  for (const [topicId, questions] of shards) {
    const payload = JSON.stringify({ topicId, version: manifest.version, questions });
    const name = encodeURIComponent(topicId);
    if (gzip) writeFileSync(join(topicsDir, `${name}.json.gz`), gzipSync(Buffer.from(payload, "utf8"), { level: 9 }));
    else writeFileSync(join(topicsDir, `${name}.json`), payload, "utf8");
  }
  return { manifestPath, files: shards.size, gzip, updatedAt };
}

function args() {
  const out = {};
  for (const arg of process.argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (!m) continue;
    out[m[1]] = m[2] ?? true;
  }
  return out;
}

/** فایل‌های ورودی: پوشهٔ qbank-source اگر باشد، وگرنه خروجی‌های JSONL ریشهٔ ریپو */
export function discoverSources(flags = {}) {
  if (flags.source) {
    const dir = resolve(ROOT, String(flags.source));
    if (!existsSync(dir)) return { dir, files: [] };
    return { dir, files: readdirSync(dir).filter((f) => /\.(json|csv|jsonl)$/i.test(f)).map((f) => join(dir, f)).sort() };
  }
  const dir = resolve(ROOT, "qbank-source");
  if (existsSync(dir)) {
    const files = readdirSync(dir).filter((f) => /\.(json|csv|jsonl)$/i.test(f)).map((f) => join(dir, f)).sort();
    if (files.length > 0) return { dir, files };
  }
  // خروجیِ «بازبینی‌شده» در ریشهٔ ریپو (همان فایل‌هایی که کاربر آپلود کرده)
  const rootFiles = readdirSync(ROOT)
    .filter((f) => /\.jsonl$/i.test(f))
    .map((f) => join(ROOT, f))
    .sort();
  return { dir: ROOT, files: rootFiles };
}

function newestMtime(files) {
  let newest = 0;
  for (const file of files) {
    try {
      const mtime = statSync(file).mtimeMs;
      if (mtime > newest) newest = mtime;
    } catch {
      /* ignore */
    }
  }
  return newest;
}

function main() {
  const flags = args();
  const quiet = flags.quiet === true;
  const outDir = resolve(ROOT, flags.out ?? "public/qbank");
  const { dir: sourceDir, files } = discoverSources(flags);
  if (files.length === 0) {
    if (quiet) {
      // در build/dev نباید بیلد را بشکند؛ فقط به نمونهٔ داخلی برمی‌گردیم
      console.log("ℹ️ بانک سؤال: فایل ورودی پیدا نشد؛ مجموعهٔ نمونهٔ داخلی استفاده می‌شود.");
      return;
    }
    console.error(`✖ هیچ فایل .json/.csv/.jsonl در ${sourceDir} پیدا نشد.`);
    console.error("  نمونهٔ ستون‌ها در QUESTION_BANK.md آمده است.");
    process.exitCode = 1;
    return;
  }
  const manifestPath = join(outDir, "manifest.json");
  if (flags["if-needed"] && existsSync(manifestPath)) {
    const builtAt = statSync(manifestPath).mtimeMs;
    if (builtAt >= newestMtime(files)) {
      if (!quiet) console.log("✅ بانک سؤال به‌روز است؛ ساختِ دوباره لازم نیست.");
      return;
    }
  }
  const rows = [];
  /** نامِ فایلِ مبدأ برای هر ردیف — تا در گزارش معلوم باشد هر سؤال از کدام مجموعه آمده */
  const rowSources = [];
  const perFile = [];
  for (const file of files) {
    let fileRows;
    try {
      fileRows = readFileRows(file);
    } catch (e) {
      console.error(`✖ ${basename(file)}: ${e.message}`);
      process.exitCode = 1;
      return;
    }
    perFile.push({ file: basename(file), rows: fileRows.length });
    rows.push(...fileRows);
    for (let i = 0; i < fileRows.length; i += 1) rowSources.push(basename(file));
  }
  const existingIds = existingBankIds(outDir);
  const result = buildShards(rows, {
    version: flags.version,
    sample: flags.sample === true,
    rowSources,
    existingIds,
  });
  const s = result.stats;
  const builtIds = new Set(result.shards.size ? [...result.shards.values()].flat().map((q) => q.id) : []);
  // هیچ شناسهٔ منتشرشده‌ای نباید بی‌صدا ناپدید شود؛ اگر شد، دقیقاً گزارش می‌شود
  const lostIds = [...existingIds].filter((id) => !builtIds.has(id));
  s.existingCount = existingIds.size;
  s.lostExistingIds = lostIds;
  if (existingIds.size > 0) {
    console.log(
      `   🗂 بانکِ منتشرشدهٔ قبلی: ${existingIds.size} سؤال — ${existingIds.size - lostIds.length} تا نگه داشته شد${
        lostIds.length > 0 ? `، ⚠️ ${lostIds.length} تا ادغام/حذف شد (فهرست در گزارش)` : ""
      }`,
    );
  }
  console.log(`✅ ${s.total} سؤال سالم در ${s.topics} مبحث / ${s.subjects} درس (میانگین ${s.averagePerTopic} سؤال/مبحث)`);
  console.log(`   فایل‌های ورودی: ${perFile.map((f) => `${f.file} = ${f.rows} ردیف`).join(" · ")}`);
  console.log(`   پذیرفته‌شده از هر فایل: ${JSON.stringify(s.bySource)}`);
  console.log(`   نوع آزمون: ${JSON.stringify(s.byExamType)}`);
  console.log(`   سال‌ها: ${s.years.slice(0, 8).join("، ")}${s.years.length > 8 ? " …" : ""} (${s.years.length} سال)`);
  console.log(`   پاسخنامه: ${s.withExplanation}/${s.total} · نکتهٔ آموزشی: ${s.withKeyPoints}/${s.total} سؤال، جمعاً ${s.keyPointsTotal} نکته`);
  if (s.duplicateCount > 0) {
    console.log(`   🔁 ردیفِ تکراریِ مجموعهٔ جدید ادغام شد: ${s.duplicateCount} (فهرست کامل در گزارش)`);
    if (!quiet) {
      for (const d of s.duplicates.slice(0, 10)) {
        console.log(`      - ${d.droppedId} ≡ ${d.keptId}${d.sameYear ? "" : " (سالِ متفاوت)"}${d.sameKey ? "" : " ⚠️ کلیدِ متفاوت"}`);
      }
    }
  }
  if (s.preExistingDuplicateGroups > 0) {
    console.log(
      `   🗂 ${s.preExistingDuplicateGroups} گروه تکراری از قبل در بانکِ منتشرشده بود و نگه داشته شد (تا نشانه‌ها و سابقهٔ پاسخِ کاربر نپرد)`,
    );
  }
  if (s.doubtfulKey > 0) console.log(`   ⚠️ کلیدِ مشکوک (با برچسب نمایش داده می‌شوند): ${s.doubtfulKey}`);
  if (s.incorrectKey > 0) console.log(`   🚫 کلیدِ نامعتبر در بازبینی (نگه داشته شد، در حالت آزمونی کنار می‌رود): ${s.incorrectKey}`);
  if (s.warningCount > 0) console.log(`   ⚠️ هشدارِ محتوا (سؤال حذف نشد): ${s.warningCount}`);
  if (s.rejected > 0 && !quiet) {
    console.warn(`⚠️ ${s.rejected} ردیف رد شد:`);
    for (const err of s.errors.slice(0, 20)) console.warn(`   - خط ${err.line}${err.id ? ` (${err.id})` : ""}: ${err.reason}`);
  }
  if (flags.report) {
    const reportPath = resolve(ROOT, String(flags.report));
    writeFileSync(
      reportPath,
      `${JSON.stringify(
        {
          builtAt: new Date().toISOString(),
          version: result.manifest.version,
          sources: perFile,
          ...s,
          errors: s.errors,
          warnings: s.warnings,
          duplicates: s.duplicates,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    console.log(`🧾 گزارشِ ساخت نوشته شد: ${reportPath}`);
  }
  if (flags["dry-run"]) {
    console.log("ℹ️ dry-run: هیچ فایلی نوشته نشد.");
    return;
  }
  const written = writeShards(result, outDir, { gzip: flags.gzip === true });
  const size = (() => {
    let total = 0;
    try {
      for (const file of readdirSync(join(outDir, "topics"))) total += statSync(join(outDir, "topics", file)).size;
    } catch {
      /* ignore */
    }
    return (total / (1024 * 1024)).toFixed(1);
  })();
  console.log(
    `📦 نوشته شد: ${written.manifestPath} + ${written.files} شارد مبحث در ${outDir} (نسخهٔ ${result.manifest.version}${written.gzip ? "، gzip" : ""}، ${size} مگابایت)`,
  );
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main();
