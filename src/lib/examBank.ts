// ===== 🏥 بانک سؤال پره‌انترنی و دستیاری — لایهٔ دادهٔ آنلاین با بارگذاری تدریجی =====
//
// چرا این‌طور کار می‌کند؟
//  • بانک نهایی ۱۰ تا ۱۵ هزار سؤال است؛ نگه‌داشتنِ همه روی گوشی هم حافظه می‌خورد و هم
//    هر آپدیتِ محتوا را قفل می‌کند. پس روی هاست (فایل‌های ایستا یا هر سرورِ ساده)
//    «شارد» می‌شود: یک `manifest.json` سبک + یک فایل برای هر مبحث.
//  • ورود به بخش: فقط مانیفست (چند کیلوبایت). انتخاب مبحث: فقط همان یک شارد.
//  • هیچ‌جا شاردها در IndexedDB/localStorage ذخیره نمی‌شوند؛ فقط در حافظهٔ همان
//    نشست. خروج از آزمون/بخش، حافظهٔ موقت را پاک می‌کند. سؤال‌های تکراری در
//    یک نشست دوباره دانلود نمی‌شوند (کش درون‌حافظه‌ای + ادغام درخواست‌های هم‌زمان).
//  • عملکرد کاربر (پاسخ/نتیجه) کوچک است و جدا و ماندگار ذخیره می‌شود تا هیچ
//    دادهٔ آموزشی از دست نرود — حتی وقتی متن سؤال‌ها پاک شده است.
//  • اگر بانک آنلاین در دسترس نباشد (آفلاین/بدون تنظیم)، «مجموعهٔ نمونه»ی داخلی
//    کار می‌کند تا بخش هرگز خالی و بی‌فایده نباشد.
//
// ساختِ شاردها: `npm run bank:build` (scripts/buildQuestionBank.mjs) — ورودی CSV/JSON
// و خروجی `public/qbank/manifest.json` + `public/qbank/topics/*.json`.

import type { BankAttempt, BankExamType, BankManifest, BankQuestion, BankSessionResult, BankTopicMeta } from "../types";
import { BANK_SAMPLE_QUESTIONS } from "./examBankSeed";
import { mulberry32 } from "./random";

export const BANK_URL_KEY = "sp_qbank_url";
export const BANK_MANIFEST_STALE_MS = 6 * 60 * 60 * 1000;
export const BANK_MAX_QUESTIONS_PER_RUN = 120;
export const BANK_MIN_YEAR = 1390;
export const BANK_MAX_YEAR = 1500;

export const BANK_EXAM_LABEL: Record<BankExamType, string> = {
  pre_internship: "پره‌انترنی",
  residency: "دستیاری",
};

function envBankUrl(): string {
  try {
    return (
      (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_QUESTION_BANK_URL) || ""
    ).trim();
  } catch {
    return "";
  }
}

/** آدرس پایهٔ بانک: تنظیمِ کاربر ← متغیرِ بیلد ← پوشهٔ پیش‌فرض کنارِ اپ */
export function getBankBaseUrl(): string {
  let saved = "";
  try {
    saved = localStorage.getItem(BANK_URL_KEY) ?? "";
  } catch {
    saved = "";
  }
  const raw = (saved || envBankUrl() || "qbank").trim();
  return raw.replace(/\/+$/, "");
}

/** آیا کاربر/بیلد آدرسِ بانک را تعیین کرده؟ (اگر نه، فقط مجموعهٔ نمونه استفاده می‌شود) */
export function bankConfigured(): boolean {
  try {
    if ((localStorage.getItem(BANK_URL_KEY) ?? "").trim()) return true;
  } catch {
    /* ignore */
  }
  return envBankUrl().length > 0;
}

export function setBankBaseUrl(url: string): void {
  try {
    const clean = url.trim().replace(/\/+$/, "");
    if (clean) localStorage.setItem(BANK_URL_KEY, clean);
    else localStorage.removeItem(BANK_URL_KEY);
  } catch {
    /* ignore */
  }
}

