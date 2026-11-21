// ===== 🎨🧪 اسکچ‌نوت و آزمایشگاهِ تعاملی — بسترِ دو بخشِ تازهٔ مخزنِ محتوا =====
//
// این ماژول پلِ میانِ وب‌اپلیکیشن و دو بخشِ تازهٔ مخزنِ محتواست
// (https://github.com/mmr363637-afk/DATA):
//
//   1. 🎨 «کتابخانهٔ اسکچ‌نوت» — خلاصه‌های تصویریِ دست‌نویس (ارتوپدی و عفونی)
//      • مانیفست: `sketches/sketch-manifest.json`
//      • گالری‌ها: `sketches/<set>.html` (با جست‌وجو و زومِ تمام‌صفحه)
//   2. 🧪 «آزمایشگاهِ تعاملی» — شبیه‌سازهای بالینی (فعلاً قلب)
//      • مانیفست: `labs/labs-manifest.json`
//      • صفحهٔ معرفی: `labs/<lab>/index.html` · خودِ شبیه‌ساز: `labs/<lab>/simulator.html`
//
// همان اصولِ کتابخانهٔ درسنامه‌ها (`lessonLibrary.ts`) این‌جا هم برقرار است و
// عمداً هیچ‌کدام نقض نمی‌شود:
//
//   • مخزن منبعِ حقیقت است؛ عنوان/تعداد/حجم/مسیرها از مانیفستِ همان مخزن خوانده
//     می‌شوند و هیچ‌جا در اپ بازتولید نمی‌شوند.
//   • بارگذاری تدریجی: فقط مانیفست‌ها (هر کدام چند صد بایت) گرفته می‌شوند؛ خودِ
//     HTMLِ گالری/شبیه‌ساز فقط هنگامِ بازکردنِ کاربر می‌آید. هیچ‌چیز از محتوا در
//     اپ ذخیره نمی‌شود.
//   • آدرسِ پایهٔ مخزن همان تنظیمِ مشترکت است (`sp_library_url`) — اگر روی دامنهٔ
//     خودت میزبانی کنی، هر سه بخش با یک تغییر آدرس عوض می‌شوند.
//   • کشِ مانیفست در localStorage و با همان عمرِ ۶ ساعته؛ اگر مخزن در دسترس نبود،
//     آخرین نسخهٔ کش‌شده نشان داده می‌شود (حالتِ آفلاین).
//   • دادهٔ کاربر (زمانِ مطالعه، «تمام شد») زیرِ همان `lessonProgress`ِ خودِ اپ
//     با کلیدهای «sketch:<set>» و «lab:<lab>» نگه داشته می‌شود — جدا از محتوا،
//     و با به‌روزرسانیِ محتوا پاک نمی‌شود. آمارِ درسنامه‌ها این کلیدها را نمی‌شمرند
//     (`lessonOnlyProgress`).

import {
  LABS_CACHE_KEY,
  SKETCHES_CACHE_KEY,
  cleanText,
  libraryUrl,
  readCacheEnvelope,
  toInt,
  writeCacheEnvelope,
  LIBRARY_STALE_MS,
} from "./libraryRepo";
import type { LabMeta, LabsManifest, LessonProgress, SketchManifest, SketchSetMeta } from "../types";

export { LABS_CACHE_KEY, SKETCHES_CACHE_KEY };
export const SKETCH_TRACK_PREFIX = "sketch:";
export const LAB_TRACK_PREFIX = "lab:";
export const HUB_TRACK_PREFIXES = [SKETCH_TRACK_PREFIX, LAB_TRACK_PREFIX] as const;

/** پیشوندِ مسیرهای درونِ مانیفستِ ساخت که روی وب معتبر نیست (همان ریشهٔ مخزن) */
const CONTENT_PREFIX = /^content\//;

const relPath = (value: unknown, max = 400): string => cleanText(value, max).replace(CONTENT_PREFIX, "");

// ---------- کلیدهای ثبتِ پیشرفتِ کاربر ----------

export const sketchTrackId = (setKey: string): string => `${SKETCH_TRACK_PREFIX}${setKey}`;
export const labTrackId = (labKey: string): string => `${LAB_TRACK_PREFIX}${labKey}`;

/** آیا این کلید متعلق به بخش‌های بستر (اسکچ‌نوت/آزمایشگاه) است؟ */
export function isHubTrackId(id: string | null | undefined): boolean {
  return typeof id === "string" && HUB_TRACK_PREFIXES.some((p) => id.startsWith(p));
}

/**
 * فقط پیشرفتِ «درسنامه‌ها» — کلیدهای اسکچ‌نوت/آزمایشگاه کنار گذاشته می‌شوند تا
 * آمارِ کتابخانهٔ درسنامه‌ها (زمانِ کل، تعدادِ تمام‌شده) با مطالعهٔ این دو بخش
 * نجوشیده و غلو نکند.
 */
