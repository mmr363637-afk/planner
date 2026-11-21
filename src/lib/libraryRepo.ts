// ===== بسترِ مشترکِ مخزنِ محتوای مدیکال (گیت‌هاب Pages همان ریپوی DATA) =====
//
// این ماژول «فونداسیونِ» همهٔ بخش‌هایی است که محتوای خود را از مخزنِ جداگانهٔ
// محتوا (https://github.com/mmr363637-afk/DATA) می‌خوانند:
//
//   • کتابخانهٔ درسنامه‌ها   (src/lib/lessonLibrary.ts)
//   • کتابخانهٔ اسکچ‌نوت      (src/lib/contentHub.ts)
//   • آزمایشگاهِ تعاملی       (src/lib/contentHub.ts)
//
// چرا این‌جا؟ بدونِ این بستر، هر بخش کپیِ خودش از «آدرسِ پایهٔ مخزن»، «کلیدِ
// تنظیمِ کاربر»، «خواندن/نوشتنِ کش» و «تمیزکاری» را داشت و با اولین بهبود، یکی
// از کپی‌ها جا می‌ماند (مثلاً تغییرِ آدرسِ مخزن فقط یک مانیفست را تازه می‌کرد).
// اینجا یک‌جا و خالص نگه داشته می‌شود؛ هیچ کدام از توابع به store/قیمت/UI
// وابسته نیستند تا هر سه بخش و تست‌ها بتوانند راحت مصرفش کنند.
//
// اصلِ طراحیِ مخزن (بدون تغییر):
//   • مخزن منبعِ حقیقت است؛ اپ فقط مانیفست را (کشِ کوتاه‌مدت) نگه می‌دارد.
//   • محتوای HTML هیچ‌جا ذخیره نمی‌شود؛ هر فایل فقط هنگامِ بازکردن گرفته می‌شود.
//   • دادهٔ کاربر (زمانِ مطالعه و…) هرگز با به‌روزرسانی محتوا پاک نمی‌شود.

/** آدرسِ پیش‌فرضِ مخزن — انتشارِ GitHub Pages همان ریپوی محتوا */
export const DEFAULT_LIBRARY_BASE = "https://mmr363637-afk.github.io/DATA/lib/";
/** کلیدِ تنظیمِ کاربر برای آدرسِ مخزن (مشترک بین همهٔ بخش‌ها) */
export const LIBRARY_URL_KEY = "sp_library_url";
/** کلیدِ کشِ مانیفستِ درسنامه‌ها */
export const LIBRARY_CACHE_KEY = "sp_library_manifest_v1";
/** کلیدِ کشِ مانیفستِ اسکچ‌نوت‌ها */
export const SKETCHES_CACHE_KEY = "sp_sketches_manifest_v1";
/** کلیدِ کشِ مانیفستِ آزمایشگاه */
export const LABS_CACHE_KEY = "sp_labs_manifest_v1";
/** همهٔ کلیدهای کشِ مانیفست — یک‌جا تا تغییرِ آدرس همه را با هم تازه کند */
export const LIBRARY_CACHE_KEYS = [LIBRARY_CACHE_KEY, SKETCHES_CACHE_KEY, LABS_CACHE_KEY] as const;
/** عمرِ کش وقتی آنلاین هستیم: ۶ ساعت */
export const LIBRARY_STALE_MS = 6 * 60 * 60 * 1000;
/** سقفِ اندازهٔ مانیفستی که حاضریم در localStorage نگه داریم */
export const LIBRARY_MAX_CACHE_BYTES = 900_000;

/** آدرسِ پایهٔ مخزن: تنظیمِ کاربر یا پیش‌فرض */
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

/** متن را تمیز و کوتاه می‌کند؛ اگر رشته نبود، خالی برمی‌گرداند */
export const cleanText = (value: unknown, max: number): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** عدد صحیحِ نامنفی با fallback امن */
export const toInt = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};

/** پاکتِ کشِ مانیفست — همان شکلی که نسخهٔ قدیمیِ درسنامه‌ها می‌نوشت */
export interface CacheEnvelope<T> {
  at: number;
  versionKey?: string;
  data: T;
}

/** خواندنِ کش از localStorage؛ شکلِ خراب/ناقص یعنی «کشی در کار نیست» */
export function readCacheEnvelope<T>(key: string): CacheEnvelope<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed !== "object" || !parsed.data) return null;
    if (!Number.isFinite(Number(parsed.at))) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** نوشتنِ کش؛ اگر از سقف بزرگ‌تر بود یا سهمیه پر بود، ساکت رد می‌شود */
export function writeCacheEnvelope<T>(key: string, data: T, versionKey?: string): boolean {
  try {
    const envelope: CacheEnvelope<T> = { at: Date.now(), ...(versionKey ? { versionKey } : {}), data };
    const text = JSON.stringify(envelope);
    if (text.length > LIBRARY_MAX_CACHE_BYTES) return false;
    localStorage.setItem(key, text);
    return true;
  } catch {
    /* پر بودنِ سهمیه نباید کتابخانه را از کار بیندازد */
    return false;
  }
}

/** پاک‌کردنِ کشِ مانیفستِ همهٔ بخش‌های مخزن (درسنامه + اسکچ‌نوت + آزمایشگاه) */
export function clearLibraryCaches(): void {
  try {
    for (const key of LIBRARY_CACHE_KEYS) localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
