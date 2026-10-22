// ===== 📅 مناسبت‌های تقویمی — داده‌محور، آفلاین و قابل توسعه =====
// فهرستِ مناسبت‌ها اینجا داده است، نه کد: افزودن یک مناسبت تازه فقط یک سطر داده
// لازم دارد. چهار نوع قاعده پشتیبانی می‌شود تا تاریخ‌های ثابت و متغیر قاطی نشوند:
//   • jalali       — تاریخ ثابت شمسی (روز پزشک، روز معلم، نوروز…)
//   • gregorian    — تاریخ ثابت میلادی (روز جهانی دیابت، سرطان…)
//   • lunar        — تاریخ قمری (عید فطر، عاشورا…) با تقویم Umm al-Qura مرورگر
//   • gregorianNth / jalaliNth — «چهارمین پنجشنبهٔ…» یا «آخرین یکشنبهٔ…»
// همه‌چیز محلی است؛ هیچ درخواست شبکه‌ای در کار نیست.
import { fromDateKey, jalaliMonthLength, keyToJalali, weekdayOf } from "./jalali";
import { hijriMonthDay } from "./iranianHolidays";

export type OccasionCategory = "national" | "cultural" | "health" | "medical" | "international";

export type OccasionRule =
  | { type: "jalali"; month: number; day: number }
  | { type: "gregorian"; month: number; day: number }
  | { type: "lunar"; month: number; day: number }
  | { type: "gregorianNth"; month: number; weekday: number; nth: number }
  | { type: "gregorianLastDay"; month: number }
  | { type: "jalaliNth"; month: number; weekday: number; nth: number };

export interface Occasion {
  id: string;
  name: string;
  category: OccasionCategory;
  emoji: string;
  /** توضیح کوتاه: چرا این روز برای یک دانشجوی پزشکی مهم است */
  note?: string;
  rule: OccasionRule;
  /** تاریخِ قمری ممکن است یک روز با رؤیت هلال ایران اختلاف داشته باشد */
  approximate?: boolean;
}

export const OCCASION_CATEGORIES: { id: OccasionCategory; label: string; emoji: string; color: string }[] = [
  { id: "national", label: "ملی", emoji: "🇮🇷", color: "#0d9488" },
  { id: "cultural", label: "فرهنگی", emoji: "🎭", color: "#8b5cf6" },
  { id: "health", label: "سلامت و پیشگیری", emoji: "🌿", color: "#16a34a" },
  { id: "medical", label: "پزشکی و حرفه‌ای", emoji: "🩺", color: "#0284c7" },
  { id: "international", label: "بین‌المللی", emoji: "🌍", color: "#f59e0b" },
];

export const OCCASION_CATEGORY_LABEL: Record<OccasionCategory, string> = Object.fromEntries(
  OCCASION_CATEGORIES.map((c) => [c.id, c.label]),
) as Record<OccasionCategory, string>;

const jal = (month: number, day: number): OccasionRule => ({ type: "jalali", month, day });
const greg = (month: number, day: number): OccasionRule => ({ type: "gregorian", month, day });
const lunar = (month: number, day: number): OccasionRule => ({ type: "lunar", month, day });
const nth = (weekday: number, month: number, n: number): OccasionRule => ({ type: "gregorianNth", month, weekday, nth: n });

/**
 * فهرست مناسبت‌ها — عمداً «داده» است تا افزودن/اصلاح یک ردیف، هیچ تغییری در منطق نخواهد.
 * تاریخ‌های ثابت با منبع تقویم رسمی/سازمان جهانی بهداشت انتخاب شده‌اند؛ مناسبت‌های
 * قمری «تقریبی» علامت خورده‌اند.
 */
