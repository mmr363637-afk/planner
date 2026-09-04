import { describe, expect, it } from "vitest";
import { availableDates, effectiveMinutes, generatePlan, overdueDays, replan, MIN_CHUNK } from "../planner";
import type { StudyTask, Topic } from "../../types";

let n = 0;
const id = () => `t${++n}`;

const topic = (over: Partial<Topic> & { id: string; subjectId: string }): Topic => ({
  name: over.id,
  volume: 10,
  estimatedMinutes: 60,
  priority: "medium",
  difficulty: 2,
  status: "not_started",
  createdAt: 0,
  ...over,
});

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

describe("availableDates", () => {
  it("returns only selected weekdays within range", () => {
    // 2025-01-04 is a Saturday
    const dates = availableDates("2025-01-04", "2025-01-10", [6, 0, 1, 2, 3, 4]); // Sat..Thu
    expect(dates).toHaveLength(6);
    expect(dates).not.toContain("2025-01-10"); // Friday
  });
  it("returns empty when end < start", () => {
    expect(availableDates("2025-01-10", "2025-01-04", ALL_DAYS)).toEqual([]);
  });
});

describe("effectiveMinutes", () => {
  it("scales by difficulty", () => {
    expect(effectiveMinutes(topic({ id: "a", subjectId: "s", difficulty: 1, estimatedMinutes: 100 }))).toBe(100);
    expect(effectiveMinutes(topic({ id: "a", subjectId: "s", difficulty: 3, estimatedMinutes: 100 }))).toBe(150);
  });
});

describe("generatePlan", () => {
  it("fits everything when capacity is sufficient and never exceeds daily capacity", () => {
    const topics = [
      topic({ id: "a", subjectId: "s1", estimatedMinutes: 60, difficulty: 1 }),
      topic({ id: "b", subjectId: "s1", estimatedMinutes: 90, difficulty: 1 }),
      topic({ id: "c", subjectId: "s2", estimatedMinutes: 45, difficulty: 1 }),
    ];
    const res = generatePlan({ planId: "p", topics, subjectPriority: {}, startDate: "2025-01-04", endDate: "2025-01-08", studyDays: ALL_DAYS, dailyMinutes: 120, idFactory: id });
    expect(res.scale).toBe(1);
    const total = res.tasks.reduce((s, t) => s + t.plannedMinutes, 0);
    expect(total).toBe(195);
    const byDay = new Map<string, number>();
    for (const t of res.tasks) byDay.set(t.date, (byDay.get(t.date) ?? 0) + t.plannedMinutes);
    for (const m of byDay.values()) expect(m).toBeLessThanOrEqual(120 + MIN_CHUNK);
    for (const t of res.tasks) expect(t.plannedMinutes).toBeGreaterThanOrEqual(MIN_CHUNK);
  });

  it("compresses proportionally when demand exceeds capacity", () => {
    const topics = [topic({ id: "a", subjectId: "s1", estimatedMinutes: 300, difficulty: 1 }), topic({ id: "b", subjectId: "s1", estimatedMinutes: 300, difficulty: 1 })];
    const res = generatePlan({ planId: "p", topics, subjectPriority: {}, startDate: "2025-01-04", endDate: "2025-01-05", studyDays: ALL_DAYS, dailyMinutes: 120, idFactory: id });
    expect(res.scale).toBeCloseTo(0.4);
    const total = res.tasks.reduce((s, t) => s + t.plannedMinutes, 0);
    expect(total).toBeLessThanOrEqual(240 + 2 * MIN_CHUNK);
    expect(new Set(res.tasks.map((t) => t.topicId)).size).toBe(2);
  });

  it("schedules high-priority topics first", () => {
    const topics = [topic({ id: "low", subjectId: "s1", priority: "low", estimatedMinutes: 60, difficulty: 1 }), topic({ id: "high", subjectId: "s1", priority: "high", estimatedMinutes: 60, difficulty: 1 })];
    const res = generatePlan({ planId: "p", topics, subjectPriority: {}, startDate: "2025-01-04", endDate: "2025-01-05", studyDays: ALL_DAYS, dailyMinutes: 60, idFactory: id });
    expect(res.tasks[0].topicId).toBe("high");
    expect(res.tasks[0].date).toBe("2025-01-04");
    expect(res.tasks[1].date).toBe("2025-01-05");
  });

  it("splits a long topic across days", () => {
    const topics = [topic({ id: "big", subjectId: "s1", estimatedMinutes: 200, difficulty: 1 })];
    const res = generatePlan({ planId: "p", topics, subjectPriority: {}, startDate: "2025-01-04", endDate: "2025-01-10", studyDays: ALL_DAYS, dailyMinutes: 60, idFactory: id });
    expect(res.tasks.length).toBeGreaterThan(1);
    expect(res.tasks.reduce((s, t) => s + t.plannedMinutes, 0)).toBe(200);
  });

  it("returns no tasks when there are no study days", () => {
    const res = generatePlan({ planId: "p", topics: [topic({ id: "a", subjectId: "s" })], subjectPriority: {}, startDate: "2025-01-04", endDate: "2025-01-04", studyDays: [5], dailyMinutes: 60 });
    expect(res.tasks).toEqual([]);
  });
});

describe("replan", () => {
  const mk = (over: Partial<StudyTask> & { id: string; topicId: string; date: string }): StudyTask => ({
    planId: "p",
    plannedMinutes: 60,
    doneMinutes: 0,
    status: "pending",
    order: 0,
    priority: "medium",
    ...over,
  });

  it("counts overdue days", () => {
    const tasks = [mk({ id: "1", topicId: "a", date: "2025-01-01" }), mk({ id: "2", topicId: "b", date: "2025-01-02" }), mk({ id: "3", topicId: "c", date: "2025-01-02", status: "done" })];
    expect(overdueDays(tasks, "2025-01-03")).toBe(2);
  });

  it("keeps finished tasks and redistributes pending minutes from today", () => {
    const topics = [topic({ id: "a", subjectId: "s" }), topic({ id: "b", subjectId: "s" }), topic({ id: "c", subjectId: "s" })];
    const tasks = [
      mk({ id: "1", topicId: "a", date: "2025-01-01", status: "done", doneMinutes: 60 }),
      mk({ id: "2", topicId: "b", date: "2025-01-02", doneMinutes: 20 }),
      mk({ id: "3", topicId: "c", date: "2025-01-05" }),
    ];
    const { keep, created } = replan({ planId: "p", tasks, topics, subjectPriority: {}, today: "2025-01-04", endDate: "2025-01-06", studyDays: ALL_DAYS, dailyMinutes: 60, idFactory: id });
    expect(keep.map((t) => t.id)).toEqual(["1"]);
    expect(created.every((t) => t.date >= "2025-01-04")).toBe(true);
    expect(created.reduce((s, t) => s + t.plannedMinutes, 0)).toBe(100); // 40 remaining of b + 60 of c
  });
});
