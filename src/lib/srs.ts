// ===== Spaced Repetition – extensible scheduler =====
import type { Rating, Review, StudyTask } from "../types";
import { addDays } from "./jalali";

export interface ScheduleContext {
  topicId: string;
  /** Last review for this topic (or null when scheduling after the first study) */
  previous: Review | null;
  rating: Rating;
  today: string;
  intervals: number[];
  idFactory: () => string;
}

export interface ReviewScheduler {
  next(ctx: ScheduleContext): Review;
}

/**
 * Default "stage table" scheduler.
 *  - rating 3 (perfect): advance a stage, interval × 1.5
 *  - rating 2 (good):    advance a stage, table interval
 *  - rating 1 (weak):    stay on stage, interval halved (min 1 day)
 *  - rating 0 (failed):  reset to stage 0, 1 day
 */
export class StageTableScheduler implements ReviewScheduler {
  next(ctx: ScheduleContext): Review {
    const { previous, rating, intervals, today } = ctx;
    const table = intervals.length ? intervals : [1, 3, 7, 14, 30];
    const prevStage = previous ? previous.stage : -1;
    const prevNumber = previous ? previous.reviewNumber : 0;

    let stage: number;
    let interval: number;

    switch (rating) {
      case 3: {
        stage = Math.min(prevStage + 1, table.length - 1);
        const base = table[stage];
        interval = Math.round(base * (prevStage + 1 >= table.length ? 2 : 1.5));
        break;
      }
      case 2: {
        stage = Math.min(prevStage + 1, table.length - 1);
        interval = table[stage];
        if (prevStage + 1 >= table.length && previous) interval = Math.round(previous.intervalDays * 1.5);
        break;
      }
      case 1: {
        stage = Math.max(0, prevStage);
        interval = Math.max(1, Math.round(table[stage] / 2));
        break;
      }
      default: {
        stage = 0;
        interval = 1;
      }
    }

    return {
      id: ctx.idFactory(),
      topicId: ctx.topicId,
      dueDate: addDays(today, interval),
      reviewNumber: prevNumber + 1,
      stage,
      intervalDays: interval,
      status: "pending",
    };
  }
}

export const defaultScheduler: ReviewScheduler = new StageTableScheduler();

export function classifyReviews(reviews: Review[], today: string) {
  const pending = reviews.filter((r) => r.status === "pending");
  return {
    overdue: pending.filter((r) => r.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    today: pending.filter((r) => r.dueDate === today),
    upcoming: pending.filter((r) => r.dueDate > today).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
  };
}

/**
 * تسک‌های «مرور» خودِ برنامه (موتور هوشمند: «مرور ۱ روز بعد»، «مرور ۴ روز بعد»…)
 * که سررسید شده‌اند یا عقب افتاده‌اند. همان‌هایی که تب «مرورها» کنار مرورهای
 * فاصله‌دار نشان می‌دهد؛ نشانِ تب و اعلان‌ها هم باید همین‌ها را بشمارند.
 */
export function duePlanReviewTasks(tasks: StudyTask[], today: string, activeTaskId?: string): StudyTask[] {
  return tasks.filter(
    (t) => t.kind === "review" && t.status === "pending" && t.id !== activeTaskId && t.date <= today,
  );
}

/**
 * بارِ مرورِ سررسیدشده — مرورهای فاصله‌دار + تسک‌های مرورِ برنامه، بدون شمارش دوباره.
 * (اگر برای یک مبحث و یک روز هم مرور فاصله‌دار و هم تسکِ مرور باشد، یکی شمرده می‌شود؛
 * دقیقاً همان قاعده‌ی نمایشِ تب «مرورها».)
 */
export function reviewLoad(
  reviews: Review[],
  tasks: StudyTask[],
  today: string,
  activeTaskId?: string,
): { overdue: number; today: number } {
  const groups = classifyReviews(reviews, today);
  const pendingSrsKeys = new Set(
    reviews.filter((r) => r.status === "pending").map((r) => `${r.topicId}|${r.dueDate}`),
  );
  const plan = duePlanReviewTasks(tasks, today, activeTaskId).filter(
    (t) => !pendingSrsKeys.has(`${t.topicId}|${t.date}`),
  );
  return {
    overdue: groups.overdue.length + plan.filter((t) => t.date < today).length,
    today: groups.today.length + plan.filter((t) => t.date === today).length,
  };
}
