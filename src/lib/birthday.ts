// ===== 🎂 تبریک تولد — محلی، آفلاین و یک‌بار در روز =====
// تاریخ تولد فقط ماه/روزِ شمسی (و سالِ اختیاری) است و روی همین دستگاه می‌ماند.
// منطق تبریک به اینترنت/سرور وابسته نیست و اگر کاربر اعلان‌ها را خاموش کرده باشد،
// پیامِ داخلِ اپ همچنان کار می‌کند.
import type { BirthdayInfo } from "../types";
import { fromDateKey, jalaliMonthLength, keyToJalali } from "./jalali";

/** اعتبار ماه/روز شمسی — ۳۱ روز در هیچ ماهی وجود ندارد */
export function isValidBirthday(month: number, day: number): boolean {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  // ۱۴۰۳ کبیسه است، پس ۳۰ اسفند هم معتبر است
  return day <= Math.max(jalaliMonthLength(1403, month), jalaliMonthLength(1404, month));
}

export interface BirthdayCheck {
  isBirthday: boolean;
  /** آیا امروز قبلاً تبریک گفته شده؟ */
  alreadyGreeted: boolean;
  shouldGreet: boolean;
  /** سن در صورت وجود سال تولد */
  age: number | null;
  /** کلید یکتای همان روز (برای ذخیره در تنظیمات) */
  dateKey: string;
  month: number;
  day: number;
  message: string;
  emoji: string;
}

const MESSAGES = [
  "تولدت مبارک! 🎂 امیدوارم سالِ پیشِ رو پر از یادگیری‌های شیرین و موفقیت باشه.",
  "🎉 تولدت مبارک! امروز به خودت استراحت بده — فردا با انرژیِ بیشتر برمی‌گردی.",
  "🎂 سالروز تولدت مبارک! یک هدف کوچک برای سالِ تازه‌ات انتخاب کن؛ ما کنارِ هم می‌بریمش.",
];

/** پیام با توجه به سن (اگر وارد شده باشد) */
export function birthdayMessage(age: number | null): string {
  const base = MESSAGES[Math.abs((age ?? 0) + 1) % MESSAGES.length];
  if (age == null) return base;
  return `${age} سالگی‌ت مبارک! 🎂 ${base}`;
}

/**
 * بررسی تولد برای یک تاریخ محلی مشخص.
 * `lastGreetedKey` همان کلیدِ تاریخ است که در تنظیمات ذخیره می‌شود؛ با آن، پیام در
 * همان روز فقط یک‌بار می‌آید و سالِ بعد دوباره ظاهر می‌شود.
 */
export function checkBirthday(
  birthday: BirthdayInfo | undefined,
  todayKey: string,
  lastGreetedKey?: string,
): BirthdayCheck | null {
  if (!birthday) return null;
  if (!isValidBirthday(birthday.month, birthday.day)) return null;
  const { jy, jm, jd } = keyToJalali(todayKey);
  const isBirthday = jm === birthday.month && jd === birthday.day;
  // اگر ۳۰ اسفند در سالِ غیرِ کبیسه انتخاب شده، در سال‌های عادی ۲۹ اسفند را هم تولد حساب می‌کنیم
  const isLeapFallback =
    birthday.month === 12 && birthday.day === jalaliMonthLength(1403, 12) && jd === jalaliMonthLength(jy, 12);
  const matches = isBirthday || (isLeapFallback && jm === 12);
  const age = matches && birthday.year && birthday.year > 1300 && jy >= birthday.year ? jy - birthday.year : null;
  return {
    isBirthday: matches,
    alreadyGreeted: lastGreetedKey === todayKey,
    shouldGreet: matches && lastGreetedKey !== todayKey,
    age,
    dateKey: todayKey,
    month: birthday.month,
    day: birthday.day,
    message: birthdayMessage(age),
    emoji: ["🎂", "🎉", "🥳", "🎈", "🎁"][Math.abs(jd + jm) % 5],
  };
}

/** نمایش کوتاه تولد برای پروفایل: «۱۲ اردیبهشت ۱۳۷۹» */
export function formatBirthday(birthday: BirthdayInfo, monthNames: string[], toFa: (n: number | string) => string): string {
  const base = `${toFa(birthday.day)} ${monthNames[birthday.month - 1] ?? ""}`;
  return birthday.year && birthday.year > 1300 ? `${base} ${toFa(birthday.year)}` : base;
}

/** آیا تاریخ امروز به‌وضوح قابل خواندن است؟ (برای جلوگیری از کرش در دادهٔ خراب) */
export function safeDatePart(key: string): { month: number; day: number } | null {
  try {
    const d = fromDateKey(key);
    if (Number.isNaN(d.getTime())) return null;
    const { jm, jd } = keyToJalali(key);
    return Number.isFinite(jm) && Number.isFinite(jd) ? { month: jm, day: jd } : null;
  } catch {
    return null;
  }
}
