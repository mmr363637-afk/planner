// ===== نقشه‌ی شب قبل 🌙 — «فردا چی در پیش دارم؟» =====
// شب‌ها قبل از خواب، فردا را یک‌نگاه مرور کن: تسک‌ها + مرورها + امتحان نزدیک.
// خالص و تست‌پذیر — هیچ وابستگی به زمان حال ندارد (tomorrow ورودی می‌گیرد).
import type { Exam, Review, StudyTask, Topic } from "../types";
import { diffDays } from "./jalali";

export interface NightPlan {
  /** تسک‌های فردا (pending) — مرتب‌شده از سنگین به سبک */
  tasks: StudyTask[];
  /** مجموع دقایق تسک‌های فردا */
  totalMinutes: number;
  /** مرورهای سررسیده تا پایان فردا */
  reviewsDue: number;
  /** نزدیک‌ترین امتحان از فردا به بعد */
  nextExam: { title: string; daysLeft: number } | null;
  /** نام مبحث برای نمایش */
  topicName: (id: string | null | undefined) => string;
}

export function buildNightPlan(
  tasks: StudyTask[],
  reviews: Review[],
  exams: Exam[],
  topics: Topic[],
  tomorrow: string,
): NightPlan {
  const dayTasks = tasks
    .filter((t) => t.date === tomorrow && t.status === "pending")
    .sort((a, b) => b.plannedMinutes - a.plannedMinutes);
  const reviewsDue = reviews.filter((r) => r.status === "pending" && r.dueDate <= tomorrow).length;
  const upcoming = exams
    .filter((e) => e.date >= tomorrow)
    .sort((a, b) => (a.date === b.date ? (a.time ?? "").localeCompare(b.time ?? "") : a.date < b.date ? -1 : 1));
  const first = upcoming[0] ?? null;
  const byId = new Map(topics.map((t) => [t.id, t.name]));
  return {
    tasks: dayTasks,
    totalMinutes: dayTasks.reduce((s, t) => s + t.plannedMinutes, 0),
    reviewsDue,
    nextExam: first ? { title: first.title, daysLeft: diffDays(tomorrow, first.date) } : null,
    topicName: (id) => (id ? byId.get(id) ?? "مبحث حذف‌شده" : "مطالعه‌ی آزاد"),
  };
}
