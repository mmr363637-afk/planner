// ===== متادیتای سبک صداهای محیطی (بدون موتور صوتی) =====
// این فایل عمداً هیچ وابستگی به Web Audio / موتورهای مولد (music/drone) ندارد تا
// بتواند در باندلِ اولیه‌ی اپ بماند؛ موتور سنگین (lib/ambient.ts) فقط با اولین
// «پخش» به‌صورت تنبل (dynamic import) لود می‌شود و روی سرعت باز شدن گوشی اثر ندارد.

import { DEFAULT_AMBIENT, type AmbientSoundId, type BinauralBandId } from "../types";

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
  { id: "drone", label: "صدای فضایی", icon: "🪐", hint: "موسیقی Ambient مولد — مثل Music for Airports اثر Brian Eno", group: "engines" },
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
  music: 0, binaural: 0, drone: 0,
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
  { id: "full-mix", label: "میکس کامل", icon: "🎛️", volumes: { rain: 0.35, thunder: 0.2, river: 0.3, forest: 0.2, wind: 0.15, ocean: 0.18, waterfall: 0.12, rainTent: 0.1, underwater: 0.1, birds: 0.12, crickets: 0.1, frogs: 0.08, fireplace: 0.15, cafe: 0.12, library: 0.08, clock: 0.06, train: 0.08, airplane: 0.08, car: 0.08, fan: 0.12, brown: 0.2, pink: 0.1, white: 0.08, green: 0.12, violet: 0.05, grey: 0.08, purr: 0.08, space: 0.1, snowfall: 0.08, chimes: 0.06, singingBowl: 0.05, rainGlass: 0.15, pageTurn: 0.06, nightCity: 0.06, typing: 0.08, music: 0.12, binaural: 0.06, drone: 0.1 } },
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

// ===== پشتیبانی مرورگر =====

type AudioWindow = typeof window & { webkitAudioContext?: typeof AudioContext };

export function audioCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as AudioWindow;
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function ambientSupported(): boolean {
  return audioCtor() !== null;
}
