// تست‌های بچ آفلاین: سطل زباله، نقشه‌ی فردا، نمره تمرکز، چک‌لیست امتحان، پریست پومودورو
import { describe, expect, it } from "vitest";
import {
  TRASH_TTL_MS,
  makeTrashItem,
  pushTrash,
  purgeTrash,
  restoreTrashItem,
  snapshotPlan,
  snapshotSubject,
  snapshotTopics,
} from "../trash";
import { buildNightPlan } from "../nightBefore";
import { avgFocusScore, focusLast7Days, focusScoreOfSession } from "../stats";
import { defaultExamChecklist, toggleCheckItem } from "../examChecklist";
import { POMODORO_PRESETS, matchPomodoroPreset } from "../pomodoroPresets";
import { EMPTY_STATE } from "../stateIO";
import type { AppState, StudySession, StudyTask } from "../../types";

const base: AppState = { ...EMPTY_STATE, trash: [] };

const sess = (distractions?: number): StudySession => ({
  id: "s", topicId: null, startedAt: 1, endedAt: 2, durationMinutes: 25,
  rating: null, mode: "free", date: "2026-05-02", distractions,
});

const task = (over: Partial<StudyTask> & { id: string }): StudyTask => ({
  topicId: "t1", date: "2026-05-02", plannedMinutes: 30, doneMinutes: 0,
  status: "pending", order: 0, priority: "medium", ...over,
});

describe("سطل زباله", () => {
  it("makeTrashItem آیتم معتبر می‌سازد و pushTrash سقف ۱۰۰ را نگه می‌دارد", () => {
    const item = makeTrashItem("t1", "note", "یادداشت تست", { note: { id: "n1" } });
    expect(item.kind).toBe("note");
    expect(item.deletedAt).toBeLessThanOrEqual(Date.now());
    let trash = pushTrash([], item);
    expect(trash.length).toBe(1);
    for (let i = 0; i < 150; i++) {
      trash = pushTrash(trash, makeTrashItem(`x${i}`, "note", `n${i}`, {}));
    }
    expect(trash.length).toBe(100);
    // قدیمی‌ترین‌ها می‌پرند (t1 دیگر نیست)
    expect(trash.some((t) => t.id === "t1")).toBe(false);
  });

  it("purgeTrash آیتم‌های قدیمی‌تر از ۳۰ روز را می‌اندازد", () => {
    const old = { ...makeTrashItem("old", "note", "قدیمی", {}), deletedAt: Date.now() - TRASH_TTL_MS - 1000 };
    const fresh = makeTrashItem("fresh", "note", "تازه", {});
    const out = purgeTrash([old, fresh]);
    expect(out.map((t) => t.id)).toEqual(["fresh"]);
  });

  it("اسنپشات درس: درس + مباحث + جلسات/فلش‌کارت‌های همان مباحث", () => {
    const s: AppState = {
      ...base,
      subjects: [{ id: "s1", name: "قلب", color: "#f00", priority: "high", createdAt: 1 }],
      topics: [
        { id: "t1", subjectId: "s1", name: "آریتمی", volume: 1, estimatedMinutes: 10, priority: "medium", difficulty: 1, status: "learning", createdAt: 1 },
        { id: "t2", subjectId: "sX", name: "دیگر", volume: 1, estimatedMinutes: 10, priority: "medium", difficulty: 1, status: "learning", createdAt: 1 },
      ],
      sessions: [{ ...sess(), id: "ss1", topicId: "t1" }],
      flashcards: [{ id: "c1", topicId: "t1", front: "ف", back: "ب", ef: 2.5, intervalDays: 0, repetitions: 0, dueDate: "2026-01-01", lapses: 0, createdAt: 1 }],
    };
    const snap = snapshotSubject(s, "s1")!;
    expect(snap.label).toContain("قلب");
    expect(snap.snapshot.topics.map((t) => t.id)).toEqual(["t1"]);
    expect(snap.snapshot.sessions.map((x) => x.id)).toEqual(["ss1"]);
    expect(snap.snapshot.cards.map((x) => x.id)).toEqual(["c1"]);
    // درس ناموجود → null
    expect(snapshotSubject(s, "nope")).toBeNull();
  });

  it("اسنپشات برنامه: برنامه + تسک‌هایش", () => {
    const s: AppState = {
      ...base,
      plans: [{ id: "p1", goal: "گ", startDate: "2026-01-01", endDate: "2026-01-10", topicIds: ["t1"], studyDays: [6], dailyMinutes: 60, createdAt: 1, archived: false }],
      tasks: [task({ id: "a", planId: "p1" }), task({ id: "b" })],
    };
    const snap = snapshotPlan(s, "p1")!;
    expect(snap.label).toContain("گ");
    expect(snap.snapshot.tasks.map((t) => t.id)).toEqual(["a"]);
    expect(snapshotPlan(s, "nope")).toBeNull();
    // بازگردانی: برنامه + تسک‌هایش برمی‌گردند
    const next = restoreTrashItem(base, makeTrashItem("t1", "plan", snap.label, snap.snapshot));
    expect(next.plans.map((p) => p.id)).toEqual(["p1"]);
    expect(next.tasks.map((t) => t.id)).toEqual(["a"]);
  });

  it("restoreTrashItem برمی‌گرداند و تکراری‌ها را دوباره اضافه نمی‌کند (id-dedupe)", () => {
    const note = { id: "n1", text: "سلام", createdAt: 1 };
    const item = makeTrashItem("t1", "note", "یادداشت", { note });
    // اول: خالی است → اضافه می‌شود
    const once = restoreTrashItem(base, item);
    expect(once.notes?.map((n) => n.id)).toEqual(["n1"]);
    // دوم: همان آیتم دوباره → تکراری نمی‌شود
    const twice = restoreTrashItem(once, item);
    expect(twice.notes?.length).toBe(1);
  });

  it("restoreTrashItem آیتم خراب را نادیده می‌گیرد (کرش نمی‌کند)", () => {
    const bad = makeTrashItem("bad", "subject", "خراب", null);
    expect(restoreTrashItem(base, bad)).toBe(base);
    const unknown = makeTrashItem("u", "note", "x", { note: null });
    expect(restoreTrashItem(base, unknown).notes?.length ?? 0).toBe(0);
  });

  it("snapshotTopics چند مبحث + وابستگان را می‌گیرد", () => {
    const s: AppState = {
      ...base,
      topics: [
        { id: "t1", subjectId: "s1", name: "پدر", volume: 1, estimatedMinutes: 10, priority: "medium", difficulty: 1, status: "learning", createdAt: 1 },
        { id: "t2", subjectId: "s1", name: "فرزند", volume: 1, estimatedMinutes: 10, priority: "medium", difficulty: 1, status: "learning", createdAt: 1 },
      ],
      sessions: [{ ...sess(), id: "ss2", topicId: "t2" }],
    };
    const snap = snapshotTopics(s, ["t1", "t2"], "مبحث «پدر» و ۱ زیرمبحث");
    expect(snap.label).toContain("پدر");
    expect(snap.snapshot.topics.length).toBe(2);
    expect(snap.snapshot.sessions.map((x) => x.id)).toEqual(["ss2"]);
    const empty = snapshotTopics(s, ["nope"], "x");
    expect(empty.snapshot.topics).toEqual([]);
  });
});

