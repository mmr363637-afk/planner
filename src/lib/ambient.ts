// ===== موتور صداهای محیطی (Colored Noise + طبیعت/محیط + موتورهای مولد) =====
// همه‌ی صداها — از باران و رعد تا قطار و خرخرِ گربه و حتی موسیقی لوفای — به‌صورت زنده
// با Web Audio API سنتز می‌شوند و هم‌زمان روی یک خروجی مشترک میکس می‌شوند
// (هر صدا با حجم مستقل).
//
// چرا سنتز به‌جای فایل صوتی؟
//  ۱) این اپ آفلاین و تک‌فایلی است؛ هیچ دانلودی لازم نیست و چند مگابایت صوت به bundle اضافه نمی‌شود.
//  ۲) تکرارِ «بی‌درز» واقعی: بافرِ نویز به‌صورت *دوره‌ای* ساخته می‌شود (نمونه‌ی آخر دقیقاً به
//     نمونه‌ی اول وصل می‌شود)، پس نقطه‌ی loop هیچ کلیک یا درزی ندارد و گوش الگوی تکراری نمی‌شنود.
//  ۳) رعد، پرنده، جیرجیرک، قورباغه، ورق‌خوردن کاغذ و ترق‌وتروقِ آتش اساساً رویدادی‌اند؛
//     زمان‌بندی زنده‌ی آن‌ها از هر فایل لوپی طبیعی‌تر است.

import { GenerativeLofiEngine } from "./music";
import { mulberry32 } from "./random";
import { DEFAULT_AMBIENT, type AmbientSoundId, type BinauralBandId } from "../types";

// mulberry32 از lib/random می‌آید؛ این re-export برای سازگاری با importهای قدیمی است
export { mulberry32 };

export type AmbientGroupId = "nature" | "places" | "noises" | "dream" | "engines";

export interface AmbientSoundMeta {
  id: AmbientSoundId;
  label: string;
  icon: string;
  hint: string;
  group: AmbientGroupId;
}

export const AMBIENT_GROUP_META: { id: AmbientGroupId; label: string; icon: string }[] = [
  { id: "nature", label: "طبیعت، آب و باران", icon: "🌦️" },
  { id: "places", label: "مکان‌ها و سفر", icon: "🚆" },
  { id: "noises", label: "نویزهای خالص", icon: "🎛️" },
  { id: "dream", label: "آرام‌بخش و خیال‌انگیز", icon: "🧸" },
  { id: "engines", label: "موتورهای مولد", icon: "🎹" },
];

export const AMBIENT_SOUNDS: AmbientSoundMeta[] = [
  // طبیعت، آب و باران
  { id: "rain", label: "باران", icon: "🌧️", hint: "شرشر نرم باران، با موج‌های بلند و کوتاه", group: "nature" },
  { id: "thunder", label: "رعد و برق", icon: "⛈️", hint: "غرش آسمان و رعد‌های پراکنده‌ی تصادفی", group: "nature" },
  { id: "river", label: "رودخانه", icon: "🏞️", hint: "جریان آب با قل‌قل و کفِ روی آب", group: "nature" },
  { id: "forest", label: "جنگل", icon: "🌲", hint: "فضای جنگل؛ خش‌خش برگ و نسیمِ ملایم زیر درختان", group: "nature" },
  { id: "wind", label: "باد", icon: "🌬️", hint: "وزش باد با موج‌های بلند و کوتاه (گست‌ها)", group: "nature" },
  { id: "ocean", label: "موج دریا", icon: "🌊", hint: "امواج ساحلی با پاکت‌های بلندِ رفت‌وبرگشت", group: "nature" },
  { id: "waterfall", label: "آبشار", icon: "💦", hint: "غرش پرقدرت و خنکِ آب در سقوط", group: "nature" },
  { id: "rainTent", label: "باران روی چادر", icon: "⛺", hint: "بارانِ پس‌زمینه + تپ‌وتیپِ قطره‌ها روی سطح", group: "nature" },
  { id: "underwater", label: "زیر آب", icon: "🐋", hint: "سکوت آبیِ عمیق با حباب‌های گاه‌به‌گاه", group: "nature" },
  { id: "birds", label: "پرندگان", icon: "🐦", hint: "صدای گاه‌به‌گاه پرنده‌ها — برای تمرکز خاموش کن", group: "nature" },
  { id: "crickets", label: "شب و جیرجیرک", icon: "🦗", hint: "فضای شب و جیرجیرک برای مطالعه‌ی شبانه", group: "nature" },
  { id: "frogs", label: "قورباغه‌های برکه", icon: "🐸", hint: "قورقور مرتبِ کنار برکه در شب", group: "nature" },
  // مکان‌ها و سفر
  { id: "fireplace", label: "شومینه", icon: "🔥", hint: "آتشِ آرام و ترق‌وتروق چوب؛ گرم و تکرارشونده", group: "places" },
  { id: "cafe", label: "کافه", icon: "☕", hint: "همهمه‌ی خیلی ملایم و پس‌زمینه‌ایِ کافه", group: "places" },
  { id: "library", label: "کتابخانه", icon: "📚", hint: "سکوتِ اتاق مطالعه با ورق‌خوردنِ گاه‌به‌گاه", group: "places" },
  { id: "clock", label: "ساعت دیواری", icon: "🕰️", hint: "تیک‌تاکِ آرام و منظم — برای مدیریت ریتم مطالعه", group: "places" },
  { id: "train", label: "قطار", icon: "🚆", hint: "صدای ریتمیک ریل و غرشِ آرامِ حرکت", group: "places" },
  { id: "airplane", label: "کابین هواپیما", icon: "✈️", hint: "وزوز یکنواخت موتور در ارتفاع؛ حسِ «جایی نیستم»", group: "places" },
  { id: "car", label: "سفر جاده‌ای", icon: "🚗", hint: "غرش ملایم ماشین در بزرگراهِ شب", group: "places" },
  { id: "fan", label: "پنکه", icon: "🌀", hint: "هم‌هم یکنواخت و مینیمال؛ مثل نویزِ پیوسته", group: "places" },
  // نویزهای خالص
  { id: "brown", label: "نویز قهوه‌ای", icon: "🟤", hint: "Brown Noise · صدایی بم، نرم و یکنواخت", group: "noises" },
  { id: "pink", label: "نویز صورتی", icon: "🌸", hint: "Pink Noise · نرم‌تر از سفید؛ محبوب برای تمرکز و خواب", group: "noises" },
  { id: "white", label: "نویز سفید", icon: "⬜", hint: "White Noise · ماسک کامل صدای محیط", group: "noises" },
  // آرام‌بخش و خیال‌انگیز
  { id: "purr", label: "خرخر گربه", icon: "🐈", hint: "غر غرِ ریتمیک و آرام‌بخش (۲۴ هرتز لرزانه)", group: "dream" },
  { id: "space", label: "زمزمه‌ی فضا", icon: "🌌", hint: "درونِ عمیق و بی‌انتها؛ برای خیال‌پردازیِ متمرکز", group: "dream" },
  { id: "snowfall", label: "بارش برف", icon: "❄️", hint: "سکوت نرم زمستانی + نویز خیلی ملایم و خنک", group: "dream" },
  { id: "chimes", label: "بادچیم", icon: "🔔", hint: "صدای آرام و متناوب زنگوله‌های بادی", group: "dream" },
  { id: "singingBowl", label: "کاسه تبتی", icon: "🪔", hint: "طنینِ عمیق و مدیتیشنی کاسه‌ی تبتی", group: "dream" },
  // نویزهای خالصِ اضافه
  { id: "green", label: "نویز سبز", icon: "🟢", hint: "Green Noise · فرکانس میانی طبیعی؛ محبوب‌ترین برای تمرکز", group: "noises" },
  { id: "violet", label: "نویز بنفش", icon: "🟣", hint: "Violet Noise · برای ماسک Tinnitus و صدای بالای سر", group: "noises" },
  { id: "grey", label: "نویز خاکستری", icon: "⚪", hint: "Grey Noise · ادراک یکنواخت در تمام فرکانس‌ها", group: "noises" },
  // صداهای محیطیِ ویژه
  { id: "rainGlass", label: "باران روی شیشه", icon: "🪟", hint: "قطره‌های باران روی پنجره — خیلی آرام‌بخش", group: "nature" },
  { id: "pageTurn", label: "ورق‌زدن کتاب", icon: "📖", hint: "صدای ورق‌خوردنِ آرامِ صفحات کاغذی", group: "places" },
  { id: "nightCity", label: "شبِ شهری", icon: "🌃", hint: "ترافیک دور + سکوت شبانه‌ی شهر", group: "places" },
  { id: "typing", label: "صدای تایپ", icon: "⌨️", hint: "ریتمِ یکنواخت صفحه‌کلید؛ تمرکزآور", group: "places" },
  // موتورهای مولد
  { id: "music", label: "موسیقی زنده", icon: "🎹", hint: "ملودی لوفای که همین‌جا ساخته می‌شود؛ هر بار متفاوت", group: "engines" },
  { id: "binaural", label: "ضربان دوگوشی", icon: "🧠", hint: "با هدفون — اختلاف فرکانس بین دو گوش برای تمرکز عمیق", group: "engines" },
];

export const AMBIENT_IDS: AmbientSoundId[] = AMBIENT_SOUNDS.map((s) => s.id);

/** کلیدهای سریعِ کارت صدا در صفحه‌ی مطالعه (میکس کامل در میکسر است) */
export const AMBIENT_QUICK_IDS: AmbientSoundId[] = ["rain", "thunder", "brown", "white", "pink", "ocean", "fireplace", "music"];

export interface AmbientPreset {
  id: string;
  label: string;
  icon: string;
  volumes: Record<AmbientSoundId, number>;
}

/** همه‌ی لایه‌ها به‌صورت صریح تا انتخاب پریست، صدای قبلی را باقی نگذارد. */
const OFF: Record<AmbientSoundId, number> = {
  rain: 0, thunder: 0, river: 0, forest: 0, wind: 0, ocean: 0, waterfall: 0, rainTent: 0, underwater: 0, birds: 0, crickets: 0, frogs: 0,
  fireplace: 0, cafe: 0, library: 0, clock: 0, train: 0, airplane: 0, car: 0, fan: 0,
  brown: 0, pink: 0, white: 0, green: 0, violet: 0, grey: 0,
  purr: 0, space: 0, snowfall: 0, chimes: 0, singingBowl: 0,
  rainGlass: 0, pageTurn: 0, nightCity: 0, typing: 0,
  music: 0, binaural: 0,
};

