import { keyToJalali, weekdayOf } from "./jalali";

export type IranianHolidayKind = "weekly" | "official";

export interface IranianHoliday {
  name: string;
  kind: IranianHolidayKind;
  /** Lunar dates inferred from Umm al-Qura when no Iranian calendar override is bundled. */
  approximate?: boolean;
}

const FIXED_SOLAR_HOLIDAYS: Record<string, string[]> = {
  "1-1": ["نوروز"],
  "1-2": ["نوروز"],
  "1-3": ["نوروز"],
  "1-4": ["نوروز"],
  "1-12": ["روز جمهوری اسلامی ایران"],
  "1-13": ["روز طبیعت (سیزده‌بدر)"],
  "3-14": ["رحلت امام خمینی (ره)"],
  "3-15": ["قیام ۱۵ خرداد"],
  "11-22": ["پیروزی انقلاب اسلامی"],
  "12-29": ["ملی‌شدن صنعت نفت ایران"],
};

/**
 * تاریخ شمسیِ مناسبت‌های قمریِ تعطیل در جدول‌های سالانه‌ی ۱۴۰۴ تا ۱۴۰۶.
 * برای سال‌های دیگر از تقویم قمریِ داخلی مرورگر به‌صورت آفلاین استفاده می‌کنیم؛
 * چون رؤیت هلال در ایران ممکن است با تقویم محاسباتی یک روز تفاوت داشته باشد.
 */
const IRANIAN_LUNAR_HOLIDAYS: Record<number, Record<string, string[]>> = {
  1404: {
    "1-2": ["شهادت امام علی (ع)"],
    "1-11": ["عید فطر"],
    "1-12": ["تعطیل عید فطر"],
    "3-16": ["عید قربان"],
    "3-24": ["عید غدیر خم"],
    "4-14": ["تاسوعای حسینی"],
    "4-15": ["عاشورای حسینی"],
    "5-23": ["اربعین حسینی"],
    "5-31": ["رحلت پیامبر اکرم (ص) و شهادت امام حسن مجتبی (ع)"],
    "6-2": ["شهادت امام رضا (ع)"],
    "6-10": ["شهادت امام حسن عسکری (ع)"],
    "6-19": ["میلاد پیامبر اکرم (ص) و امام جعفر صادق (ع)"],
    "9-3": ["شهادت حضرت فاطمه زهرا (س)"],
    "10-13": ["ولادت امام علی (ع)"],
    "10-27": ["مبعث پیامبر اکرم (ص)"],
    "11-15": ["ولادت امام مهدی (عج)"],
    "12-20": ["شهادت امام علی (ع)"],
  },
  1405: {
    "1-1": ["عید فطر"],
    "1-2": ["تعطیل عید فطر"],
    "3-6": ["عید قربان"],
    "3-14": ["عید غدیر خم"],
    "4-3": ["تاسوعای حسینی"],
    "4-4": ["عاشورای حسینی"],
    "5-13": ["اربعین حسینی"],
    "5-21": ["رحلت پیامبر اکرم (ص) و شهادت امام حسن مجتبی (ع)"],
    "5-22": ["شهادت امام رضا (ع)"],
    "5-30": ["شهادت امام حسن عسکری (ع)"],
    "6-8": ["میلاد پیامبر اکرم (ص) و امام جعفر صادق (ع)"],
    "8-22": ["شهادت حضرت فاطمه زهرا (س)"],
    "10-2": ["ولادت امام علی (ع)"],
    "10-16": ["مبعث پیامبر اکرم (ص)"],
    "11-4": ["ولادت امام مهدی (عج)"],
    "12-9": ["شهادت امام علی (ع)"],
    "12-19": ["عید فطر"],
    "12-20": ["تعطیل عید فطر"],
  },
  1406: {
    "1-14": ["شهادت امام جعفر صادق (ع)"],
    "2-27": ["عید قربان"],
    "3-4": ["عید غدیر خم"],
    "3-25": ["تاسوعای حسینی"],
    "3-26": ["عاشورای حسینی"],
    "5-3": ["اربعین حسینی"],
    "5-11": ["رحلت پیامبر اکرم (ص) و شهادت امام حسن مجتبی (ع)"],
    "5-12": ["شهادت امام رضا (ع)"],
    "5-20": ["شهادت امام حسن عسکری (ع)"],
    "10-5": ["مبعث پیامبر اکرم (ص)"],
    "10-23": ["ولادت امام مهدی (عج)"],
    "11-29": ["شهادت امام علی (ع)"],
    "12-8": ["عید فطر"],
    "12-9": ["تعطیل عید فطر"],
  },
};

