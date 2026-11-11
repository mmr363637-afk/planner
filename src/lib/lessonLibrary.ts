// ===== 📖 کتابخانهٔ درسنامه — اتصال به مخزنِ محتوای HTML =====
//
// این ماژول پلِ میانِ وب‌اپلیکیشن و مخزنِ جداگانهٔ محتواست
// (https://github.com/mmr363637-afk/DATA). اصلِ طراحی:
//
//   «یکپارچگی بدونِ دوباره‌کاری»
//
//  • مخزنِ محتوا منبعِ حقیقت است. عنوان، درس، مسیرِ فایل، دقیقه‌های محتوا، تعدادِ
//    فلش‌کارت/جدول/سؤالِ تعاملی همه از `manifest.json` همان مخزن خوانده می‌شوند.
//    هیچ‌کدام در اپ کپی یا بازنویسی نمی‌شوند.
//  • بارگذاری تدریجی: در ورود به بخش فقط همان مانیفست (≈۷۰ کیلوبایت) گرفته می‌شود.
//    خودِ فایلِ HTML یک درسنامه (گاهی ۱۵۰ کیلوبایت) فقط وقتی کاربر همان درس را باز
//    می‌کند از گیت‌هاب می‌آید. کلِ مخزن هرگز یک‌جا دانلود نمی‌شود.
//  • ذخیره‌سازی: مانیفست فقط در کشِ کوتاه‌مدتِ localStorage می‌ماند (برای آفلاین) و
//    با هر نسخهٔ تازه جایگزین می‌شود. محتوای HTML هیچ‌جا ذخیره نمی‌شود.
//  • دادهٔ کاربر (زمانِ واقعیِ مطالعه، تعدادِ بازدید، «تمام شد») در state خودِ اپ
//    می‌ماند و با به‌روزرسانیِ محتوا پاک نمی‌شود.
//  • دو بانک سؤال عمداً جدا می‌مانند:
//      – `qbank` خودِ اپ: سؤال‌های واقعیِ پره‌انترنی/دستیاری بر اساسِ سال و مبحث (lib/examBank)
//      – `qbank` کتابخانه: آزمونِ فصل‌به‌فصلِ کتاب‌محورِ مخزنِ محتوا (این‌جا)
//    هیچ‌وقت با هم ادغام نمی‌شوند؛ فقط کنارِ هم فهرست می‌شوند.
//
// اگر کتابخانه در دسترس نباشد (آفلاینِ بدونِ کش، یا آدرسِ عوض‌شده)، اپ مثلِ قبل کار
// می‌کند و فقط بخشِ درسنامه‌ها پیامِ مناسب نشان می‌دهد.

import { normalizeFa, scoreQuery } from "./textSearch";
import type {
  LibraryManifest,
  LibraryQbankPart,
  LibrarySubjectMeta,
  LessonMeta,
  LessonProgress,
  Subject,
  Topic,
} from "../types";

/** آدرسِ پیش‌فرضِ کتابخانه — انتشارِ GitHub Pages همان مخزنِ محتوا */
export const DEFAULT_LIBRARY_BASE = "https://mmr363637-afk.github.io/DATA/lib/";
/** کلیدِ تنظیمِ کاربر برای آدرسِ کتابخانه (مثلاً میروی روی دامنهٔ خودت) */
export const LIBRARY_URL_KEY = "sp_library_url";
/** کلیدِ کشِ مانیفست در localStorage */
export const LIBRARY_CACHE_KEY = "sp_library_manifest_v1";
/** عمرِ کش وقتی آنلاین هستیم: ۶ ساعت، مثلِ کشِ مانیفستِ بانکِ سؤال */
export const LIBRARY_STALE_MS = 6 * 60 * 60 * 1000;
/** سقفِ اندازهٔ مانیفستی که حاضریم در localStorage نگه داریم */
export const LIBRARY_MAX_CACHE_BYTES = 900_000;