function bankUrl(path: string): string {
  const base = getBankBaseUrl();
  if (/^https?:\/\//i.test(base)) return `${base}/${path.replace(/^\/+/, "")}`;
  // مسیر نسبی — با baseURI اپ (مثلاً /planner/) درست ترکیب می‌شود
  try {
    const origin = typeof document !== "undefined" ? document.baseURI : "http://localhost/";
    return new URL(`${base.replace(/^\.\//, "")}/${path.replace(/^\/+/, "")}`, origin).href;
  } catch {
    return `${base}/${path}`;
  }
}

/**
 * آدرسِ شاردِ یک مبحث. مانیفستِ ساخته‌شده با `--gzip` شاردها را `.json.gz` می‌دهد
 * (۳۳ مگابایت ⇒ ۵ مگابایت)؛ همان مانیفست هم می‌گوید کدام قالب است، پس فرمتِ قدیمی
 * (`<id>.json`) بدونِ تغییرِ داده هم کار می‌کند.
 */
export function questionShardUrl(topicId: string, manifest?: Pick<BankManifest, "shardBase" | "encoding"> | null): string {
  const shardBase = manifest?.shardBase || "topics";
  const suffix = manifest?.encoding === "gzip" ? ".json.gz" : ".json";
  return bankUrl(`${shardBase}/${encodeURIComponent(topicId)}${suffix}`);
}

/**
 * باز کردنِ gzip با API بومیِ مرورگر (بدونِ کتابخانه و بدونِ ساختِ رشتهٔ میانی).
 * بایت‌ها مستقیم به ورودیِ DecompressionStream نوشته می‌شوند؛ نه Blob لازم است نه
 * فایلِ موقت — روی اندروید کم‌حافظه هم امن است.
 */
async function gunzipToText(buffer: ArrayBuffer): Promise<string> {
  const Stream = (globalThis as {
    DecompressionStream?: new (format: string) => { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> };
  }).DecompressionStream;
  if (typeof Stream !== "function") throw new Error("این مرورگر gzip را پشتیبانی نمی‌کند");
  const stream = new Stream("gzip");
  const writer = stream.writable.getWriter();
  // نوشتن/بستن بدون await تا خواندنِ خروجی هم‌زمان شروع شود (جریانِ کامل)
  const writeDone = writer.write(new Uint8Array(buffer)).then(() => writer.close());
  const text = await new Response(stream.readable).text();
  await writeDone.catch(() => undefined);
  return text;
}

/** گرفتنِ JSON از بانک، با پشتیبانی از شاردهای gzip */
async function fetchBankJson<T>(url: string, encoding: "gzip" | undefined, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (encoding === "gzip") {
      const buffer = await res.arrayBuffer();
      // بعضی هاست‌ها/پروکسی‌ها فایلِ .gz را خودشان با Content-Encoding باز می‌کنند و
      // متنِ JSON تحویل می‌دهند؛ با «عدد جادوییِ» gzip (1F 8B) معلوم می‌کنیم
      // واقعاً فشرده است یا از پیش باز شده — وگرنه DecompressionStream خطا می‌داد.
      const bytes = new Uint8Array(buffer);
      const gzipped = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
      const text = gzipped ? await gunzipToText(buffer) : new TextDecoder().decode(bytes);
      return JSON.parse(text) as T;
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson<T>(url: string, timeoutMs = 12_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- سالم‌سازی و ساخت مانیفست (خالص، مشترک با اسکریپت/تست) ----------

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function isExamType(value: unknown): value is BankExamType {
  return value === "pre_internship" || value === "residency";
}

/** اعتبارسنجی/نرمال‌سازی یک سؤال خام. سؤالِ ناسالم `null` می‌شود (هیچ‌وقت نصفه نمایش داده نمی‌شود). */
export function normalizeBankQuestion(raw: unknown): BankQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = cleanText(r.id, 80);
  if (!id) return null;
  if (!isExamType(r.examType)) return null;
  const year = typeof r.year === "number" ? Math.floor(r.year) : Number.parseInt(String(r.year ?? ""), 10);
  if (!Number.isFinite(year) || year < BANK_MIN_YEAR || year > BANK_MAX_YEAR) return null;
  const stem = cleanText(r.stem ?? r.question, 1600);
  if (stem.length < 8) return null;
  if (!Array.isArray(r.options) || r.options.length !== 4) return null;
  const options = r.options.map((o) => cleanText(o, 400));
  if (options.some((o) => o.length === 0)) return null;
  if (new Set(options.map((o) => o.toLowerCase())).size !== 4) return null;
  const correctIndex = typeof r.correctIndex === "number" ? Math.floor(r.correctIndex) : Number.parseInt(String(r.correctIndex ?? ""), 10);
  if (![0, 1, 2, 3].includes(correctIndex)) return null;
  const subject = cleanText(r.subject, 80) || "عمومی";
  const topicTitle = cleanText(r.topicTitle ?? r.topic, 120) || subject;
  const topicId = cleanText(r.topicId, 80) || slugify(topicTitle);
  const explanation = cleanText(r.explanation ?? r.answerExplanation, 4000);
  const keyPoints = Array.isArray(r.keyPoints)
    ? (r.keyPoints as unknown[]).map((p) => cleanText(p, 400)).filter((p) => p.length >= 6).slice(0, 8)
    : [];
  const difficulty = r.difficulty === 1 || r.difficulty === 3 ? r.difficulty : 2;
  return {
    id,
    examType: r.examType,
    year,
    subject,
    topicId,
    topicTitle,
    stem,
    options: options as [string, string, string, string],
    correctIndex: correctIndex as 0 | 1 | 2 | 3,
    explanation,
    keyPoints: keyPoints.length > 0 ? keyPoints : undefined,
    difficulty,
    sourceRef: cleanText(r.sourceRef, 160) || undefined,
    ...(r.keyStatus === "doubtful" || r.keyStatus === "incorrect" ? { keyStatus: r.keyStatus } : {}),
  };
}

/** کلید مبحث از عنوان — برای نام‌های فارسی/لاتین یک شناسهٔ امن می‌سازد */
export function slugify(text: string): string {
  const latin = cleanText(text, 120)
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return latin || "topic";
}

/** ساخت مانیفست از سؤال‌های سالم — همان خروجیِ اسکریپت و تست */
export function buildBankManifest(
  questions: BankQuestion[],
  version = "1",
  updatedAt = new Date().toISOString(),
  sample = false,
): BankManifest {
  const byTopic = new Map<string, BankTopicMeta>();
  for (const q of questions) {
    const row =
      byTopic.get(q.topicId) ??
      ({ topicId: q.topicId, subject: q.subject, topicTitle: q.topicTitle, count: 0, byExamType: {}, years: [] } as BankTopicMeta);
    row.count += 1;
    if (q.keyStatus && q.keyStatus !== "confirmed") row.flagged = (row.flagged ?? 0) + 1;
    row.byExamType[q.examType] = (row.byExamType[q.examType] ?? 0) + 1;
    if (!row.years.includes(q.year)) row.years.push(q.year);
    byTopic.set(q.topicId, row);
  }
  const topics = [...byTopic.values()].map((t) => ({
    ...t,
    years: [...t.years].sort((a, b) => b - a),
  }));
  topics.sort((a, b) => a.subject.localeCompare(b.subject, "fa") || a.topicTitle.localeCompare(b.topicTitle, "fa"));
  return { version, updatedAt, shardBase: "topics", topics, sample };
}

/** مانیفستِ مجموعهٔ نمونهٔ داخلی — از همان سؤال‌ها ساخته می‌شود (بدون دادهٔ دستیِ جدا) */
export const BANK_SAMPLE_MANIFEST: BankManifest = buildBankManifest(
  BANK_SAMPLE_QUESTIONS,
  "sample-1",
  "built-in",
  true,
);

// ---------- بارگذاری مانیفست ----------

export interface ManifestLoad {
  manifest: BankManifest;
  source: "online" | "sample";
  /** آدرس بانک تنظیم شده بود؟ (اگر نه، هیچ درخواستی به شبکه نمی‌رود) */
  configured: boolean;
  error?: string;
}

let manifestCache: { at: number; value: ManifestLoad } | null = null;

export async function loadBankManifest(opts: { force?: boolean } = {}): Promise<ManifestLoad> {
  if (!opts.force && manifestCache && Date.now() - manifestCache.at < BANK_MANIFEST_STALE_MS) {
    return manifestCache.value;
  }
  // اگر کاربر آدرسی تنظیم نکرده باشد، اول سراغ «بانکِ همراهِ خودِ اپ» می‌رویم: پوشهٔ
  // `qbank` کنارِ اپ (همان شاردهای آمادهٔ ۱۰ هزار سؤالی). اگر نبود (نسخهٔ سبک/آفلاین)،
  // بی‌سر‌و‌صدا مجموعهٔ نمونهٔ داخلی می‌آید — رفتارِ قبلی برای کاربرانِ بدونِ بانک حفظ می‌شود.
  if (!bankConfigured()) {
    try {
      const raw = await fetchJson<unknown>(bankUrl("manifest.json"), 8_000);
      const bundled = normalizeManifest(raw);
      if (bundled && bundled.topics.length > 0) {
        const value: ManifestLoad = { manifest: bundled, source: "online", configured: false };
        manifestCache = { at: Date.now(), value };
        return value;
      }
    } catch {
      /* بانکی همراه اپ نیست؛ نمونهٔ داخلی */
    }
    const value: ManifestLoad = { manifest: BANK_SAMPLE_MANIFEST, source: "sample", configured: false };
    manifestCache = { at: Date.now(), value };
    return value;
  }
  try {
    const raw = await fetchJson<unknown>(bankUrl("manifest.json"));
    const normalized = normalizeManifest(raw);
    if (!normalized || normalized.topics.length === 0) throw new Error("مانیفست خالی یا نامعتبر بود");
    const value: ManifestLoad = { manifest: normalized, source: "online", configured: true };
    manifestCache = { at: Date.now(), value };
    return value;
  } catch (e) {
    const value: ManifestLoad = {
      manifest: BANK_SAMPLE_MANIFEST,
      source: "sample",
      configured: true,
      error: e instanceof Error ? e.message : "بانک آنلاین در دسترس نبود",
    };
    // کشِ نمونه کوتاه‌مدت است تا با برگشتن اینترنت دوباره تلاش شود
    manifestCache = { at: Date.now() - BANK_MANIFEST_STALE_MS + 60_000, value };
    return value;
  }
}

export function normalizeManifest(raw: unknown): BankManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<BankManifest>;
  if (!Array.isArray(r.topics)) return null;
  const topics: BankTopicMeta[] = [];
  for (const row of r.topics) {
    if (!row || typeof row !== "object") continue;
    const t = row as Partial<BankTopicMeta>;
    const topicId = cleanText(t.topicId, 80);
    const topicTitle = cleanText(t.topicTitle, 120);
    if (!topicId || !topicTitle) continue;
    const byExamType: Partial<Record<BankExamType, number>> = {};
    for (const key of ["pre_internship", "residency"] as const) {
      const n = Number((t.byExamType ?? {})[key]);
      if (Number.isFinite(n) && n > 0) byExamType[key] = Math.floor(n);
    }
    const count = Number.isFinite(t.count) ? Math.max(0, Math.floor(t.count as number)) : Object.values(byExamType).reduce((a, b) => a + (b ?? 0), 0);
    if (count === 0) continue;
    const years = Array.isArray(t.years)
      ? (t.years as unknown[])
          .map((y) => Number(y))
          .filter((y) => Number.isFinite(y) && y >= BANK_MIN_YEAR && y <= BANK_MAX_YEAR)
          .map((y) => Math.floor(y))
      : [];
    topics.push({
      topicId,
      subject: cleanText(t.subject, 80) || "عمومی",
      topicTitle,
      count,
      byExamType,
      years: [...new Set(years)].sort((a, b) => b - a),
      ...(Number.isFinite(Number(t.flagged)) && Number(t.flagged) > 0
        ? { flagged: Math.min(Number(t.flagged), count) }
        : {}),
    });
  }
  if (topics.length === 0) return null;
  return {
    version: cleanText(r.version, 40) || "1",
    updatedAt: cleanText(r.updatedAt, 40) || "",
    shardBase: cleanText(r.shardBase, 80) || "topics",
    sample: r.sample === true,
    ...(r.encoding === "gzip" ? { encoding: "gzip" as const } : {}),
    topics,
  };
}

// ---------- بارگذاری شاردها (تنبل، ادغام‌شده، فقط در حافظه) ----------

/** کشِ حافظهٔ همین نشست — با `clearBankCache()` هنگام خروج پاک می‌شود */
const shardCache = new Map<string, BankQuestion[]>();
const inFlight = new Map<string, Promise<BankQuestion[]>>();

export interface ShardLoad {
  questions: BankQuestion[];
  source: "online" | "sample";
  /** مبحث‌هایی که دانلود نشدند */
  failed: string[];
}

function sampleForTopic(topicId: string): BankQuestion[] {
  return BANK_SAMPLE_QUESTIONS.filter((q) => q.topicId === topicId);
}

/**
 * سؤال‌های چند مبحث. درخواست‌های هم‌زمانِ یک مبحث یک‌بار انجام می‌شوند؛ مبحثی که
 * آنلاین نشد با نسخهٔ نمونه (اگر داشته باشد) پر می‌شود و در `failed` گزارش می‌شود.
 */
export async function loadQuestionsForTopics(
  topicIds: string[],
  opts: { manifest?: BankManifest; signal?: AbortSignal } = {},
): Promise<ShardLoad> {
  const unique = [...new Set(topicIds)].filter(Boolean);
  const failed: string[] = [];
  let anySample = false;
  let anyOnline = false;
  // بدون آدرسِ بانک (یا با مانیفستِ «نمونه»)، هیچ درخواستی به شبکه نمی‌رود؛
  // کاربرِ آفلاین باید همان مجموعهٔ داخلی را بی‌درنگ ببیند.
  if (opts.manifest?.sample === true) {
    const questions = unique.flatMap((topicId) => {
      const list = sampleForTopic(topicId);
      if (list.length === 0) failed.push(topicId);
      return list;
    });
    return { questions, source: "sample", failed };
  }
  const results = await Promise.all(
    unique.map(async (topicId) => {
      if (shardCache.has(topicId)) {
        anyOnline = true;
        return shardCache.get(topicId)!;
      }
      const url = questionShardUrl(topicId, opts.manifest);
      try {
        let pending = inFlight.get(topicId);
        if (!pending) {
          pending = fetchBankJson<unknown>(url, opts.manifest?.encoding, 20_000)
            .then((raw) => {
              const list = extractQuestions(raw);
              shardCache.set(topicId, list);
              return list;
            })
            .finally(() => inFlight.delete(topicId));
          inFlight.set(topicId, pending);
        }
        const list = await pending;
        if (list.length === 0) throw new Error("شارد خالی بود");
        anyOnline = true;
        return list;
      } catch {
        failed.push(topicId);
        const fallback = sampleForTopic(topicId);
        if (fallback.length > 0) {
          anySample = true;
          return fallback;
        }
        return [];
      }
    }),
  );
  if (opts.signal?.aborted) return { questions: [], source: "online", failed: unique };
  return {
    questions: results.flat(),
    source: anySample && !anyOnline ? "sample" : anyOnline ? "online" : "sample",
    failed,
  };
}

/** استخراج سؤال‌های سالم از یک شارد (آرایه یا `{questions:[...]}`) */
export function extractQuestions(raw: unknown): BankQuestion[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { questions?: unknown }).questions)
      ? ((raw as { questions: unknown[] }).questions)
      : [];
  const out: BankQuestion[] = [];
  const seen = new Set<string>();
  for (const row of list) {
    const q = normalizeBankQuestion(row);
    if (!q || seen.has(q.id)) continue;
    seen.add(q.id);
    out.push(q);
  }
  return out;
}