export function lessonOnlyProgress(
  map: Record<string, LessonProgress> | undefined,
): Record<string, LessonProgress> | undefined {
  if (!map) return map;
  const out: Record<string, LessonProgress> = {};
  for (const [key, value] of Object.entries(map)) {
    if (isHubTrackId(key)) continue;
    out[key] = value;
  }
  return out;
}

/** جمعِ ثانیه‌های مطالعهٔ کاربر در بخش‌های بستر (یا فقط یک بخش با `prefix`) */
export function hubStudiedSeconds(
  map: Record<string, LessonProgress> | undefined,
  prefix?: (typeof HUB_TRACK_PREFIXES)[number],
): number {
  if (!map) return 0;
  return Object.entries(map).reduce((sum, [key, p]) => {
    if (prefix ? !key.startsWith(prefix) : !isHubTrackId(key)) return sum;
    const s = Number.isFinite(p?.seconds) ? p.seconds : 0;
    return sum + s;
  }, 0);
}

/** چند آیتمِ بستر «تمام شد» خورده (یا فقط یک بخش با `prefix`) */
export function hubDoneCount(
  map: Record<string, LessonProgress> | undefined,
  prefix?: (typeof HUB_TRACK_PREFIXES)[number],
): number {
  if (!map) return 0;
  return Object.entries(map).filter(([key, p]) => (prefix ? key.startsWith(prefix) : isHubTrackId(key)) && p?.done === true).length;
}

// ---------- سالم‌سازی مانیفست‌ها ----------
//
// مانیفست‌ها از ریپوی دیگر می‌آیند و ممکن است در نسخه‌های بعدی فیلدِ تازه/کم
// داشته باشند؛ این‌جا هر چیزی که نمایش لازم است با مقدارِ امن پر می‌شود و
// ردیفِ واقعاً خراب کنار می‌رود. مسیرهای با پیشوندِ `content/` (مسیرِ خامِ
// ساخت در مخزن، نه آدرسِ وب) به مسیرِ نسبیِ معتبر نسبت به پایهٔ مخزن تبدیل
// می‌شوند.

/** مانیفستِ اسکچ‌نوت (`total`/`sets`)؛ اگر هیچ مجموعه‌ای سالم نبود، null */
export function normalizeSketchManifest(raw: unknown): SketchManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const sets: SketchSetMeta[] = [];
  const rawSets = r.sets;
  if (rawSets && typeof rawSets === "object" && !Array.isArray(rawSets)) {
    for (const [rawKey, value] of Object.entries(rawSets as Record<string, unknown>)) {
      const key = cleanText(rawKey, 80);
      if (!key || !value || typeof value !== "object") continue;
      const s = value as Record<string, unknown>;
      const pages = Array.isArray(s.pages)
        ? (s.pages as unknown[]).map((p) => relPath(p)).filter(Boolean)
        : [];
      sets.push({
        key,
        count: toInt(s.count),
        bytes: toInt(s.bytes),
        // اگر صفحهٔ معتبری نبود، همان قراردادِ نام‌گذاریِ مخزن: sketches/<key>.html
        pages: pages.length > 0 ? pages : [`sketches/${key}.html`],
      });
    }
  }
  if (sets.length === 0) return null;
  // ترتیبِ پایدار و معنادار: مجموعه‌های بزرگ‌تر اول
  sets.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  return {
    ...(cleanText(r.built, 200) ? { built: cleanText(r.built, 200) } : {}),
    total: toInt(r.total, sets.reduce((a, s) => a + s.count, 0)) || sets.reduce((a, s) => a + s.count, 0),
    sets,
  };
}

/** مانیفستِ آزمایشگاه؛ اگر هیچ آزمایشگاهی سالم نبود، null */
export function normalizeLabsManifest(raw: unknown): LabsManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const labs: LabMeta[] = [];
  for (const row of Array.isArray(r.labs) ? (r.labs as unknown[]) : []) {
    if (!row || typeof row !== "object") continue;
    const l = row as Record<string, unknown>;
    const key = cleanText(l.key, 80);
    const name = cleanText(l.name, 160);
    if (!key || !name) continue;
    const page = relPath(l.page) || `labs/${key}/index.html`;
    const simulator = relPath(l.simulator) || `labs/${key}/simulator.html`;
    labs.push({
      key,
      name,
      scenarios: toInt(l.scenarios),
      ...(cleanText(l.source, 200) ? { source: cleanText(l.source, 200) } : {}),
      ...(toInt(l.bytes) > 0 ? { bytes: toInt(l.bytes) } : {}),
      page,
      simulator,
    });
  }
  if (labs.length === 0) return null;

  return {
    ...(cleanText(r.built, 200) ? { built: cleanText(r.built, 200) } : {}),
    labs,
  };
}

