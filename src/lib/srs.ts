// ===== Spaced Repetition – extensible scheduler =====
import type { Rating, Review } from "../types";
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