export const OCCASIONS: Occasion[] = [
  // ---------- ملی ----------
  { id: "nowruz", name: "نوروز", category: "national", emoji: "🌸", rule: jal(1, 1), note: "آغاز سال نو شمسی." },
  { id: "jamhouri", name: "روز جمهوری اسلامی ایران", category: "national", emoji: "🇮🇷", rule: jal(1, 12) },
  { id: "sizdah", name: "روز طبیعت (سیزده‌بدر)", category: "national", emoji: "🌿", rule: jal(1, 13) },
  { id: "earth-day-ir", name: "روز زمین پاک", category: "national", emoji: "🌍", rule: jal(2, 2) },
  { id: "khordad-3", name: "روز مقاومت و پایداری", category: "national", emoji: "🕊️", rule: jal(3, 3) },
  { id: "student-day-ir", name: "روز دانش‌آموز", category: "national", emoji: "🎒", rule: jal(8, 13) },
  { id: "student-day", name: "روز دانشجو", category: "national", emoji: "🎓", rule: jal(9, 16) },
  { id: "research-day-ir", name: "روز پژوهش", category: "national", emoji: "🔬", rule: jal(9, 25) },
  { id: "revolution", name: "پیروزی انقلاب اسلامی", category: "national", emoji: "🇮🇷", rule: jal(11, 22) },
  { id: "oil-day", name: "روز ملی‌شدن صنعت نفت", category: "national", emoji: "🛢️", rule: jal(12, 29) },
  { id: "tree-day", name: "روز درختکاری", category: "national", emoji: "🌳", rule: jal(12, 15) },

  // ---------- فرهنگی ----------
  { id: "teacher-day", name: "روز معلم", category: "cultural", emoji: "🧑‍🏫", rule: jal(2, 12) },
  { id: "ferdowsi", name: "روز بزرگداشت فردوسی", category: "cultural", emoji: "📜", rule: jal(2, 25) },
  { id: "khayyam", name: "روز بزرگداشت خیام", category: "cultural", emoji: "📐", rule: jal(2, 28) },
  { id: "molla-sadra", name: "روز بزرگداشت ملاصدرا", category: "cultural", emoji: "📖", rule: jal(3, 1) },
  { id: "cinema-day", name: "روز ملی سینما", category: "cultural", emoji: "🎬", rule: jal(6, 21) },
  { id: "poetry-day", name: "روز شعر و ادب فارسی", category: "cultural", emoji: "🖋️", rule: jal(6, 27) },
  { id: "school-start", name: "آغاز سال تحصیلی", category: "cultural", emoji: "🏫", rule: jal(7, 1) },
  { id: "mowlavi", name: "روز بزرگداشت مولوی", category: "cultural", emoji: "🪶", rule: jal(7, 8) },
  { id: "hafez", name: "روز بزرگداشت حافظ", category: "cultural", emoji: "🍷", rule: jal(7, 20) },
  { id: "book-day-ir", name: "روز کتاب و کتاب‌خوانی", category: "cultural", emoji: "📚", rule: jal(8, 24) },
  { id: "yalda", name: "شب یلدا", category: "cultural", emoji: "🍉", rule: jal(9, 30) },
  { id: "engineer-day", name: "روز مهندس", category: "cultural", emoji: "📏", rule: jal(12, 5) },

  // ---------- پزشکی و حرفه‌ای ----------
  { id: "doctor-day-ir", name: "روز پزشک", category: "medical", emoji: "🩺", rule: jal(6, 1), note: "زادروز ابوعلی سینا؛ فرصتی برای مرور یک فصل از رفرنس." },
  { id: "pharmacy-day-ir", name: "روز داروسازی", category: "medical", emoji: "💊", rule: jal(6, 5), note: "بزرگداشت محمد بن زکریای رازی؛ فارماکولوژی را با فلش‌کارت مرور کن." },
  { id: "nurses-day-intl", name: "روز جهانی پرستاری", category: "medical", emoji: "🧑‍⚕️", rule: greg(5, 12) },
  { id: "family-doctor-day", name: "روز جهانی پزشک خانواده", category: "medical", emoji: "👨‍⚕️", rule: greg(5, 19) },
  { id: "physio-day", name: "روز جهانی فیزیوتراپی", category: "medical", emoji: "🦵", rule: greg(9, 8) },
  { id: "anaesthesia-day", name: "روز جهانی بیهوشی", category: "medical", emoji: "😴", rule: greg(10, 16) },
  { id: "radiography-day", name: "روز جهانی رادیوگرافی", category: "medical", emoji: "🩻", rule: greg(11, 8) },

  // ---------- سلامت و پیشگیری ----------
  { id: "cancer-day", name: "روز جهانی سرطان", category: "health", emoji: "🎗️", rule: greg(2, 4) },
  { id: "rare-disease-day", name: "روز جهانی بیماری‌های نادر", category: "health", emoji: "🧬", rule: { type: "gregorianLastDay", month: 2 } },
  { id: "hearing-day", name: "روز جهانی شنوایی", category: "health", emoji: "👂", rule: greg(3, 3) },
  { id: "down-day", name: "روز جهانی سندرم داون", category: "health", emoji: "💙", rule: greg(3, 21) },
  { id: "tb-day", name: "روز جهانی سل", category: "health", emoji: "🫁", rule: greg(3, 24) },
  { id: "autism-day", name: "روز جهانی آگاهی از اوتیسم", category: "health", emoji: "🧩", rule: greg(4, 2) },
  { id: "health-day", name: "روز جهانی بهداشت", category: "health", emoji: "🌿", rule: greg(4, 7) },
  { id: "parkinson-day", name: "روز جهانی پارکینسون", category: "health", emoji: "🧠", rule: greg(4, 11) },
  { id: "hemophilia-day", name: "روز جهانی هموفیلی", category: "health", emoji: "🩸", rule: greg(4, 17) },
  { id: "immunization-week", name: "هفتهٔ جهانی ایمن‌سازی", category: "health", emoji: "💉", rule: greg(4, 24), note: "۲۴ تا ۳۰ آوریل؛ مرور واکسن‌های ضروری." },
  { id: "malaria-day", name: "روز جهانی مالاریا", category: "health", emoji: "🦟", rule: greg(4, 25) },
  { id: "safety-work-day", name: "روز جهانی ایمنی و سلامت در کار", category: "health", emoji: "🦺", rule: greg(4, 28) },
  { id: "hand-hygiene-day", name: "روز جهانی بهداشت دست", category: "health", emoji: "🧼", rule: greg(5, 5) },
  { id: "thalassaemia-day", name: "روز جهانی تالاسمی", category: "health", emoji: "🧬", rule: greg(5, 8) },
  { id: "lupus-day", name: "روز جهانی لوپوس", category: "health", emoji: "🦋", rule: greg(5, 10) },
  { id: "hypertension-day", name: "روز جهانی فشار خون", category: "health", emoji: "🫀", rule: greg(5, 17) },
  { id: "tobacco-day", name: "روز جهانی بدون دخانیات", category: "health", emoji: "🚭", rule: greg(5, 31) },
  { id: "brain-tumor-day", name: "روز جهانی تومور مغزی", category: "health", emoji: "🧠", rule: greg(6, 8) },
  { id: "blood-donor-day", name: "روز جهانی اهدای خون", category: "health", emoji: "🩸", rule: greg(6, 14) },
  { id: "sickle-cell-day", name: "روز جهانی کم‌خونی داسی‌شکل", category: "health", emoji: "🔴", rule: greg(6, 19) },
  { id: "hepatitis-day", name: "روز جهانی هپاتیت", category: "health", emoji: "🫀", rule: greg(7, 28) },
  { id: "breastfeeding-week", name: "هفتهٔ جهانی تغذیه با شیر مادر", category: "health", emoji: "🍼", rule: greg(8, 1) },
  { id: "suicide-prevention-day", name: "روز جهانی پیشگیری از خودکشی", category: "health", emoji: "🫂", rule: greg(9, 10) },
  { id: "sepsis-day", name: "روز جهانی سپسیس", category: "health", emoji: "🌡️", rule: greg(9, 13) },
  { id: "patient-safety-day", name: "روز جهانی ایمنی بیمار", category: "health", emoji: "🛡️", rule: greg(9, 17) },
  { id: "alzheimer-day", name: "روز جهانی آلزایمر", category: "health", emoji: "🧠", rule: greg(9, 21) },
  { id: "lung-day", name: "روز جهانی ریه", category: "health", emoji: "🫁", rule: greg(9, 25) },
  { id: "contraception-day", name: "روز جهانی پیشگیری از بارداری", category: "health", emoji: "🩺", rule: greg(9, 26) },
  { id: "heart-day", name: "روز جهانی قلب", category: "health", emoji: "❤️", rule: greg(9, 29) },
  { id: "older-persons-day", name: "روز جهانی سالمندان", category: "health", emoji: "🧓", rule: greg(10, 1) },
  { id: "cerebral-palsy-day", name: "روز جهانی فلج مغزی", category: "health", emoji: "💚", rule: greg(10, 6) },
  { id: "sight-day", name: "روز جهانی بینایی", category: "health", emoji: "👁️", rule: nth(4, 10, 2), note: "دومین پنجشنبهٔ اکتبر." },
  { id: "mental-health-day", name: "روز جهانی سلامت روان", category: "health", emoji: "🧘", rule: greg(10, 10) },
  { id: "arthritis-day", name: "روز جهانی آرتریت", category: "health", emoji: "🦴", rule: greg(10, 12) },
  { id: "thrombosis-day", name: "روز جهانی ترومبوز", category: "health", emoji: "🩸", rule: greg(10, 13) },
  { id: "handwashing-day", name: "روز جهانی شست‌وشوی دست", category: "health", emoji: "🧼", rule: greg(10, 15) },
  { id: "trauma-day", name: "روز جهانی تروما", category: "health", emoji: "🚑", rule: greg(10, 17) },
  { id: "menopause-day", name: "روز جهانی یائسگی", category: "health", emoji: "🌸", rule: greg(10, 18) },
  { id: "osteoporosis-day", name: "روز جهانی پوکی استخوان", category: "health", emoji: "🦴", rule: greg(10, 20) },
  { id: "iodine-day", name: "روز جهانی کمبود ید", category: "health", emoji: "🧂", rule: greg(10, 21) },
  { id: "polio-day", name: "روز جهانی فلج اطفال", category: "health", emoji: "💉", rule: greg(10, 24) },
  { id: "stroke-day", name: "روز جهانی سکته مغزی", category: "health", emoji: "🧠", rule: greg(10, 29) },
  { id: "pneumonia-day", name: "روز جهانی ذات‌الریه", category: "health", emoji: "🫁", rule: greg(11, 12) },
  { id: "diabetes-day", name: "روز جهانی دیابت", category: "health", emoji: "🍬", rule: greg(11, 14) },
  { id: "copd-day", name: "روز جهانی COPD", category: "health", emoji: "🚬", rule: nth(3, 11, 3), note: "سومین چهارشنبهٔ نوامبر." },
  { id: "prematurity-day", name: "روز جهانی نوزادان نارس", category: "health", emoji: "👶", rule: greg(11, 17) },
  { id: "children-day", name: "روز جهانی کودک", category: "health", emoji: "🧒", rule: greg(11, 20) },
  { id: "aids-day", name: "روز جهانی ایدز", category: "health", emoji: "🎗️", rule: greg(12, 1) },
  { id: "disabilities-day", name: "روز جهانی معلولان", category: "health", emoji: "♿", rule: greg(12, 3) },
  { id: "uhc-day", name: "روز جهانی پوشش همگانی سلامت", category: "health", emoji: "🏥", rule: greg(12, 12) },
  { id: "braille-day", name: "روز جهانی بریل", category: "health", emoji: "⠿", rule: greg(1, 4) },
  { id: "leprosy-day", name: "روز جهانی جذام", category: "health", emoji: "🤝", rule: nth(0, 1, -1), note: "آخرین یکشنبهٔ ژانویه." },

  // ---------- بین‌المللی ----------
  { id: "women-day", name: "روز جهانی زن", category: "international", emoji: "♀️", rule: greg(3, 8) },
  { id: "water-day", name: "روز جهانی آب", category: "international", emoji: "💧", rule: greg(3, 22) },
  { id: "book-day", name: "روز جهانی کتاب", category: "international", emoji: "📖", rule: greg(4, 23) },
  { id: "labour-day", name: "روز جهانی کارگر", category: "international", emoji: "🛠️", rule: greg(5, 1) },
  { id: "environment-day", name: "روز جهانی محیط زیست", category: "international", emoji: "🌱", rule: greg(6, 5) },
  { id: "youth-day", name: "روز جهانی جوان", category: "international", emoji: "🧑‍🎓", rule: greg(8, 12) },
  { id: "peace-day", name: "روز جهانی صلح", category: "international", emoji: "🕊️", rule: greg(9, 21) },
  { id: "teachers-day-world", name: "روز جهانی معلم", category: "international", emoji: "🌍", rule: greg(10, 5) },
  { id: "un-day", name: "روز سازمان ملل", category: "international", emoji: "🇺🇳", rule: greg(10, 24) },
  { id: "students-day-world", name: "روز جهانی دانشجو", category: "international", emoji: "🎓", rule: greg(11, 17) },
  { id: "human-rights-day", name: "روز جهانی حقوق بشر", category: "international", emoji: "⚖️", rule: greg(12, 10) },

  // ---------- مناسبت‌های قمری (تقریبی — ممکن است یک روز اختلاف داشته باشند) ----------
  { id: "tasua", name: "تاسوعای حسینی", category: "cultural", emoji: "🕯️", rule: lunar(1, 9), approximate: true },
  { id: "ashura", name: "عاشورای حسینی", category: "cultural", emoji: "🕯️", rule: lunar(1, 10), approximate: true },
  { id: "arbaeen", name: "اربعین حسینی", category: "cultural", emoji: "🚶", rule: lunar(2, 20), approximate: true },
  { id: "prophet-demise", name: "رحلت پیامبر اکرم (ص)", category: "cultural", emoji: "🕌", rule: lunar(2, 28), approximate: true },
  { id: "prophet-birth", name: "میلاد پیامبر اکرم (ص)", category: "cultural", emoji: "🕌", rule: lunar(3, 17), approximate: true },
  { id: "fatima-martyrdom", name: "شهادت حضرت فاطمه زهرا (س)", category: "cultural", emoji: "🕯️", rule: lunar(6, 3), approximate: true },
  { id: "imam-ali-birth", name: "ولادت امام علی (ع)", category: "cultural", emoji: "🕌", rule: lunar(7, 13), approximate: true },
  { id: "mabath", name: "مبعث پیامبر اکرم (ص)", category: "cultural", emoji: "📖", rule: lunar(7, 27), approximate: true },
  { id: "imam-mahdi-birth", name: "ولادت امام مهدی (عج)", category: "cultural", emoji: "🌙", rule: lunar(8, 15), approximate: true },
  { id: "imam-ali-martyrdom", name: "شهادت امام علی (ع)", category: "cultural", emoji: "🕯️", rule: lunar(9, 21), approximate: true },
  { id: "eid-fitr", name: "عید فطر", category: "cultural", emoji: "🌙", rule: lunar(10, 1), approximate: true },
  { id: "eid-adha", name: "عید قربان", category: "cultural", emoji: "🐏", rule: lunar(12, 10), approximate: true },
  { id: "eid-ghadir", name: "عید غدیر خم", category: "cultural", emoji: "🎉", rule: lunar(12, 18), approximate: true },
];