// ---------- بارگذاری با کش (حافظه + localStorage، آفلاین‌سازگار) ----------

export interface HubLoad<T> {
  manifest: T | null;
  /** `cache` یعنی آفلاین/خطا و از کشِ محلی آمد */
  source: "network" | "cache" | "none";
  error?: string;
  /** آدرسی که واقعاً صدا زده شد (برای نمایش در تنظیمات) */
  url: string;
}

export type SketchLoad = HubLoad<SketchManifest>;
export type LabsLoad = HubLoad<LabsManifest>;

async function loadHubManifest<T>(
  path: string,
  cacheKey: string,
  normalize: (raw: unknown) => T | null,
  memoryPeek: () => HubLoad<T> | null,
  memoryPoke: (v: HubLoad<T>) => void,
  opts: { force?: boolean; timeoutMs?: number } = {},
): Promise<HubLoad<T>> {
  const url = libraryUrl(path);
  if (!opts.force) {
    const mem = memoryPeek();
    if (mem) return mem;
    const cached = readCacheEnvelope<T>(cacheKey);
    if (cached && Date.now() - cached.at < LIBRARY_STALE_MS) {
      const value: HubLoad<T> = { manifest: cached.data, source: "cache", url };
      memoryPoke(value);
      return value;
    }
  }
  const cached = readCacheEnvelope<T>(cacheKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 12_000);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const manifest = normalize(await res.json());
    if (!manifest) throw new Error("مانیفست نامعتبر بود");
    writeCacheEnvelope(cacheKey, manifest);
    const value: HubLoad<T> = { manifest, source: "network", url };
    memoryPoke(value);
    return value;
  } catch (e) {
    const message = e instanceof Error ? e.message : "مخزن در دسترس نبود";
    if (cached) {
      const value: HubLoad<T> = { manifest: cached.data, source: "cache", url, error: message };
      memoryPoke(value);
      return value;
    }
    // کشِ خراب/ناموجود — همان «در دسترس نیست» صادقانه؛ دفعه‌های بعد دوباره تلاش می‌شود
    return { manifest: null, source: "none", url, error: message };
  } finally {
    clearTimeout(timer);
  }
}

let sketchMemory: SketchLoad | null = null;
let labsMemory: LabsLoad | null = null;

/** خواندنِ مانیفستِ اسکچ‌نوت (کشِ تازه ← شبکه ← کشِ کهنه در حالتِ آفلاین) */
export function loadSketchManifest(opts: { force?: boolean; timeoutMs?: number } = {}): Promise<SketchLoad> {
  return loadHubManifest(
    "sketches/sketch-manifest.json",
    SKETCHES_CACHE_KEY,
    normalizeSketchManifest,
    () => sketchMemory,
    (v) => { sketchMemory = v; },
    opts,
  );
}

/** خواندنِ مانیفستِ آزمایشگاه (همان الگو) */
export function loadLabsManifest(opts: { force?: boolean; timeoutMs?: number } = {}): Promise<LabsLoad> {
  return loadHubManifest(
    "labs/labs-manifest.json",
    LABS_CACHE_KEY,
    normalizeLabsManifest,
    () => labsMemory,
    (v) => { labsMemory = v; },
    opts,
  );
}

/**
 * پاک‌کردنِ کشِ حافظهٔ دو مانیفستِ بستر (هم‌سنگ با `clearLibraryCache` درسنامه‌ها).
 * localStorage عمداً دست نمی‌خورد؛ برای تازه‌سازیِ کامل (وقتی آدرسِ مخزن عوض
 * می‌شود) `clearLibraryCaches()` از `libraryRepo` همهٔ کلیدهای مانیفست را پاک می‌کند.
 */
export function clearHubCaches(): void {
  sketchMemory = null;
  labsMemory = null;
}

// ---------- آدرس‌ها (همه با پایهٔ مخزن؛ override برای خودمیزبانی) ----------

/** صفحهٔ اصلیِ اسکچ‌نوت‌ها (کارت‌های دو مجموعه + جست‌وجو) */
export function sketchesHomeUrl(base?: string): string {
  return libraryUrl("sketches/index.html", base);
}

/** گالریِ یک مجموعه — مسیر از خودِ مانیفست (با fallback به قراردادِ نام‌گذاری) */
export function sketchSetUrl(set: SketchSetMeta, base?: string): string {
  return libraryUrl(set.pages[0] || `sketches/${set.key}.html`, base);
}

/** صفحهٔ اصلیِ آزمایشگاه (فهرست همهٔ شبیه‌سازها) */
export function labsHomeUrl(base?: string): string {
  return libraryUrl("labs/index.html", base);
}

