import { describe, expect, it } from "vitest";
import { StageTableScheduler, classifyReviews } from "../srs";
import { UNASSIGNED_SUBJECT_ID, computeStreak, minutesBySubject, minutesInRange, minutesOnDate, planAdherence, totalMinutes } from "../stats";
import { addDays, diffDays, gregorianToJalali, jalaliToGregorian, startOfWeek, toFa } from "../jalali";
import type { Review, StudySession, StudyTask } from "../../types";

const scheduler = new StageTableScheduler();
const intervals = [1, 3, 7, 14, 30];
let n = 0;
const id = () => `r${++n}`;

describe("StageTableScheduler", () => {
  it("first review after a good session is 1 day later", () => {
    const r = scheduler.next({ topicId: "t", previous: null, rating: 2, today: "2025-01-01", intervals, idFactory: id });
    expect(r.dueDate).toBe("2025-01-02");
    expect(r.reviewNumber).toBe(1);
    expect(r.stage).toBe(0);
  });

  it("advances through the table on good ratings", () => {
    let prev: Review | null = null;
    const dues: number[] = [];
    let today = "2025-01-01";
    for (let i = 0; i < 5; i++) {
      const r: Review = scheduler.next({ topicId: "t", previous: prev, rating: 2, today, intervals, idFactory: id });
      dues.push(r.intervalDays);
      today = r.dueDate;
      prev = r;
    }
    expect(dues).toEqual([1, 3, 7, 14, 30]);
  });

  it("perfect rating grows interval by 1.5×", () => {
    const first = scheduler.next({ topicId: "t", previous: null, rating: 2, today: "2025-01-01", intervals, idFactory: id });
    const r = scheduler.next({ topicId: "t", previous: first, rating: 3, today: first.dueDate, intervals, idFactory: id });
    expect(r.intervalDays).toBe(Math.round(3 * 1.5));
  });

  it("failed rating resets to 1 day", () => {
    const prev: Review = { id: "x", topicId: "t", dueDate: "2025-01-20", reviewNumber: 3, stage: 2, intervalDays: 7, status: "pending" };
    const r = scheduler.next({ topicId: "t", previous: prev, rating: 0, today: "2025-01-20", intervals, idFactory: id });
    expect(r.stage).toBe(0);
    expect(r.intervalDays).toBe(1);
    expect(r.reviewNumber).toBe(4);
  });

  it("weak rating halves the interval without advancing", () => {
    const prev: Review = { id: "x", topicId: "t", dueDate: "2025-01-20", reviewNumber: 3, stage: 2, intervalDays: 7, status: "pending" };
    const r = scheduler.next({ topicId: "t", previous: prev, rating: 1, today: "2025-01-20", intervals, idFactory: id });
    expect(r.stage).toBe(2);
    expect(r.intervalDays).toBe(4);
  });
});

describe("classifyReviews", () => {
  it("splits into overdue / today / upcoming ignoring done", () => {
    const mk = (due: string, status: Review["status"] = "pending"): Review => ({ id: id(), topicId: "t", dueDate: due, reviewNumber: 1, stage: 0, intervalDays: 1, status });
    const g = classifyReviews([mk("2025-01-01"), mk("2025-01-05"), mk("2025-01-09"), mk("2025-01-01", "done")], "2025-01-05");
    expect(g.overdue).toHaveLength(1);
    expect(g.today).toHaveLength(1);
    expect(g.upcoming).toHaveLength(1);
  });
});

const session = (date: string, minutes: number): StudySession => ({ id: id(), topicId: "t", startedAt: 0, endedAt: 0, durationMinutes: minutes, rating: 2, mode: "free", date });

describe("study time", () => {
  const sessions = [session("2025-01-01", 30), session("2025-01-01", 45), session("2025-01-03", 60)];
  it("includes time-only and orphaned sessions in the unassigned breakdown", () => {
    const sessions = [session("2025-01-01", 10), { ...session("2025-01-01", 20), topicId: null, rating: null }];
    const breakdown = minutesBySubject(sessions, []);
    expect(breakdown[UNASSIGNED_SUBJECT_ID]).toBe(30);
    expect(Object.values(breakdown).reduce((a, b) => a + b, 0)).toBe(totalMinutes(sessions));
  });
  it("sums per day and range", () => {
    expect(minutesOnDate(sessions, "2025-01-01")).toBe(75);
    expect(minutesOnDate(sessions, "2025-01-02")).toBe(0);
    expect(minutesInRange(sessions, "2025-01-01", "2025-01-03")).toBe(135);
    expect(totalMinutes(sessions)).toBe(135);
  });
});

describe("computeStreak", () => {
  it("counts consecutive days ending today", () => {
    const s = [session("2025-01-03", 10), session("2025-01-04", 10), session("2025-01-05", 10)];
    expect(computeStreak(s, "2025-01-05")).toBe(3);
  });
  it("still counts when today has no session yet (ended yesterday)", () => {
    const s = [session("2025-01-03", 10), session("2025-01-04", 10)];
    expect(computeStreak(s, "2025-01-05")).toBe(2);
  });
  it("breaks after a gap", () => {
    const s = [session("2025-01-01", 10), session("2025-01-02", 10), session("2025-01-05", 10)];
    expect(computeStreak(s, "2025-01-05")).toBe(1);
    expect(computeStreak(s, "2025-01-07")).toBe(0);
  });
  it("is zero for no sessions", () => {
    expect(computeStreak([], "2025-01-05")).toBe(0);
  });
});

describe("planAdherence", () => {
  const task = (date: string, planned: number, done: number, status: StudyTask["status"]): StudyTask => ({ id: id(), topicId: "t", date, plannedMinutes: planned, doneMinutes: done, status, order: 0, priority: "medium" });
  it("computes percentage of planned minutes achieved", () => {
    const tasks = [task("2025-01-01", 60, 60, "done"), task("2025-01-02", 60, 30, "pending"), task("2025-01-03", 60, 0, "pending")];
    expect(planAdherence(tasks, "2025-01-01", "2025-01-03")).toBe(50);
  });
  it("returns 0 with no tasks", () => {
    expect(planAdherence([], "2025-01-01", "2025-01-03")).toBe(0);
  });
  it("caps at 100 and ignores skipped", () => {
    const tasks = [task("2025-01-01", 60, 120, "done"), task("2025-01-01", 60, 0, "skipped")];
    expect(planAdherence(tasks, "2025-01-01", "2025-01-01")).toBe(100);
  });
});

describe("jalali", () => {
  it("converts known dates both ways", () => {
    expect(gregorianToJalali(2024, 3, 20)).toEqual([1403, 1, 1]);
    expect(jalaliToGregorian(1403, 1, 1)).toEqual([2024, 3, 20]);
    expect(gregorianToJalali(2026, 9, 1)).toEqual([1405, 6, 10]);
  });
  it("date arithmetic", () => {
    expect(addDays("2025-01-31", 1)).toBe("2025-02-01");
    expect(diffDays("2025-01-01", "2025-01-10")).toBe(9);
    expect(startOfWeek("2025-01-08")).toBe("2025-01-04"); // Wed -> Sat
  });
  it("persian digits", () => {
    expect(toFa(1405)).toBe("۱۴۰۵");
  });
});
