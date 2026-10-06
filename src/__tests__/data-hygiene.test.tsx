// @vitest-environment jsdom
// نگهبان‌های داده: ورودیِ ناقص/قدیمی نباید برنامه را بشکند یا «NaN» بسازد.
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { StoreProvider, useStore } from "../store";
import { parseStateText } from "../lib/stateIO";
import { habitStreak, habitWeekCount } from "../lib/habits";
import { duePlanReviewTasks, reviewLoad } from "../lib/srs";
import { addDays, todayKey } from "../lib/jalali";
import type { Review, StudyTask } from "../types";

const wrapper = ({ children }: { children: ReactNode }) => <StrictMode><StoreProvider>{children}</StoreProvider></StrictMode>;

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-02T12:00:00").getTime());
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("بارِ مرور: تسک‌های «مرور» برنامه هم شمرده می‌شوند", () => {
  const today = "2026-10-02";
  const task = (over: Partial<StudyTask>): StudyTask => ({
    id: "t", topicId: "a", date: today, plannedMinutes: 30, doneMinutes: 0,
    status: "pending", order: 0, priority: "medium", ...over,
  });
  const review = (over: Partial<Review>): Review => ({
    id: "r", topicId: "a", dueDate: today, reviewNumber: 1, stage: 0, intervalDays: 1, status: "pending", ...over,
  });

  it("مرورهای فاصله‌دار و تسک‌های مرورِ سررسیدشده با هم شمرده می‌شوند", () => {
    const tasks = [
      task({ id: "due", kind: "review", date: today }),
      task({ id: "late", kind: "review", date: addDays(today, -3), label: "مرور ۳ روز بعد" }),
      task({ id: "future", kind: "review", date: addDays(today, 2) }),
      task({ id: "learn", kind: "learn" }),
      task({ id: "doneReview", kind: "review", status: "done", doneMinutes: 30 }),
    ];
    const load = reviewLoad([review({ id: "srs", topicId: "b" })], tasks, today);
    expect(load).toEqual({ today: 2, overdue: 1 });
  });

  it("مرورِ مبحثی که هم مرور فاصله‌دار و هم تسکِ مرور دارد، دو بار شمرده نمی‌شود", () => {
    const tasks = [task({ id: "dup", kind: "review", date: today, topicId: "a" })];
    const load = reviewLoad([review({ id: "srs", topicId: "a", dueDate: today })], tasks, today);
    expect(load).toEqual({ today: 1, overdue: 0 });
  });

  it("تسکِ جلسه‌ی فعال از شمارش کنار می‌رود و تسک‌های آینده هرگز شمرده نمی‌شوند", () => {
    const tasks = [task({ id: "active", kind: "review" }), task({ id: "future", kind: "review", date: addDays(today, 3) })];
    expect(duePlanReviewTasks(tasks, today, "active")).toHaveLength(0);
    expect(reviewLoad([], tasks, today, "active")).toEqual({ today: 0, overdue: 0 });
  });
});

describe("داده‌ی وارد‌شده‌ی ناقص", () => {
  it("عادتِ بدون history (بکاپ قدیمی) باعث خطا نمی‌شود و قابل تیک‌زدن است", () => {
    const today = todayKey();
    localStorage.setItem("study-planner-v1", JSON.stringify({
      subjects: [], topics: [], tasks: [], plans: [], sessions: [], reviews: [], flashcards: [],
      habits: [{ id: "h1", title: "خواب کافی", createdAt: 1 }], // بدون icon/targetPerWeek/history
    }));
    const { result } = renderHook(useStore, { wrapper });
    act(() => result.current.state.habits ?? []);
    expect(result.current.state.habits[0]).toMatchObject({ icon: "✅", targetPerWeek: 7, history: [] });
    act(() => result.current.toggleHabit("h1", today));
    expect(result.current.state.habits[0].history).toEqual([today]);
    expect(habitStreak(result.current.state.habits[0].history, today)).toBe(1);
    expect(habitWeekCount(undefined, today)).toBe(0);
  });

  it("فلش‌کارتِ بدون فیلدهای عددی، به کارتِ سالم تبدیل می‌شود (نه NaN)", () => {
    const state = parseStateText(JSON.stringify({
      subjects: [{ id: "s" }], topics: [], tasks: [], plans: [], sessions: [], reviews: [],
      flashcards: [{ id: "c1", front: "سوال", back: "جواب" }],
    }))!;
    expect(state.flashcards[0]).toMatchObject({ ef: 2.5, intervalDays: 0, repetitions: 0, lapses: 0, dueDate: todayKey() });
    expect(Number.isFinite(state.flashcards[0].ef)).toBe(true);
  });

  it("تسک/مرور/مبحثِ ناقص با مقدارهای سالم پر می‌شود و ساعت مطالعه NaN نمی‌شود", () => {
    const today = todayKey();
    const state = parseStateText(JSON.stringify({
      subjects: [{ id: "s1", name: "قلب" }],
      topics: [{ id: "t1", subjectId: "s1", name: "نارسایی" }],
      tasks: [{ id: "k1", topicId: "t1" }, { id: "noTopic" }, { id: "t2", topicId: "t1", plannedMinutes: Infinity }],
      reviews: [{ id: "r1", topicId: "t1" }],
      sessions: [{ id: "se1", topicId: null, durationMinutes: "۴۵" as unknown as number }],
      plans: [], flashcards: [],
    }))!;
    expect(state.topics[0]).toMatchObject({ status: "not_started", difficulty: 2, priority: "medium", estimatedMinutes: 60 });
    expect(state.tasks).toHaveLength(2); // تسکِ بدون topicId حذف می‌شود
    expect(state.tasks[0]).toMatchObject({ date: today, plannedMinutes: 0, doneMinutes: 0, status: "pending", priority: "medium" });
    expect(state.tasks[1].plannedMinutes).toBe(0); // Infinity → پیش‌فرض سالم
    expect(state.reviews[0]).toMatchObject({ dueDate: today, reviewNumber: 1, stage: 0, intervalDays: 1, status: "pending" });
    expect(state.sessions[0]).toMatchObject({ date: today, durationMinutes: 0, mode: "free" });
    expect(Number.isFinite(state.sessions[0].durationMinutes)).toBe(true);
  });
});