/** آدرسِ پایهٔ کتابخانه: تنظیمِ کاربر یا پیش‌فرض */
export function getLibraryBase(): string {
  let saved = "";
  try {
    saved = localStorage.getItem(LIBRARY_URL_KEY) ?? "";
  } catch {
    saved = "";
  }
  const raw = (saved.trim() || DEFAULT_LIBRARY_BASE).replace(/\/+$/, "");
  return `${raw}/`;
}

export function setLibraryBase(url: string): void {
  try {
    const clean = url.trim().replace(/\/+$/, "");
    if (clean) localStorage.setItem(LIBRARY_URL_KEY, `${clean}/`);
    else localStorage.removeItem(LIBRARY_URL_KEY);
  } catch {
    /* ignore */
  }
}

/** ساختِ آدرسِ کامل از مسیرِ نسبیِ داخلِ مانیفست */
export function libraryUrl(path: string, base = getLibraryBase()): string {
  return `${base}${String(path ?? "").replace(/^\/+/, "")}`;
}

const cleanText = (value: unknown, max: number): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

const toInt = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};

/**
 * سالم‌سازی مانیفستِ مخزنِ محتوا.
 * مانیفست از یک ریپوی دیگر می‌آید و ممکن است در نسخه‌های بعدی فیلدِ تازه/کم داشته
 * باشد؛ این‌جا هر چیزی که برای نمایش لازم است با مقدارِ امن پر می‌شود و ردیفِ
 * واقعاً خراب (بی‌عنوان یا بی‌مسیر) کنار می‌رود.
 */