/** صفحهٔ معرفی/سناریوهای یک آزمایشگاه */
export function labPageUrl(lab: LabMeta, base?: string): string {
  return libraryUrl(lab.page, base);
}

/** خودِ شبیه‌ساز (فایلِ بزرگِ خودبسنده) */
export function labSimulatorUrl(lab: LabMeta, base?: string): string {
  return libraryUrl(lab.simulator, base);
}

// ---------- متادیتای نمایش (فقط ظاهر؛ حقیقت از مانیفست می‌آید) ----------
//
// رنگ/آیکون/مسیرِ اتصال به مبحثِ اپ از خودِ صفحاتِ مخزن گرفته شده‌اند (hue همان
// `--h` صفحات است). `appSubjectKeys` همان کلیدهای پک‌های فلش‌کارت‌اند (مثلِ
// اتصالِ درسنامه‌ها) تا زمانِ مطالعه به صفحهٔ همان مبحث و تسک‌های برنامه برود.

export interface HubSubjectInfo {
  name: string;
  nameEn?: string;
  icon: string;
  hue: number;
  chroma: number;
  /** کلیدهای درسِ اپ که این بخش به آن‌ها وصل است (`Subject.sampleId`) */
  appSubjectKeys?: string[];
  blurb: string;
}

export const SKETCH_SET_INFO: Record<string, HubSubjectInfo> = {
  infectious: {
    name: "عفونی",
    nameEn: "Infectious Diseases",
    icon: "🦠",
    hue: 152,
    chroma: 58,
    appSubjectKeys: ["infectious-harrison"],
    blurb: "خلاصه‌های دست‌نویس از رویکرد به بیمار عفونی تا نکاتِ کشت و آنتی‌بیوتیک — با پیوند به درسنامهٔ تشریحیِ هر فصل.",
  },
  orthopedics: {
    name: "ارتوپدی",
    nameEn: "Orthopedics",
    icon: "🦴",
    hue: 196,
    chroma: 62,
    appSubjectKeys: ["orthopedics-alamiharandi"],
    blurb: "اسکچ‌نوت‌های اختلالات ستون فقرات تا تومورهای استخوانی — به ترتیبِ فصل، همراه با درسنامهٔ کامل.",
  },
};

export const LAB_INFO: Record<string, HubSubjectInfo> = {
  cardiac: {
    name: "شبیه‌ساز بالینی قلب",
    nameEn: "Cardiac Clinical Simulator",
    icon: "🫀",
    hue: 351,
    chroma: 68,
    appSubjectKeys: ["cardiology-nematpour", "internal-cecil"],
    blurb: "۱۸ سناریوی بالینیِ تعاملی: از شرح‌حال و معاینه تا تصمیم درمانی — با بازخوردِ مرحله‌به‌مرحله.",
  },
};

/** اطلاعاتِ نمایشِ یک مجموعه اسکچ‌نوت (با fallbackِ خنثی برای مجموعه‌های تازهٔ مخزن) */
export function sketchSetInfo(key: string): HubSubjectInfo {
  return (
    SKETCH_SET_INFO[key] ?? {
      name: key,
      icon: "🎨",
      hue: 262,
      chroma: 44,
      blurb: "خلاصه‌های تصویریِ این مجموعه از مخزنِ محتوا خوانده می‌شود.",
    }
  );
}

/** اطلاعاتِ نمایشِ یک آزمایشگاه (با fallbackِ خنثی) */
export function labInfo(key: string): HubSubjectInfo {
  return (
    LAB_INFO[key] ?? {
      name: key,
      icon: "🧪",
      hue: 258,
      chroma: 46,
      blurb: "این شبیه‌ساز از مخزنِ محتوا خوانده می‌شود.",
    }
  );
}

export interface HubTabDef {
  id: HubSection;
  label: string;
  icon: string;
}

export const HUB_TABS: HubTabDef[] = [
  { id: "sketches", label: "اسکچ‌نوت‌ها", icon: "🎨" },
  { id: "labs", label: "آزمایشگاه تعاملی", icon: "🧪" },
];

/** نمایشِ فارسیِ حجم (مثلاً «۳۱ مگابایت») */
export function formatBytesFa(bytes: number, digits: (n: number | string) => string = (n) => String(n)): string {
  const b = Math.max(0, Math.floor(Number(bytes) || 0));
  if (b < 1024) return `${digits(b)} بایت`;
  const kb = b / 1024;
  if (kb < 1024) return `${digits(Math.round(kb))} کیلوبایت`;
  const mb = kb / 1024;
  return `${digits(mb >= 100 ? Math.round(mb) : Math.round(mb * 10) / 10)} مگابایت`;
}

/** تب‌های پنجرهٔ «اسکچ‌نوت و آزمایشگاه» */
export type HubSection = "sketches" | "labs";
