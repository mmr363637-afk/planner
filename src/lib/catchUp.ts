// ===== پیشنهاد ترمیمِ هوشمندِ عقب‌افتادگی =====
// وقتی کارهای عقب‌افتاده داری، چقدر باید بیشتر بخوانی تا جمع شود — به‌صورت کمّی.
import type { StudyPlan, StudyTask } from "../types";
import { diffDays, todayKey } from "./jalali";

export interface CatchUpSummary {
  /** مجموع دقایقِ انجام‌نشده‌ی روزهای گذشته */
  overdueMinutes: number;
  /** روزهای باقی‌مانده تا نزدیک‌ترین پایانِ برنامه‌ی فعال (حداقل ۱) */
  daysLeft: number;
  /** دقیقه‌ی اضافه در روز برای جمع‌کردن عقب‌ماندگی */
  dailyExtra: number;
  /** آیا با بازه‌ی باقی‌مانده شدنی‌ست؟ */
  feasible: boolean;
  /** حداکثر دقیقه‌ی اضافه‌ی معقول در روز */
  cap: number;
}

export function catchUpSummary(tasks: StudyTask[], plans: Pick<StudyPlan, "endDate" | "archived">[], today: string = todayKey()): CatchUpSummary {
  let overdueMinutes = 0;
  for (const t of tasks) {
    if (t.status === "pending" && t.date < today) {
      overdueMinutes += Math.max(0, t.plannedMinutes - t.doneMinutes);
    }
  }
  // نزدیک‌ترین پایان برنامه‌ی فعال؛ اگر نبود، پنجره‌ی ۷ روزه
  let endDate = null as string | null;
  for (const p of plans) {
    if (p.archived || p.endDate < today) continue;
    if (endDate == null || p.endDate < endDate) endDate = p.endDate;
  }
  const cap = 120; // بیشتر از دو ساعت اضافه در روز واقع‌بینانه نیست
  if (overdueMinutes === 0) {
    return { overdueMinutes: 0, daysLeft: 1, dailyExtra: 0, feasible: true, cap };
  }
  const daysLeft = Math.max(1, endDate ? diffDays(today, endDate) + 1 : 7);
  const dailyExtra = Math.ceil(overdueMinutes / daysLeft);
  return { overdueMinutes, daysLeft, dailyExtra, feasible: dailyExtra <= cap, cap };
}