export function normalizeLibraryManifest(raw: unknown): LibraryManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const lessons: LessonMeta[] = [];
  const seenLesson = new Set<string>();
  for (const row of Array.isArray(r.lessons) ? (r.lessons as unknown[]) : []) {
    if (!row || typeof row !== "object") continue;
    const l = row as Record<string, unknown>;
    const path = cleanText(l.path, 400);
    const title = cleanText(l.title, 240);
    if (!path || !title) continue;
    const id = cleanText(l.id, 200) || path.replace(/\.html?$/i, "");
    if (seenLesson.has(id)) continue;
    seenLesson.add(id);
    const appSubjectKeys = Array.isArray(l.appSubjectKeys)
      ? (l.appSubjectKeys as unknown[]).map((k) => cleanText(k, 80)).filter(Boolean)
      : undefined;
    lessons.push({
      id,
      subject: cleanText(l.subject, 80) || "general",
      title,
      path,
      minutes: toInt(l.minutes),
      sections: toInt(l.sections),
      words: toInt(l.words),
      flashcards: toInt(l.flashcards),
      tables: toInt(l.tables),
      mcq: toInt(l.mcq),
      ...(cleanText(l.source, 240) ? { source: cleanText(l.source, 240) } : {}),
      ...(appSubjectKeys && appSubjectKeys.length > 0 ? { appSubjectKeys } : {}),
    });
  }

  const subjects: LibrarySubjectMeta[] = [];
  for (const row of Array.isArray(r.subjects) ? (r.subjects as unknown[]) : []) {
    if (!row || typeof row !== "object") continue;
    const s = row as Record<string, unknown>;
    const key = cleanText(s.key, 80);
    const name = cleanText(s.name, 160);
    if (!key || !name) continue;
    const appSubjectKeys = Array.isArray(s.appSubjectKeys)
      ? (s.appSubjectKeys as unknown[]).map((k) => cleanText(k, 80)).filter(Boolean)
      : undefined;
    subjects.push({
      key,
      name,
      ...(cleanText(s.nameEn, 160) ? { nameEn: cleanText(s.nameEn, 160) } : {}),
      ...(cleanText(s.icon, 16) ? { icon: cleanText(s.icon, 16) } : {}),
      ...(Number.isFinite(Number(s.hue)) ? { hue: Number(s.hue) } : {}),
      ...(Number.isFinite(Number(s.chroma)) ? { chroma: Number(s.chroma) } : {}),
      ...(cleanText(s.page, 400) ? { page: cleanText(s.page, 400) } : {}),
      count: toInt(s.count),
      minutes: toInt(s.minutes),
      ...(appSubjectKeys && appSubjectKeys.length > 0 ? { appSubjectKeys } : {}),
    });
  }

  if (lessons.length === 0 && subjects.length === 0) return null;

  // شمارش‌ها: اگر مانیفست عددی داشت همان، وگرنه از خودِ ردیف‌ها — تا عددِ نمایشی
  // هرگز با فهرستِ واقعی نخورد.
  const countsRaw = (r.counts ?? {}) as Record<string, unknown>;
  const counts = {
    subjects: toInt(countsRaw.subjects, subjects.length) || subjects.length,
    lessons: toInt(countsRaw.lessons, lessons.length) || lessons.length,
    minutes: toInt(countsRaw.minutes, lessons.reduce((a, l) => a + l.minutes, 0)),
  };

  let qbank: LibraryManifest["qbank"];
  const q = r.qbank as Record<string, unknown> | undefined;
  if (q && typeof q === "object" && Array.isArray(q.parts)) {
    const parts: LibraryQbankPart[] = [];
    for (const row of q.parts as unknown[]) {
      if (!row || typeof row !== "object") continue;
      const p = row as Record<string, unknown>;
      const part = cleanText(p.part, 80);
      if (!part) continue;
      parts.push({
        part,
        subject: cleanText(p.subject, 80),
        title: cleanText(p.title, 200) || part,
        count: toInt(p.count),
        ...(cleanText(p.page, 400) ? { page: cleanText(p.page, 400) } : {}),
        ...(cleanText(p.standalone, 400) ? { standalone: cleanText(p.standalone, 400) } : {}),
        ...(Number.isFinite(Number(p.chapters)) ? { chapters: Number(p.chapters) } : {}),
      });
    }
    if (parts.length > 0) {
      qbank = {
        ...(cleanText(q.index, 400) ? { index: cleanText(q.index, 400) } : {}),
        total: toInt(q.total, parts.reduce((a, p) => a + p.count, 0)),
        parts,
      };
    }
  }

  const version = typeof r.version === "number" ? r.version : cleanText(r.version, 40) || "0";
  return {
    version,
    ...(cleanText(r.schema, 60) ? { schema: cleanText(r.schema, 60) } : {}),
    updatedAt: cleanText(r.updatedAt, 40),
    ...(cleanText(r.basePath, 200) ? { basePath: cleanText(r.basePath, 200) } : {}),
    ...(cleanText(r.index, 200) ? { index: cleanText(r.index, 200) } : {}),
    counts,
    subjects,
    lessons,
    ...(qbank ? { qbank } : {}),
  };
}

/** کلیدِ نسخه — برای تشخیصِ «محتوا در گیت‌هاب عوض شده» */
export function libraryVersionKey(manifest: LibraryManifest | null): string {
  if (!manifest) return "";
  return `${manifest.version}@${manifest.updatedAt}`;
}

export interface LibraryLoad {
  manifest: LibraryManifest | null;
  /** `cache` یعنی آفلاین/خطا و از کشِ محلی آمد */
  source: "network" | "cache" | "none";
  error?: string;
  /** آدرسی که واقعاً صدا زده شد (برای نمایش در تنظیمات) */
  url: string;
}

interface CacheEnvelope {
  at: number;
  versionKey: string;
  data: LibraryManifest;
}

