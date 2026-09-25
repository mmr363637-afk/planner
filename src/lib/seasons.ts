// ===== 🌸 تم‌های فصلی زنده =====
// در روزهای خاص تقویم شمسی، حال‌وهوای اپ کمی عوض می‌شود: ذرات پس‌زمینه، سلام خانه و
// یک جمله‌ی متناسب. همه‌چیز از تاریخِ همین دستگاه می‌آید — نه سرور، نه دانلود.
// با یک سوئیچ در تنظیمات قابل خاموش‌کردن است (پیش‌فرض: روشن).

import { keyToJalali, todayKey } from "./jalali";

export type SeasonId = "nowruz" | "yalda" | "chaharshanbe" | null;

export interface SeasonTheme {
  id: Exclude<SeasonId, null>;
  label: string;
  emoji: string;
  greeting: string;
  note: string;
  /** ذرات/رنگ‌های CSS که PageBackdrop استفاده می‌کند */
  particle: string;
}

export const SEASONS: Record<Exclude<SeasonId, null>, SeasonTheme> = {
  nowruz: {
    id: "nowruz",
    label: "نوروز",
    emoji: "🌸",
    greeting: "نوروز مبارک! سال تازه، هدف تازه 🌱",
    note: "تعطیلات هم می‌شود پیشرفت: یک هدف کوچکِ روزانه برای عید بگذار — زنجیره را یک ساعت مطالعه هم نگه می‌دارد.",
    particle: "petal",
  },
  yalda: {
    id: "yalda",
    label: "یلدا",
    emoji: "🍉",
    greeting: "شب یلدا مبارک — بلندترین شب، گرم‌ترین مطالعه 🍉",
    note: "امشب را با یک جلسه‌ی کوتاه و نرم تمام کن؛ صدای «شومینه» و «چای» در میکسر منتظرند.",
    particle: "ember",
  },
  chaharshanbe: {
    id: "chaharshanbe",
    label: "چهارشنبه‌سوری",
    emoji: "🔥",
    greeting: "چهارشنبه‌سوری مبارک 🔥 (مراقب خودت باش!)",
    note: "اگر امشب بیرونی، جلسه‌ی فردا صبح را سبک بچین — برنامه با یک روز نرم نمی‌شکند.",
    particle: "ember",
  },
};

/** season فعلی از روی تاریخ شمسی — null یعنی روز عادی */
export function seasonOf(today: string = todayKey()): SeasonTheme | null {
  const j = keyToJalali(today);
  // نوروز: ۱ تا ۱۳ فروردین
  if (j.jm === 1 && j.jd <= 13) return SEASONS.nowruz;
  // چهارشنبه‌سوری: ۲۴ اسفند
  if (j.jm === 12 && j.jd === 24) return SEASONS.chaharshanbe;
  // یلدا: ۳۰ آذر
  if (j.jm === 9 && j.jd === 30) return SEASONS.yalda;
  return null;
}