describe("نقشه‌ی فردا", () => {
  it("تسک‌های فردا + مرورها + نزدیک‌ترین امتحان", () => {
    const plan = buildNightPlan(
      [
        task({ id: "a", date: "2026-05-02", plannedMinutes: 30 }),
        task({ id: "b", date: "2026-05-02", plannedMinutes: 90, kind: "test" }),
        task({ id: "c", date: "2026-05-02", plannedMinutes: 60, status: "done" }),
        task({ id: "d", date: "2026-05-03", plannedMinutes: 60 }),
      ],
      [
        { id: "r1", topicId: "t1", dueDate: "2026-05-02", reviewNumber: 1, stage: 0, intervalDays: 1, status: "pending" },
        { id: "r2", topicId: "t1", dueDate: "2026-05-05", reviewNumber: 1, stage: 0, intervalDays: 1, status: "pending" },
      ],
      [
        { id: "e1", title: "میان‌ترم", date: "2026-05-10", createdAt: 1 },
        { id: "e0", title: "گذشته", date: "2026-04-01", createdAt: 1 },
      ],
      [{ id: "t1", subjectId: "s1", name: "آریتمی", volume: 1, estimatedMinutes: 10, priority: "medium", difficulty: 1, status: "learning", createdAt: 1 }],
      "2026-05-02",
    );
    // فقط pendingهای فردا، سنگین به سبک
    expect(plan.tasks.map((t) => t.id)).toEqual(["b", "a"]);
    expect(plan.totalMinutes).toBe(120);
    expect(plan.reviewsDue).toBe(1);
    expect(plan.nextExam).toEqual({ title: "میان‌ترم", daysLeft: 8 });
    expect(plan.topicName("t1")).toBe("آریتمی");
    expect(plan.topicName("gone")).toBe("مبحث حذف‌شده");
  });
});

describe("نمره تمرکز", () => {
  it("هر حواس‌پرتی ۱۰ نمره کم می‌کند، کف ۲۰", () => {
    expect(focusScoreOfSession(sess(undefined))).toBe(100);
    expect(focusScoreOfSession(sess(0))).toBe(100);
    expect(focusScoreOfSession(sess(3))).toBe(70);
    expect(focusScoreOfSession(sess(99))).toBe(20);
  });
  it("میانگین و روند ۷ روزه", () => {
    expect(avgFocusScore([])).toBeNull();
    expect(avgFocusScore([sess(0), sess(2)])).toBe(90);
    const week = focusLast7Days([sess(1)], "2026-05-02");
    expect(week.length).toBe(7);
    expect(week[6]).toEqual({ date: "2026-05-02", distractions: 1, focus: 90, sessions: 1 });
    expect(week[0].focus).toBeNull();
  });
});

describe("چک‌لیست امتحان", () => {
  it("۷ قلم پیش‌فرض با شناسه‌ی پایدار + toggle خالص", () => {
    const list = defaultExamChecklist();
    expect(list.length).toBe(7);
    expect(new Set(list.map((i) => i.id)).size).toBe(7);
    expect(list.every((i) => !i.done)).toBe(true);
    const toggled = toggleCheckItem(list, list[0].id);
    expect(toggled[0].done).toBe(true);
    expect(list[0].done).toBe(false); // ورودی دست‌نخورده
  });
});

describe("پریست پومودورو", () => {
  it("۵ پریست یکتا + تطبیق دقیق", () => {
    expect(POMODORO_PRESETS.length).toBe(5);
    expect(new Set(POMODORO_PRESETS.map((p) => p.id)).size).toBe(5);
    expect(matchPomodoroPreset({ work: 25, shortBreak: 5, longBreak: 15, cycles: 4 })).toBe("classic");
    expect(matchPomodoroPreset({ work: 26, shortBreak: 5, longBreak: 15, cycles: 4 })).toBeNull();
  });
});
