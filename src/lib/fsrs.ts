// ===== الگوریتم پیشرفته FSRS (Free Spaced Repetition Scheduler) =====
// جایگزین نسل جدید برای SM-2 کلاسیک بر مبنای مدل‌های حافظه ۲-مؤلفه‌ای (Stability و Retrievability)
// پارامترهای پایه‌ای تقریب‌زده‌شده برای اجرای بهینه کلاینت‌ساید:
// S: پایداری حافظه (تعداد روز تا احتمال یادآوری به ۹۰٪ برسد)
// D: درجه دشواری (۱ تا ۱۰)
// R: احتمال یادآوری = exp(ln(0.9) * t / S)

import type { Flashcard } from "../types";
import { addDays } from "./jalali";

export type FsrsRating = 1 | 2 | 3 | 4; // 1: فراموش/دوباره, 2: سخت, 3: خوب, 4: آسان

export interface FsrsCardState {
  stability: number; // S (روزها)
  difficulty: number; // D (1..10)
  reps: number;
  lapses: number;
}

const DEFAULT_STABILITY = 1.0;
const DEFAULT_DIFFICULTY = 5.0;

/** محاسبه فواصل بعدی FSRS بر اساس ارزیابی کاربر */
export function calculateFsrsNext(
  card: Flashcard,
  rating: FsrsRating,
  today: string
): Flashcard {
  let s = card.ef > 0 ? card.ef : DEFAULT_STABILITY; // ef موقتا به عنوان حامل پایداری S کار می‌کند اگر موجود باشد
  let d = DEFAULT_DIFFICULTY;
  let intervalDays = 1;
  let lapses = card.lapses;
  let reps = card.repetitions;

  switch (rating) {
    case 1: // Again (فراموش کردم)
      s = Math.max(0.5, s * 0.4);
      d = Math.min(10, d + 1.5);
      intervalDays = 1;
      lapses += 1;
      reps = 0;
      break;
    case 2: // Hard (سخت بود)
      s = Math.max(1, s * 1.2);
      d = Math.min(10, d + 0.5);
      intervalDays = Math.max(1, Math.round(s * 1.1));
      reps += 1;
      break;
    case 3: // Good (خوب و به‌موقع)
      s = reps === 0 ? 3 : Math.max(2, s * 2.4);
      d = Math.max(1, d - 0.2);
      intervalDays = Math.max(1, Math.round(s));
      reps += 1;
      break;
    case 4: // Easy (خیلی راحت)
      s = reps === 0 ? 6 : Math.max(4, s * 3.8);
      d = Math.max(1, d - 1.0);
      intervalDays = Math.max(2, Math.round(s * 1.3));
      reps += 1;
      break;
  }

  return {
    ...card,
    ef: Math.round(s * 100) / 100, // نگه‌داری پایداری در فیلد ef برای سازگاری کامل با تایپ‌ها
    repetitions: reps,
    intervalDays,
    lapses,
    dueDate: addDays(today, intervalDays),
    lastReviewedAt: Date.now(),
  };
}

/**
 * نگاشت چهار دکمه‌ی ارزیابی UI (کیفیت SM-2: 1/3/4/5) به درجه‌های FSRS (1..4).
 * این تنها نقطه‌ی اتصال UI موجود به الگوریتم جدید است — هیچ دکمه‌ای عوض نمی‌شود.
 */
export function mapQualityToFsrs(quality: 0 | 1 | 2 | 3 | 4 | 5): FsrsRating {
  if (quality <= 1) return 1; // Again — بلد نبودم
  if (quality === 3) return 2; // Hard — سخت
  if (quality === 4) return 3; // Good — خوب
  return 4; // Easy — آسون (quality 5)
}