/** آیا یک مناسبت در تاریخ داده‌شده (ISO محلی) هست؟ */
export function occasionMatches(occasion: Occasion, dateKey: string): boolean {
  const rule = occasion.rule;
  if (rule.type === "gregorian") {
    const d = fromDateKey(dateKey);
    return d.getMonth() + 1 === rule.month && d.getDate() === rule.day;
  }
  if (rule.type === "jalali") {
    const { jm, jd } = keyToJalali(dateKey);
    return jm === rule.month && jd === rule.day;
  }
  if (rule.type === "lunar") {
    const lunarDate = hijriMonthDay(dateKey);
    return !!lunarDate && lunarDate.month === rule.month && lunarDate.day === rule.day;
  }
  if (rule.type === "gregorianLastDay") {
    const d = fromDateKey(dateKey);
    if (d.getMonth() + 1 !== rule.month) return false;
    const daysInMonth = new Date(d.getFullYear(), rule.month, 0).getDate();
    return d.getDate() === daysInMonth;
  }
  if (rule.type === "gregorianNth") {
    const d = fromDateKey(dateKey);
    if (d.getMonth() + 1 !== rule.month || d.getDay() !== rule.weekday) return false;
    if (rule.nth > 0) return Math.floor((d.getDate() - 1) / 7) + 1 === rule.nth;
    const daysInMonth = new Date(d.getFullYear(), rule.month, 0).getDate();
    return d.getDate() + 7 > daysInMonth;
  }
  // jalaliNth
  if (rule.type === "jalaliNth") {
    const { jy, jm, jd } = keyToJalali(dateKey);
    if (jm !== rule.month || weekdayOf(dateKey) !== rule.weekday) return false;
    if (rule.nth > 0) return Math.floor((jd - 1) / 7) + 1 === rule.nth;
    return jd + 7 > jalaliMonthLength(jy, jm);
  }
  return false;
}

