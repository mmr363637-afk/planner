// ===== 🎬 ویدیوهای راهنمای اپ =====
//
// ویدیوها داخلِ خودِ اپ سرو می‌شوند (`public/guide/epNN.mp4`) و اپ آفلاین (~۱۲
// مگابایت) این‌ها را با خودش می‌برد؛ پس پخش بدونِ اینترنت هم کار می‌کند و به
// یوتیوب/آپلودِ بیرونی وابسته نیست.
//
// ⚠️ نکته‌ی مهمِ معماری: فایل‌های ویدیو عمداً هیچ‌وقت «از پیش» دانلود نمی‌شوند.
// حلقهٔ `for` روی همهٔ قسمت‌ها با `preload="auto"` یعنی ~۱۲ مگابایت درخواستِ
// هم‌زمان و کندی/کرش روی گوشی — همان دستهٔ باگی که درسنامه‌ها را کند کرده بود.
// این‌جا فقط فهرست/متادیتای سبک هست و خودِ ویدیو زمانی می‌آید که کاربر همان
// قسمت را باز کند.
//
// هر قسمت با «درسِ راهنما» و «بخشِ اپ» برچسب خورده تا کاربر بداند کدام ویدیو
// به چه کاری مربوط است (فهرستِ شماره‌دارِ خشک، چیزی یاد نمی‌داد).

export interface GuideVideo {
  /** شمارهٔ قسمت — کلیدِ پایدار */
  id: string;
  /** شماره‌ی نمایشی (۱..۱۰) */
  episode: number;
  title: string;
  /** یک جملهٔ کوتاه: این قسمت چه چیزی را حل می‌کند */
  summary: string;
  /** طولِ ویدیو به ثانیه (از خودِ فایل) */
  seconds: number;
  /** مسیرِ نسبی داخلِ اپ */
  src: string;
  /** اندازهٔ تقریبی به مگابایت — برای شفافیتِ مصرفِ اینترنت */
  mb: number;
  /** موضوع برای گروه‌بندی/فیلتر */
  topic: "شروع" | "برنامه‌ریزی" | "مطالعه" | "مرور" | "محتوا" | "پیشرفت";
  /** برچسب‌های جست‌وجو */
  keywords: string[];
}

/**
 * فهرستِ رسمیِ راهنما. اگر روزی فایلِ تازه‌ای اضافه شد، فقط همین آرایه را
 * به‌روز کن؛ بقیهٔ اپ (فهرست، جست‌وجو، پخش) خودکار هماهنگ می‌شود.
 */
export const GUIDE_VIDEOS: GuideVideo[] = [
  {
    id: "run-ep01",
    episode: 1,
    title: "شروعِ کار با برنامه‌ریز مطالعه",
    summary: "اولین باز کردنِ اپ، ساختِ درس و مبحث، و اینکه هر تب چه کاری می‌کند.",
    seconds: 48,
    src: "guide/ep01.mp4",
    mb: 1,
    topic: "شروع",
    keywords: ["شروع", "نصب", "اولین", "درس", "مبحث", "تب"],
  },
  {
    id: "run-ep02",
    episode: 2,
    title: "ساختِ برنامهٔ مطالعه",
    summary: "انتخابِ مبحث‌ها، بازهٔ زمانی و دقیقهٔ روزانه تا برنامه‌ی واقع‌بینانه ساخته شود.",
    seconds: 36,
    src: "guide/ep02.mp4",
    mb: 0.9,
    topic: "برنامه‌ریزی",
    keywords: ["برنامه", "پلن", "ویزارد", "دقیقه", "بازه", "زمان‌بندی"],
  },
  {
    id: "run-ep03",
    episode: 3,
    title: "کارهای امروز و روزِ من",
    summary: "دیدنِ کارهای امروز، تیک‌زدن، جابه‌جایی و تایم‌لاینِ روز.",
    seconds: 42,
    src: "guide/ep03.mp4",
    mb: 1,
    topic: "برنامه‌ریزی",
    keywords: ["کارها", "امروز", "تایم‌لاین", "روز من", "تیک"],
  },
  {
    id: "run-ep04",
    episode: 4,
    title: "تایمرِ مطالعه و پومودورو",
    summary: "شروعِ جلسه، استراحت‌ها، پایانِ جلسه و ثبتِ ارزیابیِ یادگیری.",
    seconds: 96,
    src: "guide/ep04.mp4",
    mb: 2.2,
    topic: "مطالعه",
    keywords: ["تایمر", "پومودورو", "جلسه", "استراحت", "ارزیابی", "مطالعه"],
  },
  {
    id: "run-ep05",
    episode: 5,
    title: "فلش‌کارت و مرورِ فاصله‌دار",
    summary: "ساختنِ کارت برای یک مبحث، مرور، و اینکه مرورها کی برمی‌گردند.",
    seconds: 60,
    src: "guide/ep05.mp4",
    mb: 1.5,
    topic: "مرور",
    keywords: ["فلش‌کارت", "کارت", "مرور", "SM-2", "فاصله‌دار", "مبحث"],
  },
  {
    id: "run-ep06",
    episode: 6,
    title: "آمار، زنجیره و هدفِ روزانه",
    summary: "اینکه ساعتِ مطالعه چطور ثبت می‌شود و هدف/زنجیره را از کجا ببینی.",
    seconds: 48,
    src: "guide/ep06.mp4",
    mb: 1.1,
    topic: "پیشرفت",
    keywords: ["آمار", "زنجیره", "streak", "هدف", "گزارش"],
  },
  {
    id: "run-ep07",
    episode: 7,
    title: "درسنامه‌ها و کتابخانهٔ محتوا",
    summary: "پیدا کردنِ یک درسنامه، خواندنش در خودِ اپ و ثبتِ زمانِ مطالعه.",
    seconds: 42,
    src: "guide/ep07.mp4",
    mb: 0.9,
    topic: "محتوا",
    keywords: ["درسنامه", "کتابخانه", "محتوا", "خواندن", "زمان"],
  },
  {
    id: "run-ep08",
    episode: 8,
    title: "بانکِ سؤال پره‌انترنی و دستیاری",
    summary: "انتخابِ مبحث، آزمونِ تمرینی/زمان‌دار و دیدنِ تحلیلِ هر گزینه.",
    seconds: 48,
    src: "guide/ep08.mp4",
    mb: 1,
    topic: "محتوا",
    keywords: ["بانک", "سؤال", "آزمون", "پره‌انترنی", "دستیاری", "تحلیل"],
  },
  {
    id: "run-ep09",
    episode: 9,
    title: "تنظیمات، تم و پشتیبان‌گیری",
    summary: "تمِ روشن/تیره، اعلان‌ها، بکاپ و انتقالِ داده به گوشیِ تازه.",
    seconds: 54,
    src: "guide/ep09.mp4",
    mb: 1.2,
    topic: "شروع",
    keywords: ["تنظیمات", "تم", "بکاپ", "پشتیبان", "انتقال", "اعلان"],
  },
  {
    id: "run-ep10",
    episode: 10,
    title: "میان‌بُرها و ترفندهای کمترشناخته‌شده",
    summary: "منوی ☰، جست‌وجوی سراسری، مرورِ صوتی و حالتِ تمرکزِ عمیق.",
    seconds: 54,
    src: "guide/ep10.mp4",
    mb: 1.2,
    topic: "پیشرفت",
    keywords: ["میان‌بر", "منو", "جست‌وجو", "صوتی", "تمرکز", "ترفند"],
  },
];