/** ترکیب‌های آماده؛ همهٔ لایه‌ها صریح‌اند تا انتخاب پریست صدای قبلی را باقی نگذارد. */
export const AMBIENT_PRESETS: AmbientPreset[] = [
  { id: "storm", label: "طوفان", icon: "⛈️", volumes: { ...OFF, rain: 0.8, thunder: 0.65 } },
  { id: "drizzle", label: "باران ملایم", icon: "🌧️", volumes: { ...OFF, rain: 0.55, river: 0.18 } },
  { id: "riverside", label: "کنار رودخانه", icon: "🏞️", volumes: { ...OFF, rain: 0.12, river: 0.85 } },
  { id: "brown-focus", label: "تمرکز بم", icon: "🟤", volumes: { ...OFF, brown: 0.7 } },
  { id: "warm-rain", label: "باران گرم", icon: "☕", volumes: { ...OFF, rain: 0.45, brown: 0.45 } },
  { id: "forest", label: "جنگل", icon: "🌲", volumes: { ...OFF, forest: 0.75, birds: 0.35 } },
  { id: "forest-rain", label: "جنگل بارانی", icon: "🌧️🌲", volumes: { ...OFF, rain: 0.5, river: 0.18, forest: 0.65, birds: 0.2 } },
  { id: "beach", label: "ساحل", icon: "🏖️", volumes: { ...OFF, ocean: 0.8, wind: 0.3 } },
  { id: "campfire", label: "آتشِ شب", icon: "🔥", volumes: { ...OFF, fireplace: 0.7, crickets: 0.4, wind: 0.1 } },
  { id: "night", label: "شبِ مطالعه", icon: "🦗", volumes: { ...OFF, crickets: 0.55, brown: 0.3 } },
  { id: "cafe", label: "کافه", icon: "☕", volumes: { ...OFF, cafe: 0.6 } },
  { id: "windy", label: "بادِ ملایم", icon: "🍃", volumes: { ...OFF, wind: 0.55, brown: 0.25 } },
  { id: "fan-focus", label: "تمرکز پنکه", icon: "🌀", volumes: { ...OFF, fan: 0.7 } },
  // پریست‌های لایه‌های تازه
  { id: "white-mask", label: "ماسک سفید", icon: "⬜", volumes: { ...OFF, white: 0.75 } },
  { id: "pink-soft", label: "نرم صورتی", icon: "🌸", volumes: { ...OFF, pink: 0.7 } },
  { id: "train-ride", label: "سفر با قطار", icon: "🚆", volumes: { ...OFF, train: 0.8, brown: 0.15 } },
  { id: "flight", label: "در پرواز", icon: "✈️", volumes: { ...OFF, airplane: 0.8 } },
  { id: "road-trip", label: "جاده‌ی‌ شب", icon: "🚗", volumes: { ...OFF, car: 0.8 } },
  { id: "waterfall", label: "آبشار", icon: "💦", volumes: { ...OFF, waterfall: 0.8, birds: 0.2 } },
  { id: "deep-sea", label: "اعماق", icon: "🐋", volumes: { ...OFF, underwater: 0.85 } },
  { id: "camp-rain", label: "کمپ بارانی", icon: "⛺", volumes: { ...OFF, rainTent: 0.75, fireplace: 0.3 } },
  { id: "pond-night", label: "برکه‌ی شبانه", icon: "🐸", volumes: { ...OFF, frogs: 0.6, crickets: 0.4, brown: 0.15 } },
  { id: "study-hall", label: "سالن مطالعه", icon: "📚", volumes: { ...OFF, library: 0.6, clock: 0.25, brown: 0.2 } },
  { id: "lofi", label: "لوفای زنده", icon: "🎹", volumes: { ...OFF, music: 0.75, rain: 0.12 } },
  { id: "lofi-rain", label: "لوفای و باران", icon: "🎹🌧️", volumes: { ...OFF, music: 0.6, rain: 0.45 } },
  { id: "deep-focus", label: "تمرکز عمیق", icon: "🧠", volumes: { ...OFF, binaural: 0.5, brown: 0.35 } },
  { id: "full-mix", label: "میکس کامل", icon: "🎛️", volumes: { rain: 0.35, thunder: 0.2, river: 0.3, forest: 0.2, wind: 0.15, ocean: 0.18, waterfall: 0.12, rainTent: 0.1, underwater: 0.1, birds: 0.12, crickets: 0.1, frogs: 0.08, fireplace: 0.15, cafe: 0.12, library: 0.08, clock: 0.06, train: 0.08, airplane: 0.08, car: 0.08, fan: 0.12, brown: 0.2, pink: 0.1, white: 0.08, green: 0.12, violet: 0.05, grey: 0.08, purr: 0.08, space: 0.1, snowfall: 0.08, chimes: 0.06, singingBowl: 0.05, rainGlass: 0.15, pageTurn: 0.06, nightCity: 0.06, typing: 0.08, music: 0.12, binaural: 0.06 } },
  // پریست‌های صداهای تازه
  { id: "green-focus", label: "تمرکز سبز", icon: "🟢", volumes: { ...OFF, green: 0.7 } },
  { id: "violet-calm", label: "آرامش بنفش", icon: "🟣", volumes: { ...OFF, violet: 0.65, brown: 0.15 } },
  { id: "grey-veil", label: "پرده‌ی خاکستری", icon: "⚪", volumes: { ...OFF, grey: 0.7 } },
  { id: "glass-rain", label: "پنجره بارانی", icon: "🪟", volumes: { ...OFF, rainGlass: 0.65, brown: 0.15 } },
  { id: "study-room", label: "اتاق مطالعه", icon: "📖", volumes: { ...OFF, pageTurn: 0.2, clock: 0.15, brown: 0.2, rain: 0.15 } },
  { id: "winter-night", label: "شب زمستانی", icon: "❄️", volumes: { ...OFF, snowfall: 0.55, fireplace: 0.25, wind: 0.1 } },
  { id: "zen-garden", label: "باغ ذِن", icon: "🔔", volumes: { ...OFF, chimes: 0.3, rain: 0.2, forest: 0.25, singingBowl: 0.2 } },
  { id: "night-writer", label: "نویسنده‌ی شبانه", icon: "⌨️", volumes: { ...OFF, typing: 0.35, cafe: 0.15, brown: 0.25 } },
  { id: "tibetan-meditation", label: "مدیتیشن تبتی", icon: "🪔", volumes: { ...OFF, singingBowl: 0.45, space: 0.2, brown: 0.15 } },
];

/**
 * میکس خودکار بر اساس ساعت روز — روز را به پنج فصل می‌شکند و برای هرکدام
 * ترکیب متناسب برمی‌گرداند (تابع خالص و قابل تست).
 */
export function autoMixForHour(hour: number): Record<AmbientSoundId, number> {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h >= 5 && h < 9) return { ...OFF, birds: 0.45, rain: 0.3, river: 0.2, forest: 0.3 }; // صبح جنگلی
  if (h >= 9 && h < 13) return { ...OFF, cafe: 0.4, brown: 0.3 }; // میانه‌ی روز کاری
  if (h >= 13 && h < 17) return { ...OFF, cafe: 0.35, fan: 0.3, brown: 0.25 }; // بعدازظهر کاری
  if (h >= 17 && h < 20) return { ...OFF, forest: 0.4, ocean: 0.35, birds: 0.2 }; // عصر
  if (h >= 20) return { ...OFF, crickets: 0.45, fireplace: 0.35, brown: 0.2 }; // شب
  return { ...OFF, brown: 0.45, rain: 0.25 }; // نیمه‌شب (۰ تا ۵)
}

// ----- ضربان دوگوشی (Binaural) -----

export interface BinauralBandMeta {
  id: BinauralBandId;
  label: string;
  beat: number; // Hz اختلاف فرکانس دو گوش
  hint: string;
}

export const BINAURAL_BASE_HZ = 200;

export const BINAURAL_BANDS: BinauralBandMeta[] = [
  { id: "alpha", label: "آلفا · تمرکز آرام", beat: 10, hint: "۸–۱۲Hz — تمرکز و آرامش هوشیار" },
  { id: "beta", label: "بتا · هوشیاری", beat: 20, hint: "۱۳–۳۰Hz — ذهن فعال و حل مسئله" },
  { id: "theta", label: "تتا · خلاقیت", beat: 6, hint: "۴–۷Hz — خیال‌پردازی و مرور عمیق" },
  { id: "delta", label: "دلتا · رهایی", beat: 2, hint: "۰٫۵–۴Hz — آرامش عمیق (ترکیب با خاموشی خودکار)" },
];

export function binauralBeatOf(band: BinauralBandId): number {
  return BINAURAL_BANDS.find((b) => b.id === band)?.beat ?? 10;
}

export function defaultVolumes(): Record<AmbientSoundId, number> {
  return { ...DEFAULT_AMBIENT.volumes };
}

export function clampLevel(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** حجم‌های ذخیره‌شده (یا ناقص) را به یک رکورد کامل و معتبر تبدیل می‌کند */
export function normalizeVolumes(v: Partial<Record<AmbientSoundId, number>> | null | undefined): Record<AmbientSoundId, number> {
  const out = defaultVolumes();
  if (!v || typeof v !== "object") return out;
  for (const id of AMBIENT_IDS) out[id] = clampLevel(v[id] ?? out[id]);
  return out;
}

/**
 * Final peak protection after the compressor. Its input is attenuated by 1/2;
 * this curve restores unity gain below 0.8 and smoothly rounds only loud peaks.
 * A compressor alone can overshoot full scale when all four layers are at 100%.
 */
export function createSoftLimiterCurve(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(4097);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1) * 2 - 1) * 2;
    const magnitude = Math.abs(x);
    curve[i] = magnitude <= 0.8 ? x : Math.sign(x) * (0.8 + 0.18 * Math.tanh((magnitude - 0.8) / 0.18));
  }
  return curve;
}

