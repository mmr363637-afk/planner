import { describe, it, expect } from "vitest";
import {
  eisenhowerQuads,
  recommendNext,
  paceEstimates,
  schedulePreview,
  classMinutes,
  planningFingerprint,
} from "../decisions";
import { EMPTY_STATE } from "../stateIO";
import type { AppState, StudyTask, Topic } from "../../types";
import { addDays, weekdayOf } from "../jalali";
const today = "2026-09-21";
const topic = (id = "t", over: Partial<Topic> = {}): Topic => ({
  id,
  subjectId: "s",
  name: id,
  estimatedMinutes: 60,
  volume: 1,
  priority: "medium",
  difficulty: 2,
  status: "learning",
  createdAt: 1,
  ...over,
});
const task = (
  id: string,
  date = today,
  over: Partial<StudyTask> = {},
): StudyTask => ({
  id,
  date,
  topicId: "t",
  plannedMinutes: 30,
  doneMinutes: 0,
  status: "pending",
  priority: "medium",
  order: 0,
  ...over,
});
const state = (over: Partial<AppState> = {}): AppState => ({
  ...EMPTY_STATE,
  subjects: [
    { id: "s", name: "درس", color: "#0ff", priority: "high", createdAt: 1 },
  ],
  topics: [topic()],
  ...over,
});
describe("exclusive Eisenhower quadrants", () => {
  it("every pending task appears exactly once, with urgent non-important tasks in quick", () => {
    const tasks = [
      task("a", today, { important: true }),
      task("b", addDays(today, 1), { important: true }),
      task("c"),
      task("d", addDays(today, 1)),
    ];
    const quads = eisenhowerQuads(tasks, today);
    expect(quads.map((q) => q.items.map((t) => t.id))).toEqual([
      ["a"],
      ["b"],
      ["c"],
      ["d"],
    ]);
  });
  it("overdue means urgent", () =>
    expect(
      eisenhowerQuads([task("a", addDays(today, -2))], today)[2].items,
    ).toHaveLength(1));
});
describe("next action", () => {
  it("explains due reviews, weak results and upcoming exam", () => {
    const s = state({
      reviews: [
        {
          id: "r",
          topicId: "t",
          dueDate: today,
          status: "pending",
          stage: 0,
          reviewNumber: 1,
          intervalDays: 1,
        },
      ],
      testLogs: [
        {
          id: "l",
          topicId: "t",
          date: today,
          total: 10,
          correct: 2,
          createdAt: 1,
        },
      ],
      exams: [
        {
          id: "e",
          title: "امتحان",
          subjectId: "s",
          date: addDays(today, 2),
          createdAt: 1,
        },
      ],
    });
    const r = recommendNext(s, today, 10)[0];
    expect(r.kind).toBe("review");
    expect(r.minutes).toBe(10);
    expect(r.reasons.length).toBeGreaterThanOrEqual(3);
  });
  it("does not recommend archived subjects or mastered topics without due work", () => {
    expect(
      recommendNext(
        state({
          subjects: [
            {
              id: "s",
              name: "s",
              color: "#fff",
              priority: "low",
              createdAt: 1,
              archived: true,
            },
          ],
        }),
        today,
      ),
    ).toEqual([]);
    expect(
      recommendNext(
        state({ topics: [topic("t", { status: "mastered" })] }),
        today,
      ),
    ).toEqual([]);
  });
  it("supports standalone due cards and handles an empty library", () => {
    expect(recommendNext(EMPTY_STATE, today)).toEqual([]);
    const s = state({
      flashcards: [
        {
          id: "c",
          front: "q",
          back: "a",
          ef: 2.5,
          intervalDays: 0,
          repetitions: 0,
          lapses: 0,
          dueDate: today,
          createdAt: 1,
        },
      ],
    });
    expect(recommendNext(s, today).some((r) => r.key === "cards:free")).toBe(
      true,
    );
  });
});
describe("empirical duration estimates", () => {
  it("needs three completed learning tasks, uses median, clamps outliers", () => {
    const tasks = [
      task("a", today, { status: "done", doneMinutes: 45 }),
      task("b", today, { status: "done", doneMinutes: 60 }),
      task("c", today, { status: "done", doneMinutes: 600 }),
    ];
    expect(paceEstimates(state({ tasks: tasks.slice(0, 2) }), today)).toEqual(
      [],
    );
    const e = paceEstimates(state({ tasks }), today)[0];
    expect(e.factor).toBe(2);
    expect(e.topicChanges[0].after).toBe(120);
  });
  it("does not compare incomplete or review tasks or reapply accepted evidence", () => {
    const tasks = ["a", "b", "c"].map((id) =>
      task(id, today, { status: "done", doneMinutes: 60 }),
    );
    expect(
      paceEstimates(
        state({ tasks: tasks.map((t) => ({ ...t, kind: "review" })) }),
        today,
      ),
    ).toEqual([]);
    expect(
      paceEstimates(
        state({
          tasks,
          settings: {
            ...EMPTY_STATE.settings,
            paceAccepted: { s: "a:30:60|b:30:60|c:30:60" },
          },
        }),
        today,
      ),
    ).toEqual([]);
  });
});
describe("non-destructive scheduling", () => {
  it("defers tasks within capacity without dropping minutes or mutating input", () => {
    const s = state({
      tasks: [
        task("a"),
        task("b"),
        task("done", today, { status: "done", doneMinutes: 30 }),
      ],
    });
    const before = JSON.stringify(s),
      p = schedulePreview(s, {
        today,
        end: addDays(today, 2),
        dailyMinutes: 30,
        todayMinutes: 30,
      });
    expect(p.unscheduled).toHaveLength(0);
    expect(p.changes).toHaveLength(1);
    expect(p.tasks.find((t) => t.id === "done")).toEqual(s.tasks[2]);
    expect(JSON.stringify(s)).toBe(before);
    expect(p.tasks.reduce((n, t) => n + t.plannedMinutes, 0)).toBe(90);
  });
  it("does not advance future spaced reviews", () => {
    const s = state({
      tasks: [task("r", addDays(today, 2), { kind: "review" })],
    });
    const p = schedulePreview(s, {
      today,
      end: addDays(today, 3),
      dailyMinutes: 120,
    });
    expect(p.tasks[0].date).toBe(addDays(today, 2));
  });
  it("preserves active and completed tasks", () => {
    const s = state({
      tasks: [task("a")],
      activeSession: {
        topicId: "t",
        taskId: "a",
        mode: "free",
        phase: "work",
        cycle: 0,
        running: true,
        startedAt: 1,
        accumulatedMs: 0,
        totalStudyMs: 0,
        sessionStartedAt: 1,
      },
    });
    expect(
      schedulePreview(s, {
        today,
        end: addDays(today, 3),
        dailyMinutes: 15,
        todayMinutes: 0,
      }).changes,
    ).toEqual([]);
  });
  it("respects off-days and deadlines; reports work that cannot fit", () => {
    const s = state({
      tasks: [task("a")],
      exams: [
        {
          id: "e",
          subjectId: "s",
          title: "e",
          date: addDays(today, 1),
          createdAt: 1,
        },
      ],
    });
    const p = schedulePreview(s, {
      today,
      end: addDays(today, 7),
      dailyMinutes: 60,
      offDays: [weekdayOf(today)],
    });
    expect(p.unscheduled).toHaveLength(1);
    expect(p.coverage).toBe(0);
    expect(p.tasks).toEqual(s.tasks);
  });
  it("unions overlapping fixed classes", () => {
    const blocks = [
      {
        id: "a",
        title: "a",
        weekday: 1,
        startMin: 60,
        endMin: 120,
        createdAt: 1,
      },
      {
        id: "b",
        title: "b",
        weekday: 1,
        startMin: 90,
        endMin: 150,
        createdAt: 1,
      },
    ];
    expect(classMinutes(state({ classBlocks: blocks }), 1)).toBe(90);
  });
  it("uses remaining time rather than redoing partially completed work", () => {
    const s = state({ tasks: [task("a", today, { doneMinutes: 20 })] });
    const p = schedulePreview(s, { today, end: today, dailyMinutes: 15 });
    expect(p.totalMinutes).toBe(10);
    expect(p.unscheduled).toHaveLength(0);
  });
  it("fingerprint changes on concurrent session or schedule edits", () => {
    const s = state();
    expect(planningFingerprint(s)).not.toBe(
      planningFingerprint({ ...s, tasks: [task("a")] }),
    );
  });
  it("limits the horizon and does not schedule missing topics or archived plans", () => {
    const s = state({ tasks: [task("a", today, { topicId: "missing" })] });
    const p = schedulePreview(s, {
      today,
      end: addDays(today, 999),
      dailyMinutes: 100,
    });
    expect(p.days).toHaveLength(90);
    expect(p.changes).toEqual([]);
  });
});
it("keeps a review after delayed learning, preserving the original gap", () => {
  const s = state({
    tasks: [
      task("learn", today, { kind: "learn" }),
      task("review", addDays(today, 2), { kind: "review" }),
    ],
  });
  const p = schedulePreview(s, {
    today,
    end: addDays(today, 5),
    dailyMinutes: 60,
    todayMinutes: 0,
    prioritize: true,
  });
  expect(p.tasks.find((t) => t.id === "learn")?.date).toBe(addDays(today, 1));
  expect(p.tasks.find((t) => t.id === "review")?.date).toBe(addDays(today, 3));
});