/** پاک‌کردن حافظهٔ موقت — بعد از پایان آزمون یا خروج از بخش صدا زده می‌شود */
export function clearBankCache(): void {
  shardCache.clear();
  inFlight.clear();
}

export function bankCacheSize(): number {
  let n = 0;
  for (const list of shardCache.values()) n += list.length;
  return n;
}

/** آمار سبکِ حافظه — برای نمایش در بنر خروج */
export function bankCacheTopics(): string[] {
  return [...shardCache.keys()];
}

// ---------- فیلتر و انتخاب سؤال ----------

export interface BankFilter {
  examTypes?: BankExamType[];
  /** کنار گذاشتنِ سؤال‌هایی که کلیدشان در بازبینی «مشکوک» علامت خورده */
  excludeDoubtful?: boolean;
  /** بازهٔ سال (شمسی) */
  yearFrom?: number;
  yearTo?: number;
  topicIds?: string[];
}

export interface BankSelectionOptions extends BankFilter {
  count: number;
  /** ترتیب تصادفیِ پایدار (برای جلوگیری از ترتیب تکراری) */
  seed?: number;
  /** فقط سؤال‌هایی که کاربر قبلاً غلط زده/نشان‌دار کرده */
  onlyIds?: string[];
}

export function filterBankQuestions(questions: BankQuestion[], filter: BankFilter): BankQuestion[] {
  const types = filter.examTypes && filter.examTypes.length > 0 ? new Set(filter.examTypes) : null;
  const topics = filter.topicIds && filter.topicIds.length > 0 ? new Set(filter.topicIds) : null;
  return questions.filter((q) => {
    // کلیدِ مشکوک و کلیدِ نامعتبر هر دو در حالتِ آزمونی/زمان‌دار کنار می‌روند
    // (در حالتِ تمرینی می‌آیند و برچسبشان دیده می‌شود)
    if (filter.excludeDoubtful && (q.keyStatus === "doubtful" || q.keyStatus === "incorrect")) return false;
    if (types && !types.has(q.examType)) return false;
    if (topics && !topics.has(q.topicId)) return false;
    if (filter.yearFrom != null && q.year < filter.yearFrom) return false;
    if (filter.yearTo != null && q.year > filter.yearTo) return false;
    return true;
  });
}