// Hijri month/day -> مناسبت‌های تعطیل رسمی ایران. This is a fallback for years
// without an annual Iranian calendar table above; no network or timezone is used.
const LUNAR_HOLIDAYS: Record<string, string[]> = {
  "1-9": ["تاسوعای حسینی"],
  "1-10": ["عاشورای حسینی"],
  "2-20": ["اربعین حسینی"],
  "2-28": ["رحلت پیامبر اکرم (ص) و شهادت امام حسن مجتبی (ع)"],
  "2-30": ["شهادت امام رضا (ع)"],
  "3-8": ["شهادت امام حسن عسکری (ع)"],
  "3-17": ["میلاد پیامبر اکرم (ص) و امام جعفر صادق (ع)"],
  "6-3": ["شهادت حضرت فاطمه زهرا (س)"],
  "7-13": ["ولادت امام علی (ع)"],
  "7-27": ["مبعث پیامبر اکرم (ص)"],
  "8-15": ["ولادت امام مهدی (عج)"],
  "9-21": ["شهادت امام علی (ع)"],
  "10-1": ["عید فطر"],
  "10-2": ["تعطیل عید فطر"],
  "10-25": ["شهادت امام جعفر صادق (ع)"],
  "12-10": ["عید قربان"],
  "12-18": ["عید غدیر خم"],
};

let lunarFormatter: Intl.DateTimeFormat | null | undefined;
const holidayCache = new Map<string, IranianHoliday[]>();

function lunarDateForKey(key: string): { month: number; day: number } | null {
  try {
    if (lunarFormatter === undefined) {
      lunarFormatter = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", {
        calendar: "islamic-umalqura",
        day: "numeric",
        month: "numeric",
        timeZone: "UTC",
        year: "numeric",
      });
    }
    if (!lunarFormatter) return null;
    const [gy, gm, gd] = key.split("-").map(Number);
    const date = new Date(Date.UTC(gy, gm - 1, gd, 12));
    const parts = lunarFormatter.formatToParts(date);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    const day = Number(parts.find((part) => part.type === "day")?.value);
    return Number.isFinite(month) && Number.isFinite(day) ? { month, day } : null;
  } catch {
    // Older browser engines may not ship Umm al-Qura data. Fixed Solar Hijri dates
    // and the weekly Friday holiday continue to work in that case.
    lunarFormatter = null;
    return null;
  }
}

/** تعطیلی‌های هفتگی و رسمی ایران برای یک تاریخ میلادیِ داخلیِ yyyy-mm-dd. */
export function iranianHolidaysOn(key: string): IranianHoliday[] {
  const cached = holidayCache.get(key);
  if (cached) return cached;

  const { jy, jm, jd } = keyToJalali(key);
  const solarKey = `${jm}-${jd}`;
  const holidays: IranianHoliday[] = [];

  if (weekdayOf(key) === 5) holidays.push({ name: "تعطیلی هفتگی جمعه", kind: "weekly" });
  for (const name of FIXED_SOLAR_HOLIDAYS[solarKey] ?? []) {
    holidays.push({ name, kind: "official" });
  }

  if (Object.prototype.hasOwnProperty.call(IRANIAN_LUNAR_HOLIDAYS, jy)) {
    for (const name of IRANIAN_LUNAR_HOLIDAYS[jy][solarKey] ?? []) {
      holidays.push({ name, kind: "official" });
    }
  } else {
    const lunar = lunarDateForKey(key);
    if (lunar) {
      for (const name of LUNAR_HOLIDAYS[`${lunar.month}-${lunar.day}`] ?? []) {
        holidays.push({ name, kind: "official", approximate: true });
      }
    }
  }

  const unique = holidays.filter((holiday, index) => holidays.findIndex((item) => item.name === holiday.name) === index);
  holidayCache.set(key, unique);
  return unique;
}

export function isIranianHoliday(key: string): boolean {
  return iranianHolidaysOn(key).length > 0;
}

export function iranianHolidayLabel(key: string): string | null {
  const holidays = iranianHolidaysOn(key);
  if (holidays.length === 0) return null;
  const officialNames = holidays.filter((holiday) => holiday.kind === "official").map((holiday) => holiday.name);
  const approximate = holidays.some((holiday) => holiday.approximate);
  const names = officialNames.length ? officialNames : ["تعطیلی هفتگی جمعه"];
  return `${names.join("، ")}${approximate ? " (تاریخ قمری تقریبی)" : ""}`;
}