/** مناسبت‌های یک روز — بدون تکرار (نام یکسان فقط یک‌بار) */
export function occasionsOn(dateKey: string, categories?: OccasionCategory[]): Occasion[] {
  const allow = categories && categories.length > 0 ? new Set(categories) : null;
  const found = OCCASIONS.filter((o) => (!allow || allow.has(o.category)) && occasionMatches(o, dateKey));
  const seen = new Set<string>();
  return found.filter((o) => {
    const key = o.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface UpcomingOccasion {
  date: string;
  occasion: Occasion;
}

/**
 * مناسبت‌های پیش‌رو در بازهٔ n روز (شامل امروز). خروجی مرتب بر اساس تاریخ است و
 * برای هر روز حداکثر همهٔ مناسبت‌های همان روز را می‌دهد.
 */
export function upcomingOccasions(fromKey: string, days = 30, categories?: OccasionCategory[]): UpcomingOccasion[] {
  const out: UpcomingOccasion[] = [];
  const start = fromDateKey(fromKey);
  for (let i = 0; i < Math.max(0, days); i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    for (const occasion of occasionsOn(key, categories)) out.push({ date: key, occasion });
  }
  return out;
}

/** فقط مناسبت‌های پزشکی/سلامت — برای یادآوری‌های مرتبط با رشته */
export function healthOccasionsOn(dateKey: string): Occasion[] {
  return occasionsOn(dateKey, ["health", "medical"]);
}