/**
 * انتخاب سؤال برای آزمون:
 *  • سؤال‌ها بین مبحث‌ها «نوبتی» چیده می‌شوند تا یک درس همهٔ آزمون را نگیرد.
 *  • درونِ هر مبحث ترتیب با seed پایدار جابه‌جا می‌شود.
 *  • تعداد از سقفِ منطقی بیشتر نمی‌شود.
 */
export function selectBankQuestions(questions: BankQuestion[], opts: BankSelectionOptions): BankQuestion[] {
  let pool = filterBankQuestions(questions, opts);
  if (opts.onlyIds && opts.onlyIds.length > 0) {
    const ids = new Set(opts.onlyIds);
    pool = pool.filter((q) => ids.has(q.id));
  }
  const seed = opts.seed ?? 1;
  const byTopic = new Map<string, BankQuestion[]>();
  for (const q of pool) {
    const arr = byTopic.get(q.topicId) ?? [];
    arr.push(q);
    byTopic.set(q.topicId, arr);
  }
  const groups = [...byTopic.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([topicId, list], i) => ({ topicId, list: shuffleWithSeed(list, seed + i * 131) }));
  const out: BankQuestion[] = [];
  const limit = Math.max(1, Math.min(BANK_MAX_QUESTIONS_PER_RUN, Math.floor(opts.count)));
  let round = 0;
  while (out.length < limit) {
    let added = false;
    for (const group of groups) {
      if (out.length >= limit) break;
      const item = group.list[round];
      if (item) {
        out.push(item);
        added = true;
      }
    }
    if (!added) break;
    round += 1;
  }
  return out;
}

