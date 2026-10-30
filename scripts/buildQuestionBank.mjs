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
import { gzipSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const MIN_YEAR = 1390;
export const MAX_YEAR = 1500;
export const EXAM_TYPES = ["pre_internship", "residency"];

const clean = (v, max) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

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

/** نکاتِ قابل‌تبدیل به فلش‌کارت از پاسخنامه (خط‌های ✔ / ✖ / 📌) */
export function keyPointsFrom(text) {
  const out = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const trimmed = line.trim().replace(/\uFE0F/g, "");
    // پرچمِ u لازم است: 💡 و ✅ دو واحدِ کد هستند و بدون آن، فقط نیمهٔ اول حذف می‌شد
    const match = /^[✔✅❌✖📌💡•\-–—]\s*(.+)$/u.exec(trimmed);
    if (!match) continue;
    const value = clean(match[1], 300);
    if (value.length >= 8) out.push(value);
  }
  return [...new Set(out)].slice(0, 8);
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
  const stem = clean(raw.text, 1600);
  if (stem.length < 8) return null;
  const options = Array.isArray(raw.options) ? raw.options.map((o) => clean(o, 400)) : [];
  if (options.length !== 4 || options.some((o) => !o)) return null;
  if (new Set(options.map((o) => o.toLowerCase())).size !== 4) return null;
  const correctIndex = Number.parseInt(latinDigits(raw.correct), 10);
  if (![0, 1, 2, 3].includes(correctIndex)) return null;
  const explanation = clean(raw.flashcard, 6000);
  const keyPoints = keyPointsFrom(raw.flashcard);
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
    // کلیدِ «مشکوک» در اپ با برچسب نشان داده می‌شود و از حالت آزمونی کنار می‌رود
    keyStatus: raw.key_status === "doubtful" ? "doubtful" : "confirmed",
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
  const stem = clean(raw.stem ?? raw.question, 1600);
  if (stem.length < 8) return null;
  const rawOptions = Array.isArray(raw.options)
    ? raw.options
    : [raw.option1, raw.option2, raw.option3, raw.option4];
  if (!Array.isArray(rawOptions) || rawOptions.length !== 4) return null;
  const options = rawOptions.map((o) => clean(o, 400));
  if (options.some((o) => !o)) return null;
  if (new Set(options.map((o) => o.toLowerCase())).size !== 4) return null;
  const correctIndex = Number.parseInt(String(raw.correctIndex ?? "").replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)), 10);
  if (![0, 1, 2, 3].includes(correctIndex)) return null;
  const subject = clean(raw.subject, 80) || "عمومی";
  const topicTitle = clean(raw.topicTitle ?? raw.topic, 120) || subject;
  const topicId = clean(raw.topicId, 80) || slugify(topicTitle);
  const keyPoints = Array.isArray(raw.keyPoints)
    ? raw.keyPoints.map((p) => clean(p, 400)).filter((p) => p.length >= 6).slice(0, 8)
    : typeof raw.keyPoints === "string"
      ? raw.keyPoints.split("|").map((p) => clean(p, 400)).filter((p) => p.length >= 6).slice(0, 8)
      : [];
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
    explanation: clean(raw.explanation ?? raw.answerExplanation, 4000),
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
export function buildShards(rows, { version, sample = false } = {}) {
  const questions = [];
  const errors = [];
  const seen = new Set();
  let incorrectKey = 0;
  let doubtfulKey = 0;
  rows.forEach((row, i) => {
    // کلیدِ «نامعتبر» (key_status=incorrect) عمداً وارد بانک نمی‌شود؛ سؤالِ آزمونی که
    // پاسخنامه‌اش غلط است، بیشتر از نبودنش ضرر دارد.
    if (row && row.key_status === "incorrect") {
      incorrectKey += 1;
      errors.push({ line: i + 1, id: row.uid ?? row.id, reason: "کلیدِ پاسخ نامعتبر (key_status=incorrect)" });
      return;
    }
    const q = normalizeRow(row);
    if (!q) {
      errors.push({ line: i + 1, id: row && (row.uid ?? row.id), reason: "ساختار ناقص/نامعتبر" });
      return;
    }
    if (seen.has(q.id)) {
      errors.push({ line: i + 1, id: q.id, reason: "شناسهٔ تکراری" });
      return;
    }
    if (q.keyStatus === "doubtful") doubtfulKey += 1;
    seen.add(q.id);
    questions.push(q);
  });
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
            `${q.id}|${q.correctIndex}|${q.keyStatus ?? ""}|${q.stem}|${q.options.join("¦")}|${q.explanation}`,
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
      rejected: errors.length,
      errors: errors.slice(0, 50),
      byExamType: questions.reduce((acc, q) => {
        acc[q.examType] = (acc[q.examType] ?? 0) + 1;
        return acc;
      }, {}),
      years: [...new Set(questions.map((q) => q.year))].sort((a, b) => b - a),
      doubtfulKey,
      incorrectKey,
      averagePerTopic: topics.length ? Math.round((questions.length / topics.length) * 10) / 10 : 0,
    },
  };
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
  for (const file of files) {
    try {
      rows.push(...readFileRows(file));
    } catch (e) {
      console.error(`✖ ${basename(file)}: ${e.message}`);
      process.exitCode = 1;
      return;
    }
  }
  const result = buildShards(rows, { version: flags.version, sample: flags.sample === true });
  console.log(`✅ ${result.stats.total} سؤال سالم در ${result.stats.topics} مبحث (میانگین ${result.stats.averagePerTopic} سؤال/مبحث)`);
  console.log(`   نوع آزمون: ${JSON.stringify(result.stats.byExamType)}`);
  console.log(`   سال‌ها: ${result.stats.years.slice(0, 8).join("، ")}${result.stats.years.length > 8 ? " …" : ""}`);
  if (result.stats.doubtfulKey > 0) console.log(`   ⚠️ کلیدِ مشکوک (با برچسب نمایش داده می‌شوند): ${result.stats.doubtfulKey}`);
  if (result.stats.incorrectKey > 0) console.log(`   ✖ کلیدِ نامعتبر (وارد بانک نشد): ${result.stats.incorrectKey}`);
  if (result.stats.rejected > 0 && !quiet) {
    console.warn(`⚠️ ${result.stats.rejected} ردیف رد شد:`);
    for (const err of result.stats.errors.slice(0, 20)) console.warn(`   - خط ${err.line}${err.id ? ` (${err.id})` : ""}: ${err.reason}`);
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
