// ===== ثبت صوتی — استخراج «چند دقیقه» از جمله‌ی فارسی =====
// مثال: «۴۵ دقیقه قلب خوندم» ← ۴۵ دقیقه + باقی‌مانده برای تطبیق درس

const FA_DIGITS: Record<string, string> = {
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

const NUMBER_WORDS: Record<string, number> = {
  "نیم": 0.5, "نصف": 0.5, "ربع": 0.25,
  "یک": 1, "یه": 1, "دو": 2, "سه": 3, "چهار": 4, "پنج": 5,
  "شش": 6, "شیش": 6, "هفت": 7, "هشت": 8, "نه": 9, "ده": 10,
  "یازده": 11, "دوازده": 12, "سیزده": 13, "چهارده": 14, "پانزده": 15,
  "شانزده": 16, "شونزده": 16, "هفده": 17, "هیجده": 18, "هجده": 18, "نوزده": 19,
  "بیست": 20, "سی": 30, "چهل": 40, "پنجاه": 50, "پنجه": 50, "شصت": 60, "شست": 60,
  "هفتاد": 70, "هشتاد": 80, "نود": 90, "صد": 100,
};

export interface VoiceLogParse {
  /** دقیقه‌ی استخراج‌شده — null اگر پیدا نشد */
  minutes: number | null;
  /** جمله بدون عبارت زمانی (برای تطبیق نام درس) */
  rest: string;
}

export function normalizeVoiceDigits(text: string): string {
  return text.replace(/[۰-۹٠-٩]/g, (d) => FA_DIGITS[d] ?? d);
}

/** «یک ساعت و نیم» و «دو ساعت و ربع» را هم می‌فهمد */
export function parseVoiceLog(raw: string): VoiceLogParse {
  const text = normalizeVoiceDigits(raw.trim().replace(/ي/g, "ی").replace(/ك/g, "ک"));
  // نیم ساعت / یک ساعت و نیم / X ساعت و نیم
  const hourHalf = text.match(/(.+?)\s*ساعت\s*(و\s*)?(نیم|نصف)/);
  if (hourHalf) {
    const hours = parseAmount(hourHalf[1]);
    if (hours != null) {
      return { minutes: Math.round(hours * 60 + 30), rest: text.replace(hourHalf[0], " ").trim() };
    }
  }
  // X ساعت
  const hourOnly = text.match(/(.+?)\s*ساعت/);
  if (hourOnly && !hourOnly[1].includes("دقیقه")) {
    const hours = parseAmount(hourOnly[1]);
    if (hours != null && hours > 0 && hours <= 16) {
      return { minutes: Math.round(hours * 60), rest: text.replace(hourOnly[0], " ").trim() };
    }
  }
  // نیم ساعت تنها
  if (/(^|\s)(نیم|نصف)\s*ساعت(\s|$)/.test(text)) {
    return { minutes: 30, rest: text.replace(/(نیم|نصف)\s*ساعت/, " ").trim() };
  }
  // X دقیقه
  const minOnly = text.match(/(.+?)\s*دقیقه/);
  if (minOnly) {
    const mins = parseAmount(minOnly[1]);
    if (mins != null && mins > 0 && mins <= 1440) {
      return { minutes: Math.round(mins), rest: text.replace(minOnly[0], " ").trim() };
    }
  }
  // عدد تنها (فرض: دقیقه)
  const lone = text.match(/(^|\s)(\d{1,4})(\s|$)/);
  if (lone) {
    const mins = Number(lone[2]);
    if (mins > 0 && mins <= 1440) {
      return { minutes: mins, rest: text.replace(lone[0], " ").trim() };
    }
  }
  return { minutes: null, rest: text };
}

/** «۴۵» یا «چهل و پنج» یا «دو» را به عدد تبدیل می‌کند */
function parseAmount(fragment: string): number | null {
  const clean = fragment.trim();
  const digits = clean.match(/(\d+(?:\.\d+)?)\s*$/);
  if (digits) return Number(digits[1]);
  // ترکیب «چهل و پنج»: حداکثر چند کلمه‌ی آخر
  const words = clean.split(/\s+/).filter((w) => w !== "و").slice(-3);
  let total = 0;
  let found = false;
  for (const w of words) {
    const v = NUMBER_WORDS[w];
    if (v == null) {
      // کلمه‌ی ناآشنا وسط عبارت — اگر چیزی یافته‌ایم همان را برگردان
      if (found) break;
      return null;
    }
    found = true;
    total += v;
  }
  return found ? total : null;
}