function shuffleWithSeed<T>(list: T[], seed: number): T[] {
  const rnd = mulberry32(seed >>> 0);
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** سال‌های موجود در مانیفست/سؤال‌ها (نزولی) */
export function availableYears(manifest: BankManifest | null, questions: BankQuestion[] = []): number[] {
  const set = new Set<number>();
  for (const t of manifest?.topics ?? []) for (const y of t.years) set.add(y);
  for (const q of questions) set.add(q.year);
  return [...set].sort((a, b) => b - a);
}

// ---------- ثبت پاسخ و تحلیل عملکرد ----------

/** یک پاسخ تازه برای ذخیره — بدون متن سؤال، فقط متادیتای کوچک */
export function makeBankAttempt(
  question: BankQuestion,
  selectedIndex: number | null,
  correct: boolean,
  ms?: number,
  now = Date.now(),
): BankAttempt {
  return {
    id: `ba:${now.toString(36)}:${Math.random().toString(36).slice(2, 7)}`,
    questionId: question.id,
    topicId: question.topicId,
    topicTitle: question.topicTitle,
    examType: question.examType,
    year: question.year,
    correct,
    selectedIndex: selectedIndex ?? undefined,
    ms,
    at: now,
  };
}

export interface BankTopicPerformance {
  topicId: string;
  topicTitle: string;
  subject?: string;
  answered: number;
  correct: number;
  accuracy: number;
  /** آخرین پاسخ */
  lastAt?: number;
}

/** عملکرد به تفکیک مبحث — پایهٔ تحلیل «نقاط ضعف» */
export function bankPerformance(attempts: BankAttempt[]): BankTopicPerformance[] {
  const map = new Map<string, BankTopicPerformance>();
  for (const a of attempts) {
    if (!a) continue;
    const row =
      map.get(a.topicId) ??
      ({ topicId: a.topicId, topicTitle: a.topicTitle ?? a.topicId, answered: 0, correct: 0, accuracy: 0 } as BankTopicPerformance);
    row.answered += 1;
    if (a.correct) row.correct += 1;
    row.lastAt = Math.max(row.lastAt ?? 0, a.at);
    map.set(a.topicId, row);
  }
  return [...map.values()]
    .map((row) => ({ ...row, accuracy: row.answered > 0 ? Math.round((row.correct / row.answered) * 100) : 0 }))
    .sort((a, b) => a.accuracy - b.accuracy || b.answered - a.answered);
}

/** مباحثِ ضعیف: حداقل ۵ پاسخ و دقت زیر ۷۰٪ (نتیجهٔ نمونه‌های کم، گمراه‌کننده است) */
export function weakBankTopics(attempts: BankAttempt[], minAnswered = 5): BankTopicPerformance[] {
  return bankPerformance(attempts)
    .filter((t) => t.answered >= minAnswered && t.accuracy < 70)
    .slice(0, 5);
}

/** موضوع‌هایی که باید بیشتر تمرین شوند، از تاریخچهٔ سریع‌تر: کم‌دقت + پرتکرار */
export function bankStudyAdvice(attempts: BankAttempt[], sessions: BankSessionResult[] = []): string[] {
  const out: string[] = [];
  const weak = weakBankTopics(attempts);
  for (const t of weak.slice(0, 2)) {
    out.push(`«${t.topicTitle}» با دقت ${t.accuracy}٪ ضعیف‌ترین مبحث توست — یک آزمون ۲۰ سؤالی از همین مبحث بزن.`);
  }
  const last = sessions[sessions.length - 1];
  if (last && last.answered > 0 && last.correct / last.answered >= 0.8) {
    out.push("دقت آزمون قبلی بالای ۸۰٪ بود؛ برای پیشرفت، تعداد سؤال یا بازهٔ سال را کمی سخت‌تر کن.");
  }
  if (attempts.length > 0 && weak.length === 0) out.push("دقتت در همهٔ مباحثِ تمرین‌شده بالای ۷۰٪ است — سراغ مبحث تازه برو.");
  return out;
}

/** جمع‌بندی نتیجهٔ آزمون — همان چیزی که در پایان نمایش و ذخیره می‌شود */
export function scoreBankSession(
  questions: BankQuestion[],
  answers: Record<string, { selectedIndex: number | null; correct: boolean }>,
  meta: { startedAt: number; usedSec: number; examType?: BankExamType | "mixed"; source: "online" | "sample" },
  now = Date.now(),
): BankSessionResult {
  let correct = 0;
  let wrong = 0;
  for (const q of questions) {
    const a = answers[q.id];
    if (!a) continue;
    if (a.correct) correct += 1;
    else wrong += 1;
  }
  const answered = correct + wrong;
  return {
    id: `bs:${now.toString(36)}`,
    startedAt: meta.startedAt,
    endedAt: now,
    examType: meta.examType,
    topicIds: [...new Set(questions.map((q) => q.topicId))],
    topicTitles: [...new Set(questions.map((q) => q.topicTitle))],
    years: [...new Set(questions.map((q) => q.year))].sort((a, b) => b - a),
    total: questions.length,
    answered,
    correct,
    wrong,
    skipped: questions.length - answered,
    usedSec: Math.max(0, Math.round(meta.usedSec)),
    source: meta.source,
  };
}
