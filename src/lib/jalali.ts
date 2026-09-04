// ===== Jalali (Persian) calendar utilities – pure functions =====

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export function toFa(input: number | string): string {
  return String(input).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

export const JALALI_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

/** Weekday names indexed by JS getDay() (0 = Sunday) */
export const WEEKDAYS_FA = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
export const WEEKDAYS_SHORT_FA = ["ی", "د", "س", "چ", "پ", "ج", "ش"];
/** Persian week order: Saturday .. Friday as JS weekday numbers */
export const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

function div(a: number, b: number) {
  return Math.floor(a / b);
}

function mod(a: number, b: number) {
  return a - Math.floor(a / b) * b;
}

export function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    355666 +
    365 * gy +
    div(gy2 + 3, 4) -
    div(gy2 + 99, 100) +
    div(gy2 + 399, 400) +
    gd +
    g_d_m[gm - 1];
  let jy = -1595 + 33 * div(days, 12053);
  days = mod(days, 12053);
  jy += 4 * div(days, 1461);
  days = mod(days, 1461);
  if (days > 365) {
    jy += div(days - 1, 365);
    days = mod(days - 1, 365);
  }
  let jm: number;
  let jd: number;
  if (days < 186) {
    jm = 1 + div(days, 31);
    jd = 1 + mod(days, 31);
  } else {
    jm = 7 + div(days - 186, 30);
    jd = 1 + mod(days - 186, 30);
  }
  return [jy, jm, jd];
}

export function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  jy += 1595;
  let days =
    -355668 +
    365 * jy +
    div(jy, 33) * 8 +
    div(mod(jy, 33) + 3, 4) +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * div(days, 146097);
  days = mod(days, 146097);
  if (days > 36524) {
    gy += 100 * div(--days, 36524);
    days = mod(days, 36524);
    if (days >= 365) days++;
  }
  gy += 4 * div(days, 1461);
  days = mod(days, 1461);
  if (days > 365) {
    gy += div(days - 1, 365);
    days = mod(days - 1, 365);
  }
  let gd = days + 1;
  const sal_a = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (gm = 0; gm < 13 && gd > sal_a[gm]; gm++) gd -= sal_a[gm];
  return [gy, gm, gd];
}

export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isJalaliLeap(jy) ? 30 : 29;
}

export function isJalaliLeap(jy: number): boolean {
  // Check by converting the 30th of Esfand
  const [gy, gm, gd] = jalaliToGregorian(jy, 12, 30);
  const [y2, m2, d2] = gregorianToJalali(gy, gm, gd);
  return y2 === jy && m2 === 12 && d2 === 30;
}

// ===== ISO date keys (local time) =====

export function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function addDays(key: string, days: number): string {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export function diffDays(a: string, b: string): number {
  const ms = fromDateKey(b).getTime() - fromDateKey(a).getTime();
  return Math.round(ms / 86400000);
}

export function weekdayOf(key: string): number {
  return fromDateKey(key).getDay();
}

/** Start of the Persian week (Saturday) containing the given date */
export function startOfWeek(key: string): string {
  const wd = weekdayOf(key); // 6 = Saturday
  const offset = (wd + 1) % 7; // Saturday -> 0, Sunday -> 1, ... Friday -> 6
  return addDays(key, -offset);
}

export function weekDates(key: string): string[] {
  const start = startOfWeek(key);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export interface JalaliDate {
  jy: number;
  jm: number;
  jd: number;
}

export function keyToJalali(key: string): JalaliDate {
  const d = fromDateKey(key);
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return { jy, jm, jd };
}

export function jalaliToKey(jy: number, jm: number, jd: number): string {
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
  return `${gy}-${pad(gm)}-${pad(gd)}`;
}

/** e.g. "۱۴۰۵/۰۶/۱۰" */
export function formatJalaliNumeric(key: string): string {
  const { jy, jm, jd } = keyToJalali(key);
  return toFa(`${jy}/${pad(jm)}/${pad(jd)}`);
}

/** e.g. "سه‌شنبه ۱۰ شهریور ۱۴۰۵" */
export function formatJalaliLong(key: string, withWeekday = true): string {
  const { jy, jm, jd } = keyToJalali(key);
  const wd = WEEKDAYS_FA[weekdayOf(key)];
  return `${withWeekday ? wd + " " : ""}${toFa(jd)} ${JALALI_MONTHS[jm - 1]} ${toFa(jy)}`;
}

/** e.g. "۱۰ شهریور" */
export function formatJalaliShort(key: string): string {
  const { jm, jd } = keyToJalali(key);
  return `${toFa(jd)} ${JALALI_MONTHS[jm - 1]}`;
}

export function relativeDayLabel(key: string): string {
  const diff = diffDays(todayKey(), key);
  if (diff === 0) return "امروز";
  if (diff === 1) return "فردا";
  if (diff === -1) return "دیروز";
  if (diff < 0) return `${toFa(-diff)} روز پیش`;
  return `${toFa(diff)} روز دیگر`;
}

/** Convert a Persian-digit or Latin-digit "yyyy/mm/dd" jalali string into a date key */
export function parseJalaliInput(input: string): string | null {
  const latin = input.replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)));
  const m = latin.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (!m) return null;
  const jy = Number(m[1]);
  const jm = Number(m[2]);
  const jd = Number(m[3]);
  if (jm < 1 || jm > 12 || jd < 1 || jd > jalaliMonthLength(jy, jm)) return null;
  return jalaliToKey(jy, jm, jd);
}

// ===== Duration formatting =====

export function formatMinutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h === 0) return `${toFa(mm)} دقیقه`;
  if (mm === 0) return `${toFa(h)} ساعت`;
  return `${toFa(h)} ساعت و ${toFa(mm)} دقیقه`;
}

export function formatHoursCompact(total: number): string {
  const m = Math.max(0, Math.round(total));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h === 0) return `${toFa(mm)}د`;
  return mm === 0 ? `${toFa(h)}س` : `${toFa(h)}س ${toFa(mm)}د`;
}

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return toFa(`${pad(h)}:${pad(m)}:${pad(sec)}`);
}
