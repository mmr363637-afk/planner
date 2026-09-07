// ===== الگوریتم SM-2 (SuperMemo-2) برای فلش‌کارت‌ها =====
// پیاده‌سازی استاندارد: کیفیت q از ۰ تا ۵.
//  - q >= 3: دنباله ادامه پیدا می‌کند؛ تکرار اول ۱ روز، دوم ۶ روز و بعدی‌ها interval × EF
//  - q < 3:  کارت ریست می‌شود (تکرار=۰، فاصله=۱ روز) و تعداد «لغزش» زیاد می‌شود
//  - EF' = EF + (0.1 − (5−q) × (0.08 + (5−q) × 0.02))  با کف ۱٫۳
// تابع خالص است و همان اینترفیس «زمان‌بند قابل تعویض» پروژه را رعایت می‌کند.

import type { Flashcard } from "../types";
import { addDays } from "./jalali";

export interface Sm2Grade {
  /** کیفیت پاسخ ۰..۵ — در UI: بلد نبودم=۱، سخت=۳، خوب=۴، آسون=۵ */
  quality: 0 | 1 | 2 | 3 | 4 | 5;
  today: string;
  idFactory?: () => string;
}

export const SM2_DEFAULT_EF = 2.5;
export const SM2_MIN_EF = 1.3;

/** ضریب سادگی بعدی طبق فرمول SM-2 */
export function nextEf(ef: number, quality: number): number {
  const q = Math.max(0, Math.min(5, quality));
  const raw = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  return Math.max(SM2_MIN_EF, Math.round(raw * 100) / 100);
}

/** اجرای کامل یک مرحله‌ی مرور: کارت جدید (برگشت تغییرنیافته در خطا) */
export function sm2Next(card: Flashcard, grade: Sm2Grade): Flashcard {
  const { quality, today } = grade;
  const ef = nextEf(card.ef, quality);
  let repetitions: number;
  let intervalDays: number;
  let lapses = card.lapses;
  if (quality < 3) {
    repetitions = 0;
    intervalDays = 1;
    lapses += 1;
  } else {
    repetitions = card.repetitions + 1;
    intervalDays = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.max(1, Math.round(card.intervalDays * ef));
  }
  return {
    ...card,
    ef,
    repetitions,
    intervalDays,
    lapses,
    dueDate: addDays(today, intervalDays),
    lastReviewedAt: Date.now(),
  };
}

/** آیا کارت برای امروز سررسید دارد؟ */
export function isDue(card: Flashcard, today: string): boolean {
  return card.dueDate <= today;
}

/** تفکیک کارت‌ها برای نمایش */
export function classifyCards(cards: Flashcard[], today: string) {
  const pending = cards.filter((c) => c.dueDate <= today);
  const due = pending.filter((c) => c.dueDate === today);
  const overdue = pending.filter((c) => c.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const upcoming = cards.filter((c) => c.dueDate > today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return { due, overdue, upcoming };
}
