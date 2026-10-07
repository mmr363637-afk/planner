// ===== 🌸 تم‌های روزهای خاص =====
// در روزهای ویژه‌ی سال (ایرانی و میلادی)، حال‌وهوای اپ خودبه‌خود عوض می‌شود:
// ذرات پس‌زمینه، سلام خانه و یک جمله‌ی متناسب. هر تم فقط و فقط در همان روز(ها)
// اعمال می‌شود و تاریخش از خودِ دستگاه می‌آید — نه سرور، نه دانلود.
// با یک سوئیچ در تنظیمات قابل خاموش‌کردن است (پیش‌فرض: روشن).

import { keyToJalali, todayKey } from "./jalali";

export type SeasonId =
  | "nowruz"
  | "yalda"
  | "chaharshanbe"
  | "teacher"
  | "mehregan"
  | "children"
  | "summer"
  | "autumn"
  | "winter"
  | "gregorianNewYear"
  | "valentine"
  | "christmas"
  | "halloween"
  | "programmer";

export interface SeasonTheme {
  id: SeasonId;
  label: string;
  emoji: string;
  greeting: string;
  note: string;
  /** ایموجی‌های شناور پس‌زمینه — فقط همین روز دیده می‌شوند */
  emojis: string[];
  /** کلاس‌های گرادیان بنر خانه */
  banner: string;
  /**
   * 🎨 رنگِ همان روز — همان روز، کلِ تمِ رنگی اپ (دکمه‌ها، نوارها، نمودارها،
   * تایمرها و …) موقتاً به این رنگ تغییر می‌کند، نه فقط بنر و چند ذره‌ی ریز.
   * رنگ انتخابی کاربر در تنظیمات دست‌نخورده می‌ماند و فردا خودکار برمی‌گردد.
   */
  accent: string;
}