function readCache(): CacheEnvelope | null {
  try {
    const raw = localStorage.getItem(LIBRARY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope;
    if (!parsed || typeof parsed !== "object" || !parsed.data) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(manifest: LibraryManifest): void {
  try {
    const envelope: CacheEnvelope = { at: Date.now(), versionKey: libraryVersionKey(manifest), data: manifest };
    const text = JSON.stringify(envelope);
    // مانیفستِ بزرگ‌تر از سقف، کش نمی‌شود تا سهمیهٔ localStorage اپ را نخورد
    if (text.length > LIBRARY_MAX_CACHE_BYTES) return;
    localStorage.setItem(LIBRARY_CACHE_KEY, text);
  } catch {
    /* پر بودنِ سهمیه نباید کتابخانه را از کار بیندازد */
  }
}

let memoryCache: LibraryLoad | null = null;

/**
 * خواندنِ مانیفستِ کتابخانه.
 *  • اول کشِ حافظهٔ همین نشست (بدونِ درخواستِ شبکه)
 *  • بعد کشِ localStorage اگر تازه باشد
 *  • بعد شبکه؛ اگر شبکه شکست خورد، همان کشِ کهنه برمی‌گردد (حالتِ آفلاین)
 */
export async function loadLibraryManifest(opts: { force?: boolean; timeoutMs?: number } = {}): Promise<LibraryLoad> {
  const url = libraryUrl("manifest.json");
  if (!opts.force && memoryCache) return memoryCache;
  const cached = readCache();
  if (!opts.force && cached && Date.now() - cached.at < LIBRARY_STALE_MS) {
    const value: LibraryLoad = { manifest: cached.data, source: "cache", url };
    memoryCache = value;
    return value;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 12_000);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const manifest = normalizeLibraryManifest(await res.json());
    if (!manifest) throw new Error("مانیفستِ کتابخانه نامعتبر بود");
    writeCache(manifest);
    const value: LibraryLoad = { manifest, source: "network", url };
    memoryCache = value;
    return value;
  } catch (e) {
    const message = e instanceof Error ? e.message : "کتابخانه در دسترس نبود";
    if (cached) {
      const value: LibraryLoad = { manifest: cached.data, source: "cache", url, error: message };
      memoryCache = value;
      return value;
    }
    // کشِ کوتاه‌مدت برای تلاشِ دوباره — مثلِ رفتارِ مانیفستِ بانکِ سؤال
    const value: LibraryLoad = { manifest: null, source: "none", url, error: message };
    memoryCache = null;
    return value;
  } finally {
    clearTimeout(timer);
  }
}

/** پاک‌کردنِ کشِ حافظه (بعد از تغییرِ آدرس یا «بروزرسانی» دستی) */
export function clearLibraryCache(): void {
  memoryCache = null;
}

// ---------- آدرس‌ها ----------

export function lessonUrl(lesson: LessonMeta, base?: string): string {
  return libraryUrl(lesson.path, base);
}

export function libraryHomeUrl(manifest: LibraryManifest | null, base?: string): string {
  return libraryUrl(manifest?.index || "index.html", base);
}

export function librarySubjectUrl(subject: LibrarySubjectMeta | undefined, base?: string): string {
  return libraryUrl(subject?.page || "index.html", base);
}

export function libraryQbankUrl(manifest: LibraryManifest | null, base?: string): string {
  return libraryUrl(manifest?.qbank?.index || "qbank/index.html", base);
}

export function qbankPartUrl(part: LibraryQbankPart, base?: string): string {
  return libraryUrl(part.page || `qbank/${part.part}.html`, base);
}

/** نسخهٔ تک‌فایلیِ آفلاینِ همان بخش (همه‌چیز درون یک HTML) */
export function qbankStandaloneUrl(part: LibraryQbankPart, base?: string): string {
  return libraryUrl(part.standalone || `qbank/${part.part}-standalone.html`, base);
}

// ---------- نگاشت به دادهٔ خودِ اپ ----------

/**
 * کلیدهای درسِ اپ که یک درسنامه به آن‌ها وصل است.
 * قاعدهٔ اتصال: `LessonMeta.appSubjectKeys` ↔ `Subject.sampleId` در اپ
 * (همان کلیدهای پک‌های فلش‌کارت: cardiology-nematpour، surgery-lawrence، …).
 */
export function appKeysOfLesson(lesson: LessonMeta): string[] {
  return lesson.appSubjectKeys ?? [];
}

/** درسنامه‌های یک درسِ اپ (با کلیدِ کاتالوگ) */
export function lessonsForAppKey(manifest: LibraryManifest | null, appSubjectKey: string | undefined): LessonMeta[] {
  if (!manifest || !appSubjectKey) return [];
  return manifest.lessons.filter((l) => (l.appSubjectKeys ?? []).includes(appSubjectKey));
}

/** همهٔ کلیدهای اپِ یک درسِ کتابخانه */
export function appKeysOfLibrarySubject(subject: LibrarySubjectMeta): string[] {
  return subject.appSubjectKeys ?? [];
}

/** درسنامه‌های مربوط به یک Subject در اپ */
export function lessonsForSubject(manifest: LibraryManifest | null, subject: Subject | undefined): LessonMeta[] {
  if (!manifest || !subject?.sampleId) return [];
  return lessonsForAppKey(manifest, subject.sampleId);
}

/** درسنامه‌های مربوط به یک Topic در اپ (از راهِ درسِ والدش) */
export function lessonsForTopic(
  manifest: LibraryManifest | null,
  topic: Topic | undefined,
  subjects: Subject[] = [],
): LessonMeta[] {
  if (!manifest || !topic) return [];
  const subject = subjects.find((s) => s.id === topic.subjectId);
  return lessonsForSubject(manifest, subject);
}

/** درسِ کتابخانه‌ای که یک کلیدِ اپ را پوشش می‌دهد */
export function librarySubjectForAppKey(
  manifest: LibraryManifest | null,
  appSubjectKey: string | undefined,
): LibrarySubjectMeta | undefined {
  if (!manifest || !appSubjectKey) return undefined;
  return manifest.subjects.find((s) => (s.appSubjectKeys ?? []).includes(appSubjectKey));
}

/** درسنامه‌ها به تفکیکِ درسِ کتابخانه، مرتب با همان ترتیبِ مانیفست */
export function groupLessonsBySubject(manifest: LibraryManifest | null): { subject: LibrarySubjectMeta; lessons: LessonMeta[] }[] {
  if (!manifest) return [];
  const out: { subject: LibrarySubjectMeta; lessons: LessonMeta[] }[] = [];
  for (const subject of manifest.subjects) {
    const lessons = manifest.lessons.filter((l) => l.subject === subject.key);
    if (lessons.length === 0 && subject.count === 0) continue;
    out.push({ subject, lessons });
  }
  // درسنامه‌هایی که درس‌شان در فهرست نیست (مانیفستِ ناقص) — گم نمی‌شوند
  const known = new Set(manifest.subjects.map((s) => s.key));
  const orphans = manifest.lessons.filter((l) => !known.has(l.subject));
  if (orphans.length > 0) {
    out.push({
      subject: { key: "__other", name: "سایر درسنامه‌ها", count: orphans.length, minutes: orphans.reduce((a, l) => a + l.minutes, 0) },
      lessons: orphans,
    });
  }
  return out;
}

/** جست‌وجوی درسنامه در عنوان/درس/نامِ فایلِ مبدأ */
export function searchLessons(manifest: LibraryManifest | null, query: string): LessonMeta[] {
  if (!manifest) return [];
  const q = query.trim().toLowerCase();
  if (!q) return manifest.lessons;
  return manifest.lessons.filter((l) =>
    `${l.title} ${l.source ?? ""} ${l.subject} ${l.path}`.toLowerCase().includes(q),
  );
}

// ---------- دادهٔ کاربر ----------

const EMPTY_PROGRESS: LessonProgress = { seconds: 0, visits: 0, lastAt: 0 };

/** پیشرفتِ ثبت‌شدهٔ یک درسنامه (هرگز undefined برنمی‌گرداند) */
export function progressOf(map: Record<string, LessonProgress> | undefined, lessonId: string): LessonProgress {
  return map?.[lessonId] ?? EMPTY_PROGRESS;
}

/** زمانِ واقعیِ مطالعهٔ کاربر به دقیقه — مستقل از `minutes` خودِ محتوا */
export function studiedMinutes(map: Record<string, LessonProgress> | undefined, lessonId: string): number {
  return Math.round(progressOf(map, lessonId).seconds / 60);
}

/** نسبتِ پیشرفتِ کاربر به مدت‌زمانِ خودِ محتوا (۰..۱) — فقط برای نوارِ پیشرفت */
export function lessonCompletion(
  map: Record<string, LessonProgress> | undefined,
  lesson: LessonMeta,
): number {
  const progress = progressOf(map, lesson.id);
  if (progress.done) return 1;
  if (lesson.minutes <= 0) return 0;
  return Math.max(0, Math.min(1, progress.seconds / 60 / lesson.minutes));
}

/** جمعِ زمانِ واقعیِ مطالعه روی همهٔ درسنامه‌ها (ثانیه) */
export function totalStudiedSeconds(map: Record<string, LessonProgress> | undefined): number {
  return Object.values(map ?? {}).reduce((a, p) => a + (Number.isFinite(p?.seconds) ? p.seconds : 0), 0);
}

/** چند درسنامه «تمام شد» علامت خورده */
export function completedLessonCount(map: Record<string, LessonProgress> | undefined): number {
  return Object.values(map ?? {}).filter((p) => p?.done === true).length;
}

/**
 * افزودنِ زمانِ مطالعه به رکوردِ یک درسنامه (تابعِ خالص — store از این استفاده می‌کند).
 * ثانیه‌های کمتر از یک نادیده گرفته می‌شوند تا تیکِ تایمر رکوردِ الکی نسازد.
 * تعدادِ بازدیدها این‌جا زیاد نمی‌شود؛ آن کارِ `visitLesson` است تا دوباره شمرده نشود.
 */
export function addLessonTime(
  map: Record<string, LessonProgress> | undefined,
  lessonId: string,
  seconds: number,
  now = Date.now(),
): Record<string, LessonProgress> {
  const add = Math.max(0, Math.floor(seconds));
  const next = { ...(map ?? {}) };
  const prev = next[lessonId] ?? EMPTY_PROGRESS;
  if (add === 0) return map ?? next;
  next[lessonId] = {
    ...prev,
    seconds: prev.seconds + add,
    firstAt: prev.firstAt ?? now,
    lastAt: now,
  };
  return next;
}

/**
 * ثبتِ یک بازدید (بدونِ زمان). جدا از `addLessonTime` است چون «باز کردم و بستم»
 * نباید هیچ دقیقه‌ای به آمارِ مطالعه اضافه کند.
 */
export function visitLesson(
  map: Record<string, LessonProgress> | undefined,
  lessonId: string,
  now = Date.now(),
): Record<string, LessonProgress> {
  const next = { ...(map ?? {}) };
  const prev = next[lessonId] ?? EMPTY_PROGRESS;
  next[lessonId] = {
    ...prev,
    visits: prev.visits + 1,
    firstAt: prev.firstAt ?? now,
    lastAt: now,
  };
  return next;
}

/** «تمام شد» برای یک درسنامه (تابعِ خالص) */
export function setLessonDone(
  map: Record<string, LessonProgress> | undefined,
  lessonId: string,
  done: boolean,
  now = Date.now(),
): Record<string, LessonProgress> {
  const next = { ...(map ?? {}) };
  const prev = next[lessonId] ?? EMPTY_PROGRESS;
  next[lessonId] = {
    ...prev,
    seconds: prev.seconds,
    visits: prev.visits,
    lastAt: Math.max(prev.lastAt, now),
    firstAt: prev.firstAt ?? now,
    done: done || undefined,
    doneAt: done ? (prev.doneAt ?? now) : undefined,
  };
  return next;
}

/** نمایشِ فارسیِ مدت‌زمان (۴۸ دقیقه / ۲ ساعت و ۱۵ دقیقه) */
export function formatDurationFa(minutes: number, digits: (n: number | string) => string = (n) => String(n)): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${digits(m)} دقیقه`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest > 0 ? `${digits(h)} ساعت و ${digits(rest)} دقیقه` : `${digits(h)} ساعت`;
}

// ---------- جست‌وجوی هوشمند + پیشنهادِ ادامه ----------
//
// نقطهٔ درد: کتابخانه ۱۵۰+ درسنامه در ۹ درس دارد؛ پیدا کردنِ همان یک درسنامه با
// تطبیقِ «زیررشته‌ایِ خام» (`includes`) کار سختی بود — «تنگی آورت» پیدا نمی‌شد و
// «قلب» فقط عنوان‌هایی را می‌آورد که کلمهٔ «قلب» را در خودشان داشتند.
// منطقِ نرمال‌سازی/امتیازدهی در `lib/textSearch` است و همین‌جا با وزن‌های
// «عنوان > درس > نامِ فایلِ مبدأ» به کار می‌رود.

/** ایندکسِ سبکِ یک درسنامه برای جست‌وجو — یک‌بار ساخته و کش می‌شود */
interface LessonIndex {
  lesson: LessonMeta;
  title: string;
  source: string;
  subject: string;
}

const indexCache = new WeakMap<LibraryManifest, LessonIndex[]>();

function lessonIndex(manifest: LibraryManifest): LessonIndex[] {
  const hit = indexCache.get(manifest);
  if (hit) return hit;
  const subjectName = new Map(manifest.subjects.map((s) => [s.key, `${s.name} ${s.nameEn ?? ""}`]));
  const list: LessonIndex[] = manifest.lessons.map((lesson) => ({
    lesson,
    title: normalizeFa(lesson.title),
    source: normalizeFa(lesson.source ?? ""),
    subject: normalizeFa(subjectName.get(lesson.subject) ?? lesson.subject),
  }));
  indexCache.set(manifest, list);
  return list;
}

/**
 * جست‌وجوی درسنامه با امتیازدهی — نتیجه از بهترین به بدترین.
 * اگر عبارت خالی باشد، همهٔ درسنامه‌ها (به ترتیبِ مانیفست) برمی‌گردند.
 * «درس» و «عنوانِ کامل» وزنِ بیشتری از نامِ فایلِ مبدأ دارند.
 */
export function searchLessonsRanked(manifest: LibraryManifest | null, query: string): LessonMeta[] {
  if (!manifest) return [];
  const q = query.trim();
  if (!q) return manifest.lessons;
  const scored: { lesson: LessonMeta; score: number }[] = [];
  for (const row of lessonIndex(manifest)) {
    // عنوانِ درسنامه مهم‌ترین است؛ بعد نامِ فصل/درس؛ نامِ فایلِ مبدأ آخر
    const score = scoreQuery(q, [
      { text: row.title, weight: 1.25 },
      { text: row.subject, weight: 0.9 },
      { text: row.source, weight: 0.6 },
    ]);
    if (score > 0) scored.push({ lesson: row.lesson, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.lesson);
}

/**
 * پیشنهادِ «از همین‌جا ادامه بده»: اول درسنامه‌های نیمه‌خوانده (زمانِ واقعی > ۰ و
 * تمام‌نشده)، بعد تازه‌ها؛ هر کدام با آخرین فعالیت، تازه‌ترین اول.
 */
export function continueReading(
  manifest: LibraryManifest | null,
  progress: Record<string, LessonProgress> | undefined,
  limit = 3,
): { lesson: LessonMeta; kind: "resume" | "new" }[] {
  if (!manifest) return [];
  const out: { lesson: LessonMeta; kind: "resume" | "new"; at: number }[] = [];
  for (const lesson of manifest.lessons) {
    const p = progressOf(progress, lesson.id);
    if (p.done) continue;
    if (p.seconds > 0) out.push({ lesson, kind: "resume", at: p.lastAt ?? 0 });
    else if (p.visits === 0) out.push({ lesson, kind: "new", at: p.lastAt ?? 0 });
  }
  out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "resume" ? -1 : 1;
    if (a.kind === "resume") return b.at - a.at;
    return a.lesson.minutes - b.lesson.minutes; // تازه: کوتاه‌ترها اول تا شروع آسان باشد
  });
  return out.slice(0, limit).map(({ lesson, kind }) => ({ lesson, kind }));
}