/** موضوع‌های فهرست — برای چیپ‌های فیلتر */
export const GUIDE_TOPICS: GuideVideo["topic"][] = ["شروع", "برنامه‌ریزی", "مطالعه", "مرور", "محتوا", "پیشرفت"];

/** آدرسِ کاملِ ویدیو با base نسبیِ اپ (سازگار با GitHub Pages زیرمسیر) */
export function guideVideoUrl(video: GuideVideo, base = ""): string {
  // `base` می‌تواند "" یا "./" (خروجی Vite با base:"./") یا "/planner/" باشد؛
  // در حالتِ «همین پوشه» چیزی به مسیر اضافه نمی‌شود تا آدرسِ نسبیِ تمیز بماند.
  const clean = String(base ?? "").replace(/\/+$/, "").replace(/^\.$/, "");
  const path = String(video.src ?? "").replace(/^(\.?\/+)/, "");
  return clean ? `${clean}/${path}` : path;
}

/** ۹۶ ثانیه → «۱:۳۶» (همیشه لاتین/دو رقمی برای خوانایی در RTL) */
export function formatVideoTime(seconds: number): string {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${String(rest).padStart(2, "0")}`;
}

/** جمعِ زمان و حجمِ همهٔ ویدیوها — برای نمایشِ «۱۹ دقیقه · ۱۲ مگابایت» */
export function guideTotals(videos: GuideVideo[] = GUIDE_VIDEOS): { seconds: number; mb: number } {
  return videos.reduce(
    (acc, v) => ({ seconds: acc.seconds + v.seconds, mb: acc.mb + v.mb }),
    { seconds: 0, mb: 0 },
  );
}

/**
 * جست‌وجو/فیلترِ فهرستِ راهنما — عنوان، خلاصه، موضوع و برچسب‌ها.
 * نرمال‌سازی و امتیازدهی همان موتورِ مشترکِ `textSearch` است.
 */
export function searchGuideVideos(
  videos: GuideVideo[],
  query: string,
  topic: GuideVideo["topic"] | "all" = "all",
  score: (q: string, fields: { text: string; weight?: number }[]) => number,
): GuideVideo[] {
  const list = topic === "all" ? videos : videos.filter((v) => v.topic === topic);
  const q = query.trim();
  if (!q) return list;
  const scored = list
    .map((v) => ({
      v,
      s: score(q, [
        { text: v.title, weight: 1.3 },
        { text: v.summary, weight: 0.8 },
        { text: v.topic, weight: 0.9 },
        { text: v.keywords.join(" "), weight: 1 },
        { text: `قسمت ${v.episode}`, weight: 0.7 },
      ]),
    }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  return scored.map((x) => x.v);
}

/** کلیدِ localStorage برای «کدام قسمت‌ها دیده شده‌اند» (روی دستگاهِ کاربر) */
export const GUIDE_SEEN_KEY = "sp_guide_seen_v1";

export function readSeenGuide(): string[] {
  try {
    const raw = localStorage.getItem(GUIDE_SEEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, 100) : [];
  } catch {
    return [];
  }
}

export function markGuideSeen(id: string): string[] {
  const next = Array.from(new Set([...readSeenGuide(), id])).slice(-100);
  try {
    localStorage.setItem(GUIDE_SEEN_KEY, JSON.stringify(next));
  } catch {
    /* پر بودنِ سهمیه نباید راهنما را از کار بیندازد */
  }
  return next;
}