export const SEASONS: Record<SeasonId, SeasonTheme> = {
  nowruz: {
    id: "nowruz",
    label: "نوروز",
    emoji: "🌸",
    greeting: "نوروز مبارک! سال تازه، هدف تازه 🌱",
    note: "تعطیلات هم می‌شود پیشرفت: یک هدف کوچکِ روزانه برای عید بگذار — زنجیره را یک ساعت مطالعه هم نگه می‌دارد.",
    emojis: ["🌸", "🌷", "🌼", "🍃", "🌱", "🦋"],
    banner: "border-pink-200/60 dark:border-pink-900/40 bg-gradient-to-l from-pink-50 via-white to-emerald-50/70 dark:from-pink-950/30 dark:via-slate-800 dark:to-emerald-950/20",
    accent: "#16a34a", // سبزِ تازه‌ی بهار
  },
  yalda: {
    id: "yalda",
    label: "یلدا",
    emoji: "🍉",
    greeting: "شب یلدا مبارک — بلندترین شب، گرم‌ترین مطالعه 🍉",
    note: "امشب را با یک جلسه‌ی کوتاه و نرم تمام کن؛ صدای «شومینه» و «چای» در میکسر منتظرند.",
    emojis: ["🍉", "✨", "🕯️", "🍇", "⭐", "🌙"],
    banner: "border-rose-200/60 dark:border-rose-900/40 bg-gradient-to-l from-rose-50 via-white to-red-50/70 dark:from-rose-950/40 dark:via-slate-800 dark:to-red-950/20",
    accent: "#be123c", // سرخِ انار
  },
  chaharshanbe: {
    id: "chaharshanbe",
    label: "چهارشنبه‌سوری",
    emoji: "🔥",
    greeting: "چهارشنبه‌سوری مبارک 🔥 (مراقب خودت باش!)",
    note: "اگر امشب بیرونی، جلسه‌ی فردا صبح را سبک بچین — برنامه با یک روز نرم نمی‌شکند.",
    emojis: ["🔥", "✨", "🔥", "⭐", "🧨"],
    banner: "border-orange-200/60 dark:border-orange-900/40 bg-gradient-to-l from-orange-50 via-white to-amber-50/70 dark:from-orange-950/40 dark:via-slate-800 dark:to-amber-950/20",
    accent: "#ea580c", // نارنجِ آتش
  },
  teacher: {
    id: "teacher",
    label: "روز معلم",
    emoji: "🧑‍🏫",
    greeting: "روز معلم مبارک 🧑‍🏫",
    note: "یاد هر معلمی که برایت ماندگار شد؟ امروز یک نکته از او را مثل یک فلش‌کارت برای خودت بنویس.",
    emojis: ["📚", "✏️", "🍎", "🧑‍🏫"],
    banner: "border-sky-200/60 dark:border-sky-900/40 bg-gradient-to-l from-sky-50 via-white to-indigo-50/70 dark:from-sky-950/30 dark:via-slate-800 dark:to-indigo-950/20",
    accent: "#0284c7", // آبیِ تخته‌کلاس
  },
  mehregan: {
    id: "mehregan",
    label: "مهرگان",
    emoji: "🍁",
    greeting: "مهرگان مبارک — جشن پاییز و مِهر 🍁",
    note: "برای امروز یک مبحث «دوست‌داشتنی» انتخاب کن؛ یادگیری با مِهر بهتر می‌چسبد.",
    emojis: ["🍁", "🍂", "🍁", "✨", "🌰", "🍂"],
    banner: "border-amber-200/60 dark:border-amber-900/40 bg-gradient-to-l from-amber-50 via-white to-orange-50/70 dark:from-amber-950/30 dark:via-slate-800 dark:to-orange-950/20",
    accent: "#c2410c", // نارنجِ برگ پاییزی
  },
  children: {
    id: "children",
    label: "روز جهانی کودک",
    emoji: "🎈",
    greeting: "روز جهانی کودک 🎈",
    note: "مثل بچه‌ها کنجکاو باش: امروز هر سؤالی که برایت پیش آمد، همان لحظه دنبالش برو.",
    emojis: ["🎈", "🪁", "🧸", "🎨", "🎠"],
    banner: "border-yellow-200/60 dark:border-yellow-900/40 bg-gradient-to-l from-yellow-50 via-white to-sky-50/70 dark:from-yellow-950/30 dark:via-slate-800 dark:to-sky-950/20",
    accent: "#db2777", // صورتیِ بازیگوش
  },
  summer: {
    id: "summer",
    label: "اول تابستان",
    emoji: "☀️",
    greeting: "اول تابستان ☀️ فصل صبح‌های زود و خنک",
    note: "تابستان مالِ سحرخیزهاست: جلسه‌ی سنگین را قبل از گرمای ظهر بگذار.",
    emojis: ["☀️", "🌊", "🍦", "😎", "🏖️"],
    banner: "border-yellow-200/60 dark:border-yellow-900/40 bg-gradient-to-l from-yellow-50 via-white to-cyan-50/70 dark:from-yellow-950/30 dark:via-slate-800 dark:to-cyan-950/20",
    accent: "#eab308", // زردِ آفتاب
  },
  autumn: {
    id: "autumn",
    label: "اول پاییز",
    emoji: "🍂",
    greeting: "اول پاییز 🍂 فصلِ شروع‌های دوباره",
    note: "مهر، ماهِ شروع است: اگر برنامه‌ات قدیمی شده، همین امروز یک برنامه‌ی تازه بساز.",
    emojis: ["🍂", "🍁", "🌧️", "📖", "🌰"],
    banner: "border-orange-200/60 dark:border-orange-900/40 bg-gradient-to-l from-orange-50 via-white to-amber-50/70 dark:from-orange-950/30 dark:via-slate-800 dark:to-amber-950/20",
    accent: "#d97706", // کهربایی پاییز
  },
  winter: {
    id: "winter",
    label: "اول زمستان",
    emoji: "❄️",
    greeting: "اول زمستان ❄️ چای داغ و صفحه‌ی گرم",
    note: "روزهای کوتاه یعنی فرصت کمتر؛ زمان‌های طلایی‌ات را از آمار پیدا کن و همان‌ها بخوان.",
    emojis: ["❄️", "⛄", "🧣", "☕", "✨"],
    banner: "border-cyan-200/60 dark:border-cyan-900/40 bg-gradient-to-l from-cyan-50 via-white to-blue-50/70 dark:from-cyan-950/30 dark:via-slate-800 dark:to-blue-950/20",
    accent: "#0891b2", // آبیِ یخی
  },
  gregorianNewYear: {
    id: "gregorianNewYear",
    label: "سال نو میلادی",
    emoji: "🎆",
    greeting: "سال نو میلادی مبارک 🎆",
    note: "یک سال میلادی دیگر هم در کنارش پیش رفتی؛ رکورد هفته‌ی اخیرت را همین امروز بزن.",
    emojis: ["🎆", "🎇", "✨", "🥳", "🎊"],
    banner: "border-indigo-200/60 dark:border-indigo-900/40 bg-gradient-to-l from-indigo-50 via-white to-violet-50/70 dark:from-indigo-950/30 dark:via-slate-800 dark:to-violet-950/20",
    accent: "#7c3aed", // بنفشِ آتش‌بازی
  },
  valentine: {
    id: "valentine",
    label: "ولنتاین",
    emoji: "❤️",
    greeting: "روز عشق ❤️ با درس‌هایت مهربان باش",
    note: "امروز سخت‌ترین مبحث را با یک جلسه‌ی کوتاه و آرام آشتی بده — عشق از قدم کوچک شروع می‌شود.",
    emojis: ["❤️", "💌", "🌹", "💘", "💕"],
    banner: "border-rose-200/60 dark:border-rose-900/40 bg-gradient-to-l from-rose-50 via-white to-pink-50/70 dark:from-rose-950/30 dark:via-slate-800 dark:to-pink-950/20",
    accent: "#e11d48", // سرخِ عاشقانه
  },
  christmas: {
    id: "christmas",
    label: "کریسمس",
    emoji: "🎄",
    greeting: "کریسمس مبارک 🎄",
    note: "به رسم هدیه، امروز یک مبحث کوچک را کامل ببند و به خودت جایزه بده.",
    emojis: ["🎄", "🎁", "⛄", "✨", "🔔"],
    banner: "border-emerald-200/60 dark:border-emerald-900/40 bg-gradient-to-l from-emerald-50 via-white to-red-50/60 dark:from-emerald-950/30 dark:via-slate-800 dark:to-red-950/20",
    accent: "#059669", // سبزِ کریسمس
  },
  halloween: {
    id: "halloween",
    label: "هالووین",
    emoji: "🎃",
    greeting: "هالووین 🎃 از چی می‌ترسی؟ همان را بخوان!",
    note: "ترسناک‌ترین مبحثت کدام است؟ امروز ۱۵ دقیقه‌اش را بخوان تا هیولایش کوچک شود.",
    emojis: ["🎃", "👻", "🦇", "🕸️", "🕷️"],
    banner: "border-purple-200/60 dark:border-purple-900/40 bg-gradient-to-l from-purple-50 via-white to-orange-50/70 dark:from-purple-950/40 dark:via-slate-800 dark:to-orange-950/20",
    accent: "#7e22ce", // بنفشِ شبح‌وار
  },
  programmer: {
    id: "programmer",
    label: "روز برنامه‌نویس",
    emoji: "🤓",
    greeting: "روز برنامه‌نویس 🤓 (روز ۲۵۶م سال!)",
    note: "مغزت مثل کامپایلر است: خطاها را دانه‌دانه بگیر — دفتر اشتباهات بهترین دیباگر توست.",
    emojis: ["💻", "🤓", "⌨️", "🐛"],
    banner: "border-slate-200/60 dark:border-slate-700/60 bg-gradient-to-l from-slate-50 via-white to-emerald-50/70 dark:from-slate-950/40 dark:via-slate-800 dark:to-emerald-950/20",
    accent: "#059669", // سبزِ ترمینال
  },
};