// ===== ساخت نویزِ دوره‌ای (قابل loop بدون درز) =====

export type NoiseKind = "white" | "pink" | "brown";

interface PinkState {
  b0: number;
  b1: number;
  b2: number;
  b3: number;
  b4: number;
  b5: number;
  b6: number;
}

const PINK_ZERO: PinkState = { b0: 0, b1: 0, b2: 0, b3: 0, b4: 0, b5: 0, b6: 0 };

/** انتگرال‌گیر نشتی‌دار → نویز قهوه‌ای. وضعیت (state) برگردانده می‌شود تا بتوان ادامه داد. */
/** ضریب نشتیِ انتگرال‌گیر: ~۳۵Hz یعنی غرش بمِ کاملاً شنیدنی روی بلندگوی موبایل */
export const BROWN_LEAK = 0.995;

function brownPass(raw: Float32Array, prev: number): { out: Float32Array; state: number } {
  const n = raw.length;
  const out = new Float32Array(n);
  let y = prev;
  for (let i = 0; i < n; i++) {
    y = BROWN_LEAK * y + raw[i] * 0.05;
    out[i] = y;
  }
  return { out, state: y };
}

/** فیلتر صورتیِ Paul Kellet — با انتقال وضعیت بین دو پاس */
function pinkPass(raw: Float32Array, s: PinkState): { out: Float32Array; state: PinkState } {
  const n = raw.length;
  const out = new Float32Array(n);
  let { b0, b1, b2, b3, b4, b5, b6 } = s;
  for (let i = 0; i < n; i++) {
    const w = raw[i];
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.16;
    b6 = w * 0.115926;
  }
  return { out, state: { b0, b1, b2, b3, b4, b5, b6 } };
}

function normalizePeak(input: Float32Array, peak = 0.95): Float32Array {
  let max = 0;
  for (let i = 0; i < input.length; i++) {
    const v = Math.abs(input[i]);
    if (v > max) max = v;
  }
  if (max === 0) return input;
  const k = peak / max;
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = input[i] * k;
  return out;
}

/**
 * نویزی می‌سازد که *دقیقاً* با دوره‌ی `length` تکرارپذیر است.
 *
 * روش کار: فیلترهای رنگی (قهوه‌ای/صورتی) IIR پایدارند، یعنی تمام قطب‌هایشان داخل دایره‌ی
 * واحد است؛ پس اگر یک پاس را از حالت صفر بزنیم و پاس دوم را با «حالتِ پایانیِ پاس اول» شروع
 * کنیم، وضعیت فیلتر در نقطه‌ی loop عملاً به همان مقدار اولیه برگشته است (خطا در حد a^L ≈ ۰).
 * نتیجه: نمونه‌ی آخر و نمونه‌ی اول به‌هم پیوسته‌اند و loop شدن هیچ کلیک/درزی ندارد.
 */
export function generateLoopNoise(length: number, kind: NoiseKind = "white", seed = 1): Float32Array {
  const n = Math.max(2, Math.floor(length));
  const rnd = mulberry32(seed);
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) raw[i] = rnd() * 2 - 1;

  if (kind === "white") return normalizePeak(raw);

  if (kind === "brown") {
    const first = brownPass(raw, 0);
    const second = brownPass(raw, first.state);
    return normalizePeak(second.out);
  }

  const first = pinkPass(raw, PINK_ZERO);
  const second = pinkPass(raw, first.state);
  return normalizePeak(second.out);
}

// ===== موتور پخش =====

type AudioWindow = typeof window & { webkitAudioContext?: typeof AudioContext };

function audioCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as AudioWindow;
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function ambientSupported(): boolean {
  return audioCtor() !== null;
}

/** طول بافرهای نویز (ثانیه) — به‌اندازه‌ی کافی بلند تا گوش الگوی تکراری پیدا نکند */
const WHITE_SECONDS = 12;
const PINK_SECONDS = 16;
const BROWN_SECONDS = 20;

/**
 * ضریب بلندی هر لایه تا صداها در حجم‌های یکسان، هم‌تراز شنیده شوند.
 * این عددها با شبیه‌سازی همان زنجیره‌ی فیلترها بیرون از مرورگر اندازه گرفته شده‌اند:
 * با میکس پیش‌فرض، RMS خروجی حدود ۱۸- دسی‌بل و اوج آن زیر ۰ دسی‌بل می‌ماند (بدون کلیپ).
 */
const TRIM: Record<AmbientSoundId, number> = {
  rain: 0.4,
  thunder: 1.1,
  river: 0.85,
  forest: 0.85,
  wind: 0.8,
  ocean: 0.9,
  waterfall: 0.8,
  rainTent: 0.4,
  underwater: 1.0,
  birds: 1.0,
  crickets: 1.0,
  frogs: 1.0,
  fireplace: 0.9,
  cafe: 0.85,
  library: 1.0,
  clock: 1.0,
  train: 0.8,
  airplane: 0.75,
  car: 0.75,
  fan: 0.8,
  brown: 0.75,
  pink: 0.65,
  white: 0.5,
  green: 0.7,
  violet: 0.45,
  grey: 0.55,
  purr: 0.9,
  space: 0.85,
  snowfall: 0.5,
  chimes: 0.7,
  singingBowl: 0.8,
  rainGlass: 0.45,
  pageTurn: 0.6,
  nightCity: 0.5,
  typing: 0.4,
  music: 2.4, // لنگه‌های لوفای ذاتاً ظریف‌اند تا در فضای میکس آرام بنشینند
  binaural: 1.0,
};

export type FocusPhase = "work" | "break" | null;

