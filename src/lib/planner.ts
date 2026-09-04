// ===== Planning Engine – pure, testable =====
import type { Priority, StudyTask, Topic } from "../types";
import { addDays, diffDays, weekdayOf } from "./jalali";

export interface PlanInput {
  planId: string;
  topics: Topic[];
  subjectPriority: Record<string, Priority>;
  startDate: string;
  endDate: string;
  studyDays: number[]; // JS weekdays
  dailyMinutes: number;
  /** Minutes already completed per topic (used by replan) */
  doneMinutesByTopic?: Record<string, number>;
  idFactory?: () => string;
}

const PRIORITY_WEIGHT: Record<Priority, number> = { high: 3, medium: 2, low: 1 };
const DIFFICULTY_FACTOR: Record<number, number> = { 1: 1, 2: 1.2, 3: 1.5 };
export const MIN_CHUNK = 15; // minutes
const ROUND_TO = 5;

function roundTo(n: number, step = ROUND_TO) {
  return Math.max(step, Math.round(n / step) * step);
}

let counter = 0;
export function defaultId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${counter}`;
}

/** All study dates in [start, end] whose weekday is included in studyDays */
export function availableDates(startDate: string, endDate: string, studyDays: number[]): string[] {
  const total = diffDays(startDate, endDate);
  if (total < 0) return [];
  const dates: string[] = [];
  for (let i = 0; i <= total; i++) {
    const d = addDays(startDate, i);
    if (studyDays.includes(weekdayOf(d))) dates.push(d);
  }
  return dates;
}

/** Effective minutes for a topic considering its difficulty */
export function effectiveMinutes(topic: Topic): number {
  return topic.estimatedMinutes * (DIFFICULTY_FACTOR[topic.difficulty] ?? 1);
}

/** Score used to order topics: higher first */
export function topicScore(topic: Topic, subjectPriority: Priority): number {
  return PRIORITY_WEIGHT[topic.priority] * 10 + PRIORITY_WEIGHT[subjectPriority] * 3 + topic.difficulty;
}

export interface PlanResult {
  tasks: StudyTask[];
  totalNeeded: number; // minutes (effective, after removing done)
  totalCapacity: number;
  scale: number; // 1 = fits, <1 = compressed
  dates: string[];
}

/**
 * Distributes topics across available dates.
 *  - Topics are ordered by priority/difficulty.
 *  - If total need exceeds capacity, every topic is proportionally compressed.
 *  - A topic that does not fit in the remaining capacity of a day is split
 *    into chunks (min MIN_CHUNK minutes) across consecutive days.
 */
export function generatePlan(input: PlanInput): PlanResult {
  const id = input.idFactory ?? defaultId;
  const dates = availableDates(input.startDate, input.endDate, input.studyDays);
  const done = input.doneMinutesByTopic ?? {};

  const items = input.topics
    .map((t) => {
      const remaining = Math.max(0, effectiveMinutes(t) - (done[t.id] ?? 0));
      return { topic: t, minutes: remaining, score: topicScore(t, input.subjectPriority[t.subjectId] ?? "medium") };
    })
    .filter((it) => it.minutes > 0)
    .sort((a, b) => b.score - a.score || a.topic.createdAt - b.topic.createdAt);

  const totalNeeded = items.reduce((s, it) => s + it.minutes, 0);
  const totalCapacity = dates.length * input.dailyMinutes;

  if (dates.length === 0 || totalNeeded === 0 || input.dailyMinutes <= 0) {
    return { tasks: [], totalNeeded, totalCapacity, scale: 1, dates };
  }

  const scale = totalNeeded > totalCapacity ? totalCapacity / totalNeeded : 1;

  // Allocate minutes per topic (compressed if needed), rounded to 5 minutes
  const queue = items.map((it) => ({
    topic: it.topic,
    remaining: roundTo(it.minutes * scale),
  }));

  const tasks: StudyTask[] = [];
  let dayIdx = 0;
  let dayLeft = input.dailyMinutes;
  let order = 0;

  // Simple ordering heuristic: interleave subjects so a day isn't a single subject when possible.
  // We keep priority order but rotate between subjects at equal priority tiers.
  const interleaved = interleaveBySubject(queue);

  for (const item of interleaved) {
    while (item.remaining > 0 && dayIdx < dates.length) {
      if (dayLeft < MIN_CHUNK) {
        dayIdx++;
        dayLeft = input.dailyMinutes;
        order = 0;
        continue;
      }
      let chunk = Math.min(item.remaining, dayLeft);
      // Avoid leaving a tiny tail (< MIN_CHUNK) for the next day
      const tail = item.remaining - chunk;
      if (tail > 0 && tail < MIN_CHUNK) {
        if (chunk - MIN_CHUNK >= MIN_CHUNK) chunk -= MIN_CHUNK; // leave a bigger tail
        else if (item.remaining <= dayLeft + MIN_CHUNK) chunk = item.remaining; // slight overflow is OK
      }
      chunk = Math.max(MIN_CHUNK, Math.min(chunk, item.remaining));
      tasks.push({
        id: id(),
        planId: input.planId,
        topicId: item.topic.id,
        date: dates[dayIdx],
        plannedMinutes: chunk,
        doneMinutes: 0,
        status: "pending",
        order: order++,
        priority: item.topic.priority,
      });
      item.remaining -= chunk;
      dayLeft -= chunk;
    }
  }

  // Anything left over (should be rare due to compression) is appended to the last day
  const last = dates[dates.length - 1];
  for (const item of interleaved) {
    if (item.remaining > 0) {
      tasks.push({
        id: id(),
        planId: input.planId,
        topicId: item.topic.id,
        date: last,
        plannedMinutes: item.remaining,
        doneMinutes: 0,
        status: "pending",
        order: order++,
        priority: item.topic.priority,
      });
      item.remaining = 0;
    }
  }

  return { tasks, totalNeeded, totalCapacity, scale, dates };
}

function interleaveBySubject<T extends { topic: Topic }>(items: T[]): T[] {
  // Group consecutive items into tiers by priority, then round-robin over subjects within a tier
  const tiers = new Map<Priority, T[]>();
  for (const it of items) {
    const list = tiers.get(it.topic.priority) ?? [];
    list.push(it);
    tiers.set(it.topic.priority, list);
  }
  const out: T[] = [];
  for (const p of ["high", "medium", "low"] as Priority[]) {
    const tier = tiers.get(p);
    if (!tier) continue;
    const bySubject = new Map<string, T[]>();
    for (const it of tier) {
      const l = bySubject.get(it.topic.subjectId) ?? [];
      l.push(it);
      bySubject.set(it.topic.subjectId, l);
    }
    const lists = [...bySubject.values()];
    let any = true;
    while (any) {
      any = false;
      for (const l of lists) {
        const next = l.shift();
        if (next) {
          out.push(next);
          any = true;
        }
      }
    }
  }
  return out;
}

export interface ReplanInput {
  planId: string;
  tasks: StudyTask[]; // all tasks of the plan
  topics: Topic[];
  subjectPriority: Record<string, Priority>;
  today: string;
  endDate: string;
  studyDays: number[];
  dailyMinutes: number;
  idFactory?: () => string;
}

/** Number of days with unfinished tasks strictly before today */
export function overdueDays(tasks: StudyTask[], today: string): number {
  const days = new Set(tasks.filter((t) => t.status === "pending" && t.date < today).map((t) => t.date));
  return days.size;
}

/**
 * Re-distributes everything not yet finished (overdue + future) from today until endDate.
 * Completed tasks are preserved; pending ones are replaced.
 */
export function replan(input: ReplanInput): { keep: StudyTask[]; created: StudyTask[]; result: PlanResult } {
  const planTasks = input.tasks.filter((t) => t.planId === input.planId);
  const keep = planTasks.filter((t) => t.status !== "pending");
  const pending = planTasks.filter((t) => t.status === "pending");

  // remaining planned minutes per topic (raw planned minus done, in planned units)
  const remainingByTopic = new Map<string, number>();
  for (const t of pending) {
    const rem = Math.max(0, t.plannedMinutes - t.doneMinutes);
    remainingByTopic.set(t.topicId, (remainingByTopic.get(t.topicId) ?? 0) + rem);
  }

  const topicMap = new Map(input.topics.map((t) => [t.id, t]));
  // Build pseudo-topics with the remaining planned minutes as their estimate (difficulty already applied)
  const pseudo: Topic[] = [];
  for (const [topicId, minutes] of remainingByTopic) {
    const t = topicMap.get(topicId);
    if (!t || minutes <= 0) continue;
    pseudo.push({ ...t, estimatedMinutes: minutes, difficulty: 1 });
  }

  const start = input.today > input.endDate ? input.endDate : input.today;
  const result = generatePlan({
    planId: input.planId,
    topics: pseudo,
    subjectPriority: input.subjectPriority,
    startDate: start,
    endDate: input.endDate < start ? start : input.endDate,
    studyDays: input.studyDays,
    dailyMinutes: input.dailyMinutes,
    idFactory: input.idFactory,
  });

  return { keep, created: result.tasks, result };
}
