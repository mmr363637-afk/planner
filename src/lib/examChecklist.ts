// ===== چک‌لیست روز امتحان 🎒 =====
// هر امتحان یک چک‌لیست شخصی دارد (وسایل + آمادگی‌های روز قبل) که با قالب
// پیش‌فرض شروع می‌شود و کاربر می‌تواند قلم اضافه/حذف کند.
import type { ExamCheckItem } from "../types";

export const DEFAULT_EXAM_CHECKLIST_LABELS = [
  "کارت ورود به جلسه",
  "کارت شناسایی",
  "دو خودکار اضافه + مداد",
  "خواب کافی شب قبل",
  "صبحانه‌ی سبک",
  "رسیدن ۳۰ دقیقه زودتر",
  "مرور فرمول‌ها و نکات آخر",
];

/** قالب پیش‌فرض — شناسه‌ها پایدارند تا تیک‌ها با ویرایش‌های بعدی قاطی نشوند */
export function defaultExamChecklist(): ExamCheckItem[] {
  return DEFAULT_EXAM_CHECKLIST_LABELS.map((label, i) => ({ id: `ex-${i}`, label, done: false }));
}

/** عوض کردن تیک یک قلم — خالص */
export function toggleCheckItem(list: ExamCheckItem[], id: string): ExamCheckItem[] {
  return list.map((i) => (i.id === id ? { ...i, done: !i.done } : i));
}