export class AmbientEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Partial<Record<AmbientSoundId, GainNode>> = {};
  private thunderBus: GainNode | null = null;
  private buffers: { white?: AudioBuffer; pink?: AudioBuffer; brown?: AudioBuffer } = {};
  private sources: AudioBufferSourceNode[] = [];
  private lfos: OscillatorNode[] = [];
  private binauralOsc: { left: OscillatorNode; right: OscillatorNode } | null = null;
  private music = new GenerativeLofiEngine();
  private thunderTimer: ReturnType<typeof setTimeout> | null = null;
  private birdTimer: ReturnType<typeof setTimeout> | null = null;
  private cricketTimer: ReturnType<typeof setTimeout> | null = null;
  private fireTimer: ReturnType<typeof setTimeout> | null = null;
  private frogTimer: ReturnType<typeof setTimeout> | null = null;
  private clockTimer: ReturnType<typeof setTimeout> | null = null;
  private libraryTimer: ReturnType<typeof setTimeout> | null = null;
  private bubbleTimer: ReturnType<typeof setTimeout> | null = null;
  private tentDropTimer: ReturnType<typeof setTimeout> | null = null;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;
  private levels: Record<AmbientSoundId, number> = defaultVolumes();
  private masterLevel = DEFAULT_AMBIENT.master;
  private binauralBand: BinauralBandId = DEFAULT_AMBIENT.binauralBand ?? "alpha";
  /** ضریب واکنش به پومودورو: فاز استراحت → صدا نرم می‌شود */
  private duck = 1;
  private started = false;

  /** آیا موتور در حال پخش است؟ */
  get playing(): boolean {
    return this.started && this.ctx?.state === "running";
  }

  getLevels(): Record<AmbientSoundId, number> {
    return { ...this.levels };
  }

  /** ساخت/بازگردانی Context و شروع پخش؛ اگر مرورگر اجازه ندهد false برمی‌گرداند */
  async start(levels?: Partial<Record<AmbientSoundId, number>> | null, master?: number): Promise<boolean> {
    const Ctor = audioCtor();
    if (!Ctor) return false;
    if (levels) this.levels = normalizeVolumes(levels);
    if (master !== undefined) this.masterLevel = clampLevel(master);
    try {
      if (!this.ctx) {
        this.ctx = new Ctor();
        this.build();
      }
      if (this.suspendTimer) {
        clearTimeout(this.suspendTimer);
        this.suspendTimer = null;
      }
      if (this.ctx.state !== "running") await this.ctx.resume();
      if (this.ctx.state !== "running") return false;
      this.started = true;
      this.applyLevels(0.9); // fade in نرم تا صدا «پرتاب» نشود
      this.scheduleEvents(true);
      return true;
    } catch (e) {
      console.warn("ambient start failed", e);
      return false;
    }
  }

  /** توقف با fade out کوتاه، سپس suspend کردن Context تا CPU/باتری مصرف نشود */
  stop(): void {
    this.started = false;
    this.clearAllEventTimers();
    this.music.setEnabled(false);
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(0, t + 0.45);
    } catch {
      /* برخی مرورگرها در حالت suspended اجازه‌ی زمان‌بندی نمی‌دهند */
    }
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.suspendTimer = setTimeout(() => {
      this.suspendTimer = null;
      ctx.suspend?.().catch?.(() => {});
    }, 550);
  }

  setLevel(id: AmbientSoundId, value: number): void {
    this.levels[id] = clampLevel(value);
    this.applyLevels();
    if (this.started) this.scheduleEvents();
  }

  setLevels(values: Record<AmbientSoundId, number>): void {
    this.levels = normalizeVolumes(values);
    this.applyLevels();
    if (this.started) this.scheduleEvents();
  }

  setMaster(value: number): void {
    this.masterLevel = clampLevel(value);
    this.applyLevels();
  }

  /** باند ضربان دوگوشی (آلفا/بتا/تتا/دلتا) — تغییرِ زنده‌ی فرکانس */
  setBinauralBand(band: BinauralBandId): void {
    this.binauralBand = band;
    const osc = this.binauralOsc;
    const ctx = this.ctx;
    if (osc && ctx) {
      try {
        const t = ctx.currentTime;
        osc.right.frequency.cancelScheduledValues(t);
        osc.right.frequency.setValueAtTime(osc.right.frequency.value, t);
        osc.right.frequency.linearRampToValueAtTime(BINAURAL_BASE_HZ + binauralBeatOf(band), t + 0.5);
      } catch {
        osc.right.frequency.value = BINAURAL_BASE_HZ + binauralBeatOf(band);
      }
    }
  }

  /** واکنش به فاز پومودورو: در استراحت صدا نرم می‌شود و در کار به حجمِ خودِ کاربر برمی‌گردد */
  setFocusPhase(phase: FocusPhase, enabled: boolean): void {
    const next = enabled && phase === "break" ? 0.45 : 1;
    if (Math.abs(next - this.duck) < 0.001) return;
    this.duck = next;
    this.applyLevels();
  }

  get duckLevel(): number {
    return this.duck;
  }

  // ----- ساخت گراف صوتی -----

  private ensureBuffers(): void {
    const ctx = this.ctx!;
    const make = (seconds: number, kind: NoiseKind, seed: number): AudioBuffer => {
      const len = Math.max(1024, Math.floor(ctx.sampleRate * seconds));
      const data = generateLoopNoise(len, kind, seed);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      // copyToChannel در بعضی تایپ‌ها/مرورگرهای قدیمی نیست؛ set() همیشه کار می‌کند
      buf.getChannelData(0).set(data);
      return buf;
    };
    if (!this.buffers.white) this.buffers.white = make(WHITE_SECONDS, "white", 0x5eed);
    if (!this.buffers.pink) this.buffers.pink = make(PINK_SECONDS, "pink", 0x9a37);
    if (!this.buffers.brown) this.buffers.brown = make(BROWN_SECONDS, "brown", 0x1b4d);
  }

  private build(): void {
    const ctx = this.ctx!;
    this.ensureBuffers();

    // محدودکننده تا وقتی همهٔ صداها با هم بلند می‌شوند، خروجی کلیپ نکند
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 24;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.25;

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(limiter);
    const headroom = ctx.createGain();
    headroom.gain.value = 0.5;
    const peakGuard = ctx.createWaveShaper();
    peakGuard.curve = createSoftLimiterCurve();
    // No oversampling filter: the final output stays strictly below full scale.
    peakGuard.oversample = "none";
    limiter.connect(headroom).connect(peakGuard).connect(ctx.destination);
    this.master = master;

    this.buses.rain = this.buildRain(master);
    this.buses.river = this.buildRiver(master);
    this.buses.thunder = this.buildThunder(master);
    this.buses.forest = this.buildForest(master);
    this.buses.wind = this.buildWind(master);
    this.buses.fireplace = this.buildFireplace(master);
    this.buses.ocean = this.buildOcean(master);
    this.buses.cafe = this.buildCafe(master);
    this.buses.fan = this.buildFan(master);
    this.buses.brown = this.buildNoiseLayer(master, this.buffers.brown!, "brown");
    this.buses.white = this.buildNoiseLayer(master, this.buffers.white!, "white");
    this.buses.pink = this.buildNoiseLayer(master, this.buffers.pink!, "pink");
    // نویز سبز: باند میانیِ طبیعی (۲۰۰–۲۰۰۰ هرتز) — از نویز سفید فیلترشده
    this.buses.green = this.buildColoredNoise(master, this.buffers.white!, 200, 2000);
    // نویز بنفش: فرکانس‌های بالا تقویت‌شده — برای Tinnitus masking
    this.buses.violet = this.buildColoredNoise(master, this.buffers.white!, 5000, 18000);
    // نویز خاکستری: ادراک یکنواخت — فلتِ شنیداری
    this.buses.grey = this.buildGreyNoise(master);
    // باران روی شیشه: لایه‌ی پیوسته‌ی ملایم + (تپ‌های گاه‌به‌گاه بعداً)
    this.buses.rainGlass = this.buildColoredNoise(master, this.buffers.pink!, 800, 5000);
    // ورق‌زدن: لایه‌ی بسیار ملایمِ باند باریک میانی
    this.buses.pageTurn = this.buildColoredNoise(master, this.buffers.pink!, 2000, 6000);
    // برف: نویز صورتیِ خیلی بم و نرم (مثل هوای سرد)
    this.buses.snowfall = this.buildColoredNoise(master, this.buffers.pink!, 30, 1200);
    // شب شهری: نویز قهوه‌ایِ خیلی بم (صدای دور ترافیک)
    this.buses.nightCity = this.buildColoredNoise(master, this.buffers.brown!, 40, 400);
    // صدای تایپ: باند باریک تیز (مثل کلیک‌های ریز)
    this.buses.typing = this.buildColoredNoise(master, this.buffers.white!, 2000, 5000);
    // بادچیم: لایه‌ی بسیار ملایم + رویدادهای زنگ (خالی — فعلاً پایه)
    this.buses.chimes = this.emptyBus(master);
    // کاسه تبتی: تنِ سینوسی پایدار (فعلاً پایه — بعداً رویدادی می‌شود)
    this.buses.singingBowl = this.emptyBus(master);
    this.buses.train = this.buildTrain(master);
    this.buses.airplane = this.buildAirplane(master);
    this.buses.car = this.buildCar(master);
    this.buses.waterfall = this.buildWaterfall(master);
    this.buses.underwater = this.buildUnderwater(master);
    this.buses.rainTent = this.buildRainTent(master);
    this.buses.library = this.buildLibrary(master);
    this.buses.purr = this.buildPurr(master);
    this.buses.space = this.buildSpace(master);
    this.buses.binaural = this.buildBinaural(master);
    // لایه‌های کاملاً رویدادی بدون بسترِ پیوسته
    this.buses.birds = this.emptyBus(master);
    this.buses.crickets = this.emptyBus(master);
    this.buses.frogs = this.emptyBus(master);
    this.buses.clock = this.emptyBus(master);
    this.thunderBus = this.buses.thunder;
    // موتور موسیقی تولیدی — خروجی‌اش روی باسِ مخصوص خودش می‌نشیند
    const musicBus = ctx.createGain();
    musicBus.gain.value = 0;
    musicBus.connect(master);
    this.buses.music = musicBus;
    this.music.attach(ctx, musicBus, this.buffers.white ?? null);
  }

  /** یک منبع نویز حلقوی با نقطه‌ی شروع تصادفی (تا لایه‌ها هم‌فاز و «مصنوعی» نشوند) */
  private loop(buffer: AudioBuffer, rate = 1): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.playbackRate.value = rate;
    src.start(0, Math.random() * Math.max(0, buffer.duration - 0.5));
    this.sources.push(src);
    return src;
  }

  /** نوسان‌ساز کند برای زنده‌کردن صدا (تغییر طیف/حجم) — همین، تکرار را کاملاً پنهان می‌کند */
  private lfo(freq: number, depth: number, target: AudioParam, base?: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = depth;
    osc.connect(g);
    g.connect(target);
    if (base !== undefined) target.value = base;
    osc.start(0);
    this.lfos.push(osc);
  }

  private filter(type: BiquadFilterType, frequency: number, q = 0.7, gainDb = 0): BiquadFilterNode {
    const f = this.ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = q;
    if (gainDb) f.gain.value = gainDb;
    return f;
  }

  private buildRain(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // ۱) «هیس» باران: نویز سفید با طیف ۴۲۰Hz تا ۶٫۵kHz و قلّه‌ی ملایم در ۲٫۵kHz
    const lp = this.filter("lowpass", 6500, 0.6);
    const hissGain = ctx.createGain();
    this.loop(this.buffers.white!)
      .connect(this.filter("highpass", 420, 0.7))
      .connect(lp)
      .connect(this.filter("peaking", 2500, 1.1, 5))
      .connect(hissGain)
      .connect(bus);
    this.lfo(0.07, 1500, lp.frequency); // باز و بسته شدن طیف، مثل تند و کند شدن باران
    this.lfo(0.13, 0.16, hissGain.gain, 0.86);

    // ۲) «حجم» و بدنه‌ی باران: نویز صورتی در باند میانی
    const bodyGain = ctx.createGain();
    this.loop(this.buffers.pink!).connect(this.filter("bandpass", 900, 0.5)).connect(bodyGain).connect(bus);
    this.lfo(0.05, 0.12, bodyGain.gain, 0.5);

    // ۳) چک‌چک ریز قطره‌ها: باند باریک با tremolo سریع
    const dropGain = ctx.createGain();
    this.loop(this.buffers.white!)
      .connect(this.filter("bandpass", 3200, 4))
      .connect(dropGain)
      .connect(bus);
    dropGain.gain.value = 0.1;
    this.lfo(4.7, 0.07, dropGain.gain);
    this.lfo(0.31, 0.04, dropGain.gain);

    return bus;
  }

  private buildRiver(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // ۱) غرش جریان آب: نویز صورتی (طیف پُر در بم و میانی) با موجِ کُند
    const roarGain = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("highpass", 35, 0.7))
      .connect(this.filter("lowpass", 780, 0.8))
      .connect(roarGain)
      .connect(bus);
    this.lfo(0.09, 0.11, roarGain.gain, 0.85);

    // ۱ب) زیرِ بمِ آب: نویز قهوه‌ای برای «وزن» صدا
    const subGain = ctx.createGain();
    this.loop(this.buffers.brown!)
      .connect(this.filter("highpass", 24, 0.7))
      .connect(this.filter("lowpass", 120, 0.9))
      .connect(subGain)
      .connect(bus);
    this.lfo(0.07, 0.08, subGain.gain, 0.5);

    // ۲) قل‌قل آب: باند میانی با مدولاسیون سریع‌تر و نامنظم
    const babbleGain = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("bandpass", 1100, 1.2))
      .connect(babbleGain)
      .connect(bus);
    babbleGain.gain.value = 0.4;
    this.lfo(0.7, 0.16, babbleGain.gain);
    this.lfo(1.9, 0.09, babbleGain.gain);

    // ۳) کف/درخشش روی آب
    const foamGain = ctx.createGain();
    this.loop(this.buffers.white!)
      .connect(this.filter("highpass", 2000, 0.7))
      .connect(this.filter("bandpass", 4200, 2))
      .connect(foamGain)
      .connect(bus);
    foamGain.gain.value = 0.05;
    this.lfo(3.1, 0.035, foamGain.gain);

    return bus;
  }

  /**
   * لایه‌ی ساده‌ی یک رنگِ نویز به‌تنهایی (سفید/صورتی/قهوه‌ای):
   * فقط لبه‌های شنوایی تمیز می‌شوند (زیرِ شنوایی + صدایِ بیش‌ازحدِ بالا).
   */
  private buildNoiseLayer(dest: AudioNode, buffer: AudioBuffer, kind: NoiseKind): GainNode {
    const bus = this.ctx!.createGain();
    bus.gain.value = 0;
    bus.connect(dest);
    const src = this.loop(buffer);
    // هر رنگ لبه‌ی بالای مخصوص خودش را دارد تا «شخصیت»‌اش حفظ شود
    const topHz = kind === "white" ? 15500 : kind === "pink" ? 12500 : 900;
    src
      .connect(this.filter("highpass", 22, 0.7))
      .connect(this.filter("lowpass", topHz, 0.7))
      .connect(bus);
    return bus;
  }

  /** نویز رنگیِ دلخواه: سفید یا صورتی با باندپس مشخص */
  private buildColoredNoise(dest: AudioNode, buffer: AudioBuffer, lowHz: number, highHz: number): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);
    const src = this.loop(buffer);
    const midHz = Math.sqrt(lowHz * highHz);
    const q = midHz / (highHz - lowHz);
    src
      .connect(this.filter("highpass", lowHz, 0.7))
      .connect(this.filter("lowpass", highHz, 0.7))
      .connect(bus);
    // LFO کند برای طبیعی‌تر شدن
    this.lfo(0.04 + Math.random() * 0.03, 0.08, bus.gain, 0.35);
    return bus;
  }

  /** نویز خاکستری: با چند باند فیلتر موازی سعی می‌کند ادراک یکنواخت بسازد */
  private buildGreyNoise(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);
    // باند بم
    const low = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("lowpass", 300, 0.7))
      .connect(low)
      .connect(bus);
    low.gain.value = 0.4;
    // باند میانی
    const mid = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("bandpass", 1500, 1.2))
      .connect(mid)
      .connect(bus);
    mid.gain.value = 0.3;
    // باند بالا
    const high = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("bandpass", 5000, 1.5))
      .connect(high)
      .connect(bus);
    high.gain.value = 0.2;
    // Binaural: کمی stereo width با دو LFO متفاوت
    this.lfo(0.025, 0.06, bus.gain, 0.35);
    return bus;
  }

  private buildThunder(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // بسترِ غرش دوردست (همیشه هست، رعد‌های تصادفی روی آن سوار می‌شوند)
    const bedGain = ctx.createGain();
    this.loop(this.buffers.brown!)
      .connect(this.filter("highpass", 24, 0.7))
      .connect(this.filter("lowpass", 130, 0.9))
      .connect(bedGain)
      .connect(bus);
    this.lfo(0.06, 0.13, bedGain.gain, 0.45);
    this.lfo(0.023, 0.06, bedGain.gain); // موج بسیار کند دوم تا غرش یکنواخت نماند

    return bus;
  }

  /** باسِ ساکت برای صداهای کاملاً «رویدادی» (پرنده/جیرجیرک/قورباغه/ساعت) که لایه‌ی پیوسته ندارند */
  private emptyBus(dest: AudioNode): GainNode {
    const bus = this.ctx!.createGain();
    bus.gain.value = 0;
    bus.connect(dest);
    return bus;
  }

  /** جنگل: نسیمِ ملایم زیر تاج درختان + خش‌خش‌های ریز برگ */
  private buildForest(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // نسیم در تاج درختان: بدنه‌ی صورتیِ بم با موجِ کُند
    const canopy = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("highpass", 40, 0.7))
      .connect(this.filter("lowpass", 700, 0.8))
      .connect(canopy)
      .connect(bus);
    this.lfo(0.06, 0.14, canopy.gain, 0.7);
    this.lfo(0.021, 0.05, canopy.gain);

    // خش‌خش برگ: باند باریکِ میانی با tremoloی تند و نامنظم
    const rustle = ctx.createGain();
    this.loop(this.buffers.white!)
      .connect(this.filter("bandpass", 2900, 3))
      .connect(rustle)
      .connect(bus);
    rustle.gain.value = 0.16;
    this.lfo(0.4, 0.07, rustle.gain);
    this.lfo(1.6, 0.045, rustle.gain);

    // شاخ‌وبرگِ دورتر: بمِ میانی ملایم
    const bough = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("bandpass", 480, 1.6))
      .connect(bough)
      .connect(bus);
    this.lfo(0.09, 0.05, bough.gain, 0.18);

    return bus;
  }

  /** باد: بدنه‌ی بم با جابه‌جاییِ طیف (گست‌ها) + لایه‌ی هواییِ سوت‌مانند */
  private buildWind(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // بدنه‌ی باد: نویز صورتی که برشِ زیرِ آن کم‌وکم می‌شود (وزشِ تند/آرام)
    const gust = ctx.createGain();
    const lp = this.filter("lowpass", 650, 0.7);
    this.loop(this.buffers.pink!)
      .connect(this.filter("highpass", 35, 0.7))
      .connect(lp)
      .connect(gust)
      .connect(bus);
    this.lfo(0.05, 320, lp.frequency);
    this.lfo(0.11, 0.16, gust.gain, 0.8);

    // لایه‌ی «سوتِ» باد: باند باریک که مرکزش می‌لرزد تا صدای عبور هوا دهد
    const air = ctx.createGain();
    const bp = this.filter("bandpass", 950, 2.2);
    this.loop(this.buffers.white!)
      .connect(this.filter("highpass", 300, 0.7))
      .connect(bp)
      .connect(air)
      .connect(bus);
    air.gain.value = 0.16;
    this.lfo(0.09, 620, bp.frequency);
    this.lfo(0.23, 0.05, air.gain);

    return bus;
  }

  /** شومینه: غرشِ بمِ آرامِ آتش + ترق‌وتروقِ تصادفیِ چوب (روی یک زمان‌بند) */
  private buildFireplace(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // غرشِ آتش: بمِ قهوه‌ایِ گرم با درخششِ کُند
    const roar = ctx.createGain();
    this.loop(this.buffers.brown!)
      .connect(this.filter("highpass", 22, 0.7))
      .connect(this.filter("lowpass", 150, 0.9))
      .connect(roar)
      .connect(bus);
    this.lfo(0.07, 0.13, roar.gain, 0.5);
    this.lfo(0.4, 0.05, roar.gain);

    // لایه‌ی «درخش»ِ زیرینِ آتش
    const glow = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("bandpass", 900, 0.6))
      .connect(glow)
      .connect(bus);
    this.lfo(0.55, 0.09, glow.gain, 0.28);

    return bus;
  }

  /** امواج ساحل: ورود/خروجِ آب با پاکتِ بلندِ موج‌ها */
  private buildOcean(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // «شرشرِ» شکستن موج: بدنه‌ی صورتی که حجمش با ریتمِ موج بالا/پایین می‌رود
    const swell = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("highpass", 30, 0.7))
      .connect(this.filter("lowpass", 600, 0.7))
      .connect(swell)
      .connect(bus);
    this.lfo(0.055, 0.3, swell.gain, 0.35); // موجِ بلندِ رفت‌وبرگشت
    this.lfo(0.16, 0.12, swell.gain);

    // «کفِ» اوجِ موج: هیسِ بالای موج که هم‌زمان با اوج بلند می‌شود
    const foam = ctx.createGain();
    this.loop(this.buffers.white!)
      .connect(this.filter("highpass", 2000, 0.7))
      .connect(this.filter("bandpass", 4300, 2))
      .connect(foam)
      .connect(bus);
    foam.gain.value = 0.06;
    this.lfo(0.055, 0.05, foam.gain);
    this.lfo(0.3, 0.03, foam.gain);

    return bus;
  }

  /** کافه: همهمه‌ی بسیار ملایم و پس‌زمینه‌ایِ جمعیت — چند لایه‌ی مستقل و دگرگون‌شونده */
  private buildCafe(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // «زمزمه»ی اصلی مردم: نویز صورتیِ باند میانی که سطحش آرام جابه‌جا می‌شود
    const murmur = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("bandpass", 900, 0.5))
      .connect(murmur)
      .connect(bus);
    this.lfo(0.13, 0.12, murmur.gain, 0.8);
    this.lfo(0.7, 0.05, murmur.gain);

    // لایه‌ی دومِ گفت‌وگو (با فاصله‌ی کمی متفاوت تا یکدست نشود)
    const talk = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("bandpass", 1600, 0.9))
      .connect(talk)
      .connect(bus);
    this.lfo(0.19, 0.09, talk.gain, 0.45);

    // خش‌خشِ تُنُکِ ظرف‌ها: هیسِ خیلی پایین
    const clinkBed = ctx.createGain();
    this.loop(this.buffers.white!)
      .connect(this.filter("highpass", 4000, 0.7))
      .connect(clinkBed)
      .connect(bus);
    this.lfo(0.3, 0.02, clinkBed.gain, 0.03);

    return bus;
  }

  /** پنکه: هم‌همِ یکنواخت و مینیمال (باندِ پهنِ کوتاه‌شده با لرزشِ محسوسِ خیلی کم) */
  private buildFan(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    const fan = ctx.createGain();
    this.loop(this.buffers.white!)
      .connect(this.filter("highpass", 150, 0.7))
      .connect(this.filter("lowpass", 950, 0.7))
      .connect(fan)
      .connect(bus);
    fan.gain.value = 0.85;
    // لرزشِ تقریباً نامحسوس تا حتی همین «ماشینِ نویز» هم مصنوعیِ ساکن نباشد
    this.lfo(0.9, 0.02, fan.gain);

    // کمی «وزوز»یِ ماشینیِ بم
    const hum = ctx.createGain();
    this.loop(this.buffers.brown!)
      .connect(this.filter("lowpass", 90, 0.9))
      .connect(hum)
      .connect(bus);
    hum.gain.value = 0.3;

    return bus;
  }

  /** قطار: غرشِ حرکت + ریتمِ ریل (بوژی‌ها روی درزهای ریل) */
  private buildTrain(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // غرشِ حرکت: بمِ قهوه‌ای با نوسانِ خیلی کُند
    const rumble = ctx.createGain();
    this.loop(this.buffers.brown!)
      .connect(this.filter("highpass", 24, 0.7))
      .connect(this.filter("lowpass", 170, 0.9))
      .connect(rumble)
      .connect(bus);
    this.lfo(0.05, 0.1, rumble.gain, 0.85);

    // ریتمِ ریل: «کاترُک… کاترُک» — دو LFO با فرکانس نسبت ۲:۱ روی یک باندِ میانی
    const clack = ctx.createGain();
    const bp = this.filter("bandpass", 750, 1.1);
    this.loop(this.buffers.pink!)
      .connect(this.filter("highpass", 180, 0.7))
      .connect(bp)
      .connect(clack)
      .connect(bus);
    this.lfo(1.55, 0.3, clack.gain, 0.42);
    this.lfo(3.1, 0.14, clack.gain);

    // سوتِ ریزِ ریل در سرعت، خیلی خفیف
    const whine = ctx.createGain();
    this.loop(this.buffers.white!)
      .connect(this.filter("bandpass", 2500, 4))
      .connect(whine)
      .connect(bus);
    whine.gain.value = 0.05;
    this.lfo(0.17, 0.02, whine.gain);

    return bus;
  }

  /** کابین هواپیما: وزوزِ پیوسته‌ی موتور + هیسِ تهویه + هامِ بم */
  private buildAirplane(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // بدنه‌ی موتور: قهوه‌ایِ بم با نوسانِ خیلی کُند (تغییر دورِ موتور)
    const drone = ctx.createGain();
    this.loop(this.buffers.brown!)
      .connect(this.filter("highpass", 26, 0.7))
      .connect(this.filter("lowpass", 260, 0.8))
      .connect(drone)
      .connect(bus);
    this.lfo(0.11, 0.07, drone.gain, 0.9);

    // هیسِ تهویه/باد بیرون: صورتی در باندِ بالا
    const air = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("highpass", 700, 0.7))
      .connect(this.filter("lowpass", 4200, 0.7))
      .connect(air)
      .connect(bus);
    air.gain.value = 0.16;
    this.lfo(0.23, 0.03, air.gain);

    // هامِ پایدارِ الکتریکی ۱۲۰ هرتز — «قلب» کابین
    const humOsc = ctx.createOscillator();
    humOsc.type = "sine";
    humOsc.frequency.value = 120;
    const hum = ctx.createGain();
    hum.gain.value = 0.035;
    humOsc.connect(hum).connect(bus);
    humOsc.start(0);
    this.lfos.push(humOsc);

    return bus;
  }

  /** سفر جاده‌ای: غرشِ موتور + جاده + هیسِ باد آرام کنار پنجره */
  private buildCar(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // جاده: صورتیِ بم-میانی با نوسانِ کُند (جاده‌های متفاوت!)
    const road = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("highpass", 45, 0.7))
      .connect(this.filter("lowpass", 620, 0.7))
      .connect(road)
      .connect(bus);
    this.lfo(0.045, 0.13, road.gain, 0.75);

    // موتور: بمِ قهوه‌ای یکنواخت
    const engine = ctx.createGain();
    this.loop(this.buffers.brown!)
      .connect(this.filter("lowpass", 130, 0.9))
      .connect(engine)
      .connect(bus);
    engine.gain.value = 0.45;

    // بادِ کنار شیشه، خیلی نرم
    const leak = ctx.createGain();
    this.loop(this.buffers.white!)
      .connect(this.filter("highpass", 1500, 0.7))
      .connect(this.filter("lowpass", 6000, 0.7))
      .connect(leak)
      .connect(bus);
    leak.gain.value = 0.05;
    this.lfo(0.09, 0.02, leak.gain);

    return bus;
  }

  /** آبشار: دیوارِ آب — سفیدِ پهن + بدنه‌ی صورتی + پایه‌ی قهوه‌ای */
  private buildWaterfall(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // پرده‌ی اصلی آب
    const sheet = ctx.createGain();
    this.loop(this.buffers.white!)
      .connect(this.filter("highpass", 300, 0.7))
      .connect(this.filter("lowpass", 9000, 0.7))
      .connect(sheet)
      .connect(bus);
    this.lfo(0.07, 0.12, sheet.gain, 0.8);

    // بدنه‌ی سنگینِ سقوط
    const mass = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("lowpass", 850, 0.8))
      .connect(mass)
      .connect(bus);
    this.lfo(0.11, 0.1, mass.gain, 0.55);

    // لرزشِ زمینیِ زیر آبشار
    const ground = ctx.createGain();
    this.loop(this.buffers.brown!)
      .connect(this.filter("lowpass", 120, 0.9))
      .connect(ground)
      .connect(bus);
    ground.gain.value = 0.3;

    return bus;
  }

  /** زیر آب: فشارِ خفه‌ی آبی + حباب‌های رویدادی */
  private buildUnderwater(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // «فشار» آب: صورتیِ خیلی خفه با تنفسِ کُند
    const pressure = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("lowpass", 210, 0.9))
      .connect(pressure)
      .connect(bus);
    this.lfo(0.05, 0.12, pressure.gain, 0.85);

    // عمق: بمِ قهوه‌ایِ یکدست
    const depth = ctx.createGain();
    this.loop(this.buffers.brown!)
      .connect(this.filter("lowpass", 95, 0.9))
      .connect(depth)
      .connect(bus);
    depth.gain.value = 0.4;

    // سوسوی نورِ آب: باندِ باریکِ بسیار آرام
    const shimmer = ctx.createGain();
    this.loop(this.buffers.white!)
      .connect(this.filter("bandpass", 1200, 3))
      .connect(shimmer)
      .connect(bus);
    shimmer.gain.value = 0.05;
    this.lfo(0.13, 0.045, shimmer.gain);

    return bus;
  }

  /** باران روی چادر: بارانِ نرم + تپ‌وتیپِ رویدادی قطره‌ها روی پارچه */
  private buildRainTent(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // بارانِ میدانِ نزدیک‌تر از لایه‌ی open-air: بم‌تر و فشرده‌تر
    const patter = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("highpass", 90, 0.7))
      .connect(this.filter("bandpass", 760, 0.6))
      .connect(patter)
      .connect(bus);
    this.lfo(0.1, 0.13, patter.gain, 0.75);

    // هیسِ نرمِ باران اطراف
    const around = ctx.createGain();
    this.loop(this.buffers.white!)
      .connect(this.filter("highpass", 520, 0.7))
      .connect(this.filter("lowpass", 5400, 0.7))
      .connect(around)
      .connect(bus);
    around.gain.value = 0.2;
    this.lfo(0.16, 0.06, around.gain);

    return bus;
  }

  /** کتابخانه: سکوتِ «پُر» اتاق مطالعه + ورق‌خوردنِ رویدادی */
  private buildLibrary(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // «سکوتِ پر»: room-tone بسیار ظریف تا فضا مُرده نباشد
    const room = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("highpass", 70, 0.7))
      .connect(this.filter("lowpass", 380, 0.8))
      .connect(room)
      .connect(bus);
    room.gain.value = 0.14;
    this.lfo(0.04, 0.04, room.gain);

    return bus;
  }

  /** خرخر گربه: بمِ لرزان در ریتمِ ۲۰–۳۰ هرتز + تنفسِ بسیار کُند */
  private buildPurr(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // بدنه‌ی خرخر: قهوه‌ایِ بم
    const lp = this.filter("lowpass", 380, 0.8);
    const purr = ctx.createGain();
    this.loop(this.buffers.brown!)
      .connect(this.filter("highpass", 30, 0.7))
      .connect(lp)
      .connect(purr)
      .connect(bus);
    // لرزشِ سریعِ خودِ خرخر (تریل)
    this.lfo(23, 0.34, purr.gain, 0.6);
    // در باز و بسته شدنِ فیلتر، لرزه‌ی نرمِ تند
    this.lfo(23, 130, lp.frequency);
    // نفسِ گربه: خیلی کُند
    this.lfo(0.21, 0.08, purr.gain);

    // زیرِ بمِ یکدست
    const sub = ctx.createGain();
    this.loop(this.buffers.brown!)
      .connect(this.filter("lowpass", 85, 0.9))
      .connect(sub)
      .connect(bus);
    sub.gain.value = 0.35;

    return bus;
  }

  /** زمزمه‌ی فضا: درونِ عمیق — قهوه‌ایِ خیلی بم با سوسوی آهسته‌ی طیف */
  private buildSpace(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // درونِ اصلی
    const drone = ctx.createGain();
    const lp = this.filter("lowpass", 320, 0.6);
    this.loop(this.buffers.brown!)
      .connect(this.filter("highpass", 20, 0.7))
      .connect(lp)
      .connect(drone)
      .connect(bus);
    drone.gain.value = 0.85;
    // سوسوی بسیار کُندِ طیف — حسِ حرکت در خلأ
    this.lfo(0.028, 210, lp.frequency);
    this.lfo(0.05, 0.09, drone.gain);

    // برقِ دورِ کهکشان: باندِ باریکِ بسیار ظریف
    const halo = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("bandpass", 900, 5))
      .connect(halo)
      .connect(bus);
    halo.gain.value = 0.04;
    this.lfo(0.07, 0.03, halo.gain);

    return bus;
  }

  /** ضربان دوگوشی: دو اسیلاتور خالص با اختلافِ چند هرتز، پن به دو گوش */
  private buildBinaural(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    const beat = binauralBeatOf(this.binauralBand);
    const left = ctx.createOscillator();
    left.type = "sine";
    left.frequency.value = BINAURAL_BASE_HZ;
    const right = ctx.createOscillator();
    right.type = "sine";
    right.frequency.value = BINAURAL_BASE_HZ + beat;

    // تون‌ها به‌سرعت خسته‌کننده‌اند؛ هر دو را خیلی کم به‌هر گوش می‌دهیم
    const gL = ctx.createGain();
    gL.gain.value = 0.09;
    const gR = ctx.createGain();
    gR.gain.value = 0.09;

    if (typeof ctx.createStereoPanner === "function") {
      const panL = ctx.createStereoPanner();
      panL.pan.value = -1;
      const panR = ctx.createStereoPanner();
      panR.pan.value = 1;
      left.connect(gL).connect(panL).connect(bus);
      right.connect(gR).connect(panR).connect(bus);
    } else {
      // مرورگرهای قدیمی: بدون جداسازی (فقط ضربانِ مونو)
      left.connect(gL).connect(bus);
      right.connect(gR).connect(bus);
    }
    left.start(0);
    right.start(0);
    this.lfos.push(left, right);
    this.binauralOsc = { left, right };

    return bus;
  }

  // ----- زمان‌بندهای رویدادی: رعد، پرنده، جیرجیرک، آتش، قورباغه، ساعت، کاغذ و حباب ----

  /** همه‌ی صداهایِ رویدادی را زمان‌بندی می‌کند (بسته به اینکه کدام حجم دارند) */
  private scheduleEvents(first = false): void {
    this.scheduleThunder(first);
    this.scheduleBirds();
    this.scheduleCrickets();
    this.scheduleFire();
    this.scheduleFrogs();
    this.scheduleClock();
    this.scheduleLibrary();
    this.scheduleBubbles();
    this.scheduleTentDrops();
  }

  private clearAllEventTimers(): void {
    this.clearThunderTimer();
    this.clearBirdTimer();
    this.clearCricketTimer();
    this.clearFireTimer();
    this.clearFrogTimer();
    this.clearClockTimer();
    this.clearLibraryTimer();
    this.clearBubbleTimer();
    this.clearTentDropTimer();
  }

  private clearBirdTimer(): void {
    if (this.birdTimer !== null) {
      clearTimeout(this.birdTimer);
      this.birdTimer = null;
    }
  }

  private clearCricketTimer(): void {
    if (this.cricketTimer !== null) {
      clearTimeout(this.cricketTimer);
      this.cricketTimer = null;
    }
  }

  private clearFireTimer(): void {
    if (this.fireTimer !== null) {
      clearTimeout(this.fireTimer);
      this.fireTimer = null;
    }
  }

  private clearFrogTimer(): void {
    if (this.frogTimer !== null) {
      clearTimeout(this.frogTimer);
      this.frogTimer = null;
    }
  }

  private clearClockTimer(): void {
    if (this.clockTimer !== null) {
      clearTimeout(this.clockTimer);
      this.clockTimer = null;
    }
  }

  private clearLibraryTimer(): void {
    if (this.libraryTimer !== null) {
      clearTimeout(this.libraryTimer);
      this.libraryTimer = null;
    }
  }

  private clearBubbleTimer(): void {
    if (this.bubbleTimer !== null) {
      clearTimeout(this.bubbleTimer);
      this.bubbleTimer = null;
    }
  }

  private clearTentDropTimer(): void {
    if (this.tentDropTimer !== null) {
      clearTimeout(this.tentDropTimer);
      this.tentDropTimer = null;
    }
  }

  // --- پرندگان ---

  private scheduleBirds(): void {
    this.clearBirdTimer();
    if (!this.started || !this.ctx) return;
    const level = this.levels.birds;
    if (level <= 0.001) return; // خاموش است؛ صدایی زمان‌بندی نمی‌شود
    // هرچه حجم بیشتر → پرنده‌ها پراکنده‌تر و بیشتر
    const gap = Math.max(1800, 4200 + Math.random() * 8000 - level * 2600);
    this.birdTimer = setTimeout(() => {
      this.birdTimer = null;
      this.birdCall(level);
      this.scheduleBirds();
    }, gap);
  }

  /** یک «جمله»ی پرنده: ۱ تا ۳ جیغ‌جیغِ کوتاه با فاصله */
  private birdCall(level: number): void {
    const ctx = this.ctx;
    const bus = this.buses.birds;
    if (!ctx || !bus || !this.started) return;
    const count = 1 + Math.floor(Math.random() * 3);
    let at = ctx.currentTime + 0.03 + Math.random() * 0.4;
    for (let i = 0; i < count; i++) {
      this.birdChirp(at, bus, 0.5 + level * 0.5);
      at += 0.2 + Math.random() * 0.8;
    }
  }

  /** یک جیغِ کوتاهِ پرنده: سینوس با شیبِ فرکانسِ بالا→پایین (دومرحله‌ای) */
  private birdChirp(t0: number, bus: GainNode, amp: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const dur = 0.12 + Math.random() * 0.2;
    const base = 2800 + Math.random() * 1900;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(base, t0);
    osc.frequency.exponentialRampToValueAtTime(base * 1.7, t0 + dur * 0.5);
    osc.frequency.exponentialRampToValueAtTime(base * 0.9, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.12 * amp, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(bus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
    osc.onended = () => {
      try {
        osc.disconnect();
        g.disconnect();
      } catch {
        /* already disconnected */
      }
    };
  }

  // --- شب / جیرجیرک ---

  private scheduleCrickets(): void {
    this.clearCricketTimer();
    if (!this.started || !this.ctx) return;
    const level = this.levels.crickets;
    if (level <= 0.001) return;
    // جیرجیرک‌ها در توالی‌های موزون می‌خوانند؛ با حجم بیشتر تندتر
    const gap = Math.max(500, 1100 + Math.random() * 900 - level * 600);
    this.cricketTimer = setTimeout(() => {
      this.cricketTimer = null;
      this.cricketTrill(level);
      this.scheduleCrickets();
    }, gap);
  }

  /** یک «تریل»ی کوتاه از ۱ تا ۳ جیرجیرکِ هم‌زمان در فرکانس‌های کمی متفاوت */
  private cricketTrill(level: number): void {
    const ctx = this.ctx;
    const bus = this.buses.crickets;
    if (!ctx || !bus || !this.started) return;
    const t0 = ctx.currentTime + 0.01;
    const count = Math.random() < 0.45 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const freq = 3600 + Math.random() * 1600 + i * 120;
      // هر جیرجیرک = دو پالسِ کوتاه و تیز
      this.cricketPulse(t0, freq, bus, 0.3 + level * 0.7);
      this.cricketPulse(t0 + 0.06, freq, bus, 0.3 + level * 0.7);
    }
  }

  private cricketPulse(t0: number, freq: number, bus: GainNode, amp: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    const dur = 0.04 + Math.random() * 0.03;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.18 * amp, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(bus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    osc.onended = () => {
      try {
        osc.disconnect();
        g.disconnect();
      } catch {
        /* already disconnected */
      }
    };
  }

  // --- قورباغه‌های برکه (قورقورِ ریتمیکِ شب) ---

  private scheduleFrogs(): void {
    this.clearFrogTimer();
    if (!this.started || !this.ctx) return;
    const level = this.levels.frogs;
    if (level <= 0.001) return;
    const gap = Math.max(900, 1600 + Math.random() * 3600 - level * 900);
    this.frogTimer = setTimeout(() => {
      this.frogTimer = null;
      this.frogCroak(level);
      this.scheduleFrogs();
    }, gap);
  }

  /** یک قورقور: ۲ تا ۴ پالسِ کوتاه پشت‌سرهم روی یک نتِ بم */
  private frogCroak(level: number): void {
    const ctx = this.ctx;
    const bus = this.buses.frogs;
    if (!ctx || !bus || !this.started) return;
    const t0 = ctx.currentTime + 0.02;
    const pulses = 2 + Math.floor(Math.random() * 3);
    const base = 150 + Math.random() * 90;
    for (let i = 0; i < pulses; i++) {
      const at = t0 + i * (0.12 + Math.random() * 0.05);
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(base * 1.2, at);
      osc.frequency.exponentialRampToValueAtTime(base * 0.8, at + 0.09);
      const lp = this.filter("lowpass", 480, 0.8);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.11 * (0.4 + level * 0.6), at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
      osc.connect(lp).connect(g).connect(bus);
      osc.start(at);
      osc.stop(at + 0.12);
      osc.onended = () => {
        try {
          osc.disconnect();
          lp.disconnect();
          g.disconnect();
        } catch {
          /* already disconnected */
        }
      };
    }
  }

  // --- ساعت دیواری (تیک‌تاکِ دقیقِ ثانیه‌ای) ---

  private scheduleClock(): void {
    this.clearClockTimer();
    if (!this.started || !this.ctx) return;
    const level = this.levels.clock;
    if (level <= 0.001) return;
    this.clockTimer = setTimeout(() => {
      this.clockTimer = null;
      this.clockTick(level);
      this.scheduleClock();
    }, 1000);
  }

  private clockTickCount = 0;

  /** تیک/تاک: دو کلیک متفاوتِ باریک تا ریتم «یک‌درمیان» حس شود */
  private clockTick(level: number): void {
    const ctx = this.ctx;
    const bus = this.buses.clock;
    if (!ctx || !bus || !this.started || !this.buffers.white) return;
    this.clockTickCount++;
    const tock = this.clockTickCount % 2 === 0;
    const t0 = ctx.currentTime + 0.01;
    const src = ctx.createBufferSource();
    src.buffer = this.buffers.white;
    src.loop = true;
    src.playbackRate.value = 1.6;
    const bp = this.filter("bandpass", tock ? 3400 : 4300, 6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.13 * (0.4 + level * 0.6), t0 + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.035);
    src.connect(bp).connect(g).connect(bus);
    src.start(t0, Math.random() * 3);
    src.stop(t0 + 0.05);
    src.onended = () => {
      try {
        src.disconnect();
        bp.disconnect();
        g.disconnect();
      } catch {
        /* already disconnected */
      }
    };
  }

  // --- کتابخانه: ورق‌خوردنِ کاغذ و حرکت‌های کوچک ---

  private scheduleLibrary(): void {
    this.clearLibraryTimer();
    if (!this.started || !this.ctx) return;
    const level = this.levels.library;
    if (level <= 0.001) return;
    const gap = Math.max(4000, 8000 + Math.random() * 13000 - level * 4000);
    this.libraryTimer = setTimeout(() => {
      this.libraryTimer = null;
      this.pageTurn(level);
      this.scheduleLibrary();
    }, gap);
  }

  /** ورقِ برگ: جارویِ باردکی از پایین به بالا با خش‌خش نرم */
  private pageTurn(level: number): void {
    const ctx = this.ctx;
    const bus = this.buses.library;
    if (!ctx || !bus || !this.started || !this.buffers.white) return;
    const t0 = ctx.currentTime + 0.02;
    const dur = 0.3 + Math.random() * 0.15;
    const src = ctx.createBufferSource();
    src.buffer = this.buffers.white;
    src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.3;
    const bp = this.filter("bandpass", 700, 0.9);
    bp.frequency.setValueAtTime(700, t0);
    bp.frequency.exponentialRampToValueAtTime(2400, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.05 * (0.4 + level * 0.6), t0 + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp).connect(g).connect(bus);
    src.start(t0, Math.random() * 4);
    src.stop(t0 + dur + 0.05);
    src.onended = () => {
      try {
        src.disconnect();
        bp.disconnect();
        g.disconnect();
      } catch {
        /* already disconnected */
      }
    };
    // گاهی ورقِ دوم بلافاصله بعد
    if (Math.random() < 0.3 && this.started) {
      setTimeout(() => this.pageTurn(level * 0.7), 600 + Math.random() * 500);
    }
  }

  // --- زیر آب: حباب‌های رو به بالا ---

  private scheduleBubbles(): void {
    this.clearBubbleTimer();
    if (!this.started || !this.ctx) return;
    const level = this.levels.underwater;
    if (level <= 0.001) return;
    const gap = Math.max(1200, 1800 + Math.random() * 4200 - level * 1200);
    this.bubbleTimer = setTimeout(() => {
      this.bubbleTimer = null;
      this.bubbleRise(level);
      this.scheduleBubbles();
    }, gap);
  }

  /** زنجیره‌ای از چند حباب: سینوسِ سریعِ بالارونده با دامنه‌ی کم */
  private bubbleRise(level: number): void {
    const ctx = this.ctx;
    const bus = this.buses.underwater;
    if (!ctx || !bus || !this.started) return;
    const t0 = ctx.currentTime + 0.02;
    let at = t0;
    const count = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
      const dur = 0.08 + Math.random() * 0.08;
      const from = 350 + Math.random() * 250;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(from, at);
      osc.frequency.exponentialRampToValueAtTime(from * 2.1, at + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.05 * (0.4 + level * 0.6), at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(g).connect(bus);
      osc.start(at);
      osc.stop(at + dur + 0.02);
      osc.onended = () => {
        try {
          osc.disconnect();
          g.disconnect();
        } catch {
          /* already disconnected */
        }
      };
      at += dur * (0.6 + Math.random() * 0.6);
    }
  }

  // --- باران روی چادر: تپ‌وتیپِ قطره ---

  private scheduleTentDrops(): void {
    this.clearTentDropTimer();
    if (!this.started || !this.ctx) return;
    const level = this.levels.rainTent;
    if (level <= 0.001) return;
    const gap = Math.max(300, 520 + Math.random() * 1200 - level * 500);
    this.tentDropTimer = setTimeout(() => {
      this.tentDropTimer = null;
      this.tentPlop(level);
      this.scheduleTentDrops();
    }, gap);
  }

  /** تپِ قطره روی پارچه: سینوسِ نزولیِ کوتاه + کلیکِ خفیف */
  private tentPlop(level: number): void {
    const ctx = this.ctx;
    const bus = this.buses.rainTent;
    if (!ctx || !bus || !this.started) return;
    const t0 = ctx.currentTime + 0.01;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    const from = 500 + Math.random() * 350;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(from * 0.45, t0 + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.09 * (0.4 + level * 0.6), t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
    osc.connect(g).connect(bus);
    osc.start(t0);
    osc.stop(t0 + 0.09);
    osc.onended = () => {
      try {
        osc.disconnect();
        g.disconnect();
      } catch {
        /* already disconnected */
      }
    };
  }

  // --- ترق‌وتروقِ آتش ---

  private scheduleFire(): void {
    this.clearFireTimer();
    if (!this.started || !this.ctx) return;
    const level = this.levels.fireplace;
    if (level <= 0.001) return;
    const gap = 250 + Math.random() * 900;
    this.fireTimer = setTimeout(() => {
      this.fireTimer = null;
      this.firePop(level);
      this.scheduleFire();
    }, gap);
  }

  private firePop(level: number): void {
    const ctx = this.ctx;
    const bus = this.buses.fireplace;
    if (!ctx || !bus || !this.started) return;
    const t0 = ctx.currentTime + 0.01;
    const count = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      this.cracklePop(t0 + i * (0.04 + Math.random() * 0.15), bus, 0.3 + level * 0.7);
    }
  }

  /** یک ترقِ کوتاهِ چوب: نویزِ سفیدِ فیلترشده با پوسیدگیِ تند */
  private cracklePop(t0: number, bus: GainNode, amp: number): void {
    const ctx = this.ctx;
    const buf = this.buffers.white;
    if (!ctx || !buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const hp = this.filter("highpass", 2500 + Math.random() * 2500, 0.7);
    const dur = 0.04 + Math.random() * 0.09;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.16 * amp, t0 + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(hp).connect(g).connect(bus);
    src.start(t0, Math.random() * Math.max(0.05, buf.duration - 1));
    src.stop(t0 + dur + 0.02);
    src.onended = () => {
      try {
        src.disconnect();
        hp.disconnect();
        g.disconnect();
      } catch {
        /* already disconnected */
      }
    };
  }

  // ----- رعد و برق تصادفی -----

  private clearThunderTimer(): void {
    if (this.thunderTimer !== null) {
      clearTimeout(this.thunderTimer);
      this.thunderTimer = null;
    }
  }

  private scheduleThunder(first = false): void {
    this.clearThunderTimer();
    if (!this.started || !this.ctx) return;
    const level = this.levels.thunder;
    if (level <= 0.001) return; // صدا خاموش است؛ رویدادی زمان‌بندی نمی‌کنیم
    // هرچه حجم رعد بیشتر → فاصله‌ی رعد‌ها کمتر (طوفان نزدیک‌تر)
    const near = Math.min(1, level);
    const delay = first ? 2500 + Math.random() * 4000 : (7000 + Math.random() * 16000) * (1.3 - near * 0.6);
    this.thunderTimer = setTimeout(() => {
      this.thunderTimer = null;
      this.strike();
      this.scheduleThunder();
    }, Math.max(1500, delay));
  }

  /** یک رعد: غرش بم با پاکت بلند + (با احتمال کمتر) شکستِ برقِ نزدیک */
  private strike(): void {
    const ctx = this.ctx;
    const bus = this.thunderBus;
    if (!ctx || !bus || !this.started || !this.buffers.pink) return;
    const t0 = ctx.currentTime + 0.05 + Math.random() * 0.5;
    const power = 0.45 + Math.random() * 0.55;
    const dur = 3.2 + Math.random() * 5.5;

    const src = ctx.createBufferSource();
    src.buffer = this.buffers.pink; // صورتی = هم بمِ پُر دارد هم میانِ شنیدنی
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;

    const lp = this.filter("lowpass", 240 + power * 700, 0.9);
    lp.frequency.setValueAtTime(240 + power * 700, t0);
    lp.frequency.exponentialRampToValueAtTime(55, t0 + dur); // هرچه دورتر، بم‌تر
    const hp = this.filter("highpass", 28, 0.7);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.02 + 0.85 * power, t0 + 0.18 + Math.random() * 0.45);
    g.gain.exponentialRampToValueAtTime(0.02 + 0.28 * power, t0 + dur * 0.42);
    g.gain.exponentialRampToValueAtTime(0.02 + 0.5 * power, t0 + dur * 0.58); // غرش چندتکه
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(lp).connect(hp).connect(g).connect(bus);
    const maxOffset = Math.max(0, this.buffers.pink.duration - dur - 0.5);
    src.start(t0, Math.random() * maxOffset);
    src.stop(t0 + dur + 0.2);
    src.onended = () => {
      try {
        src.disconnect();
        lp.disconnect();
        hp.disconnect();
        g.disconnect();
      } catch {
        /* already disconnected */
      }
    };

    if (Math.random() < 0.4) this.crack(t0 + 0.02, power, bus);
  }

  /** ترقِ کوتاهِ صاعقه‌ی نزدیک */
  private crack(t0: number, power: number, bus: GainNode): void {
    const ctx = this.ctx;
    if (!ctx || !this.buffers.white) return;
    const dur = 0.5 + Math.random() * 0.9;
    const src = ctx.createBufferSource();
    src.buffer = this.buffers.white;
    src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;

    const bp = this.filter("bandpass", 900 + Math.random() * 900, 0.8);
    bp.frequency.setValueAtTime(bp.frequency.value, t0);
    bp.frequency.exponentialRampToValueAtTime(160, t0 + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.01 + 0.35 * power, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(bp).connect(g).connect(bus);
    src.start(t0, Math.random() * Math.max(0.1, this.buffers.white.duration - 1));
    src.stop(t0 + dur + 0.05);
    src.onended = () => {
      try {
        src.disconnect();
        bp.disconnect();
        g.disconnect();
      } catch {
        /* already disconnected */
      }
    };
  }

  private applyLevels(fade = 0.12): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const id of AMBIENT_IDS) {
      const bus = this.buses[id];
      if (!bus) continue;
      const target = this.levels[id] * TRIM[id];
      try {
        bus.gain.cancelScheduledValues(t);
        bus.gain.setValueAtTime(bus.gain.value, t);
        bus.gain.linearRampToValueAtTime(target, t + fade);
      } catch {
        bus.gain.value = target;
      }
    }
    // موتور موسیقی فقط وقتی لایه‌اش روشن و موتورِ اصلی فعال است به کار می‌افتد.
    // مهم: این فراخوانی از دلِ لایه‌ی React (افکت‌ها/رویدادها) می‌گذرد؛ پس هر خطای
    // غیرمنتظره‌ی موتور موسیقی باید همین‌جا مهار شود تا کل اپ کرش نکند.
    try {
      this.music.setEnabled(this.started && (this.levels.music ?? 0) > 0.001);
    } catch (e) {
      console.warn("music engine toggle failed", e);
    }
    if (this.master && this.started) {
      try {
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.setValueAtTime(this.master.gain.value, t);
        this.master.gain.linearRampToValueAtTime(this.masterLevel * this.duck, t + Math.max(fade, 0.6));
      } catch {
        this.master.gain.value = this.masterLevel * this.duck;
      }
    }
  }
}

/** یک نمونه‌ی یکتا برای کل اپ تا صدا هنگام جابه‌جایی بین صفحه‌ها قطع نشود */
export const ambientEngine = new AmbientEngine();