interface DateParts {
  jm: number;
  jd: number;
  gm: number;
  gd: number;
  dayOfYear: number;
}

function partsOf(date: string): DateParts {
  const j = keyToJalali(date);
  const [gy, gm, gd] = date.split("-").map(Number);
  const start = Date.UTC(gy, 0, 1);
  const dayOfYear = Math.round((Date.UTC(gy, gm - 1, gd) - start) / 86_400_000) + 1;
  return { jm: j.jm, jd: j.jd, gm, gd, dayOfYear };
}

/** قانون‌های تطبیق — به ترتیب اولویت؛ اولین برد، تمِ روز است */
const RULES: { id: SeasonId; match: (p: DateParts) => boolean }[] = [
  { id: "yalda", match: (p) => p.jm === 9 && p.jd === 30 },
  { id: "chaharshanbe", match: (p) => p.jm === 12 && p.jd === 24 },
  { id: "teacher", match: (p) => p.jm === 12 && p.jd === 5 },
  { id: "mehregan", match: (p) => p.jm === 7 && p.jd === 16 }, // مهرگان: ۱۶ مهر
  { id: "children", match: (p) => p.gm === 11 && p.gd === 20 },
  { id: "gregorianNewYear", match: (p) => (p.gm === 12 && p.gd === 31) || (p.gm === 1 && p.gd === 1) },
  { id: "valentine", match: (p) => p.gm === 2 && p.gd === 14 },
  { id: "christmas", match: (p) => p.gm === 12 && p.gd === 25 },
  { id: "halloween", match: (p) => p.gm === 10 && p.gd === 31 },
  { id: "programmer", match: (p) => p.dayOfYear === 256 },
  { id: "nowruz", match: (p) => p.jm === 1 && p.jd <= 13 },
  { id: "summer", match: (p) => p.jm === 4 && p.jd === 1 },
  { id: "autumn", match: (p) => p.jm === 7 && p.jd === 1 },
  { id: "winter", match: (p) => p.jm === 10 && p.jd === 1 },
];

/** تمِ امروز از روی تاریخ (شمسی و میلادی) — null یعنی روز عادی */
export function seasonOf(today: string = todayKey()): SeasonTheme | null {
  const p = partsOf(today);
  for (const rule of RULES) {
    if (rule.match(p)) return SEASONS[rule.id];
  }
  return null;
}
