// @vitest-environment jsdom
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configure, act, cleanup, renderHook } from "@testing-library/react";
configure({ asyncUtilTimeout: 10000 });
import { StoreProvider, useStore } from "../store";
import { minutesOnDate } from "../lib/stats";
import { addDays, todayKey } from "../lib/jalali";
import type { AppState } from "../types";

const START = new Date("2026-10-02T12:00:00").getTime();
const MINUTE = 60_000;
const saved = (): AppState => JSON.parse(localStorage.getItem("study-planner-v1")!);
const wrapper = ({ children }: { children: ReactNode }) => <StrictMode><StoreProvider>{children}</StoreProvider></StrictMode>;

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(START);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** سناریوی پایه: یک تسک امروز + یک تسک سه روز بعد */
function seedPlan() {
  const today = todayKey();
  localStorage.setItem("study-planner-v1", JSON.stringify({
    subjects: [
      { id: "subA", name: "ریاضی", color: "#0d9488", priority: "medium", createdAt: 1 },
      { id: "subB", name: "فیزیک", color: "#6366f1", priority: "medium", createdAt: 2 },
    ],
    topics: [
      { id: "topicA", subjectId: "subA", name: "مشتق", volume: 10, estimatedMinutes: 120, priority: "medium", difficulty: 2, status: "not_started", createdAt: 1 },
      { id: "topicF", subjectId: "subB", name: "حرکت", volume: 10, estimatedMinutes: 60, priority: "medium", difficulty: 2, status: "not_started", createdAt: 2 },
    ],
    tasks: [
      { id: "taskToday", planId: "p1", topicId: "topicA", date: today, plannedMinutes: 120, doneMinutes: 0, status: "pending", order: 0, priority: "medium", kind: "learn" },
      { id: "taskFuture", planId: "p1", topicId: "topicF", date: addDays(today, 3), plannedMinutes: 60, doneMinutes: 0, status: "pending", order: 0, priority: "medium", kind: "learn" },
    ],
    plans: [{ id: "p1", goal: "برنامه", startDate: today, endDate: addDays(today, 10), topicIds: ["topicA", "topicF"], studyDays: [0, 1, 2, 3, 4, 5, 6], dailyMinutes: 300, createdAt: 1, archived: false }],
  }));
}

describe("هماهنگی برنامه با ثبت مطالعه", () => {
  it("ثبت دستی مطالعه، تسک برنامه‌ی همان مبحث را پر و تمام می‌کند", () => {
    seedPlan();
    const { result } = renderHook(useStore, { wrapper });
    act(() => result.current.logManualSession("topicA", 60));
    const t = () => result.current.state.tasks.find((x) => x.id === "taskToday")!;
    expect(t().doneMinutes).toBe(60);
    expect(t().status).toBe("pending");
    act(() => result.current.logManualSession("topicA", 60));
    expect(t().status).toBe("done");
    expect(result.current.state.sessions).toHaveLength(2);
  });

  it("پیش‌خوانی مبحث آینده: تسک آینده تمام می‌شود و معادلش از برنامه‌ی امروز به فردا می‌رود", () => {
    seedPlan();
    const today = todayKey();
    const { result } = renderHook(useStore, { wrapper });
    act(() => result.current.logManualSession("topicF", 60));
    const tasks = result.current.state.tasks;
    expect(tasks.find((x) => x.id === "taskFuture")!.status).toBe("done");
    expect(tasks.find((x) => x.id === "taskToday")!.date).toBe(addDays(today, 1));
    expect(minutesOnDate(result.current.state.sessions, today)).toBe(60);
  });

  it("جلسه‌ی تایمری بدون تسک هم به تسک‌های برنامه واریز می‌شود", () => {
    seedPlan();
    const { result } = renderHook(useStore, { wrapper });
    act(() => result.current.startSession("topicA", "free"));
    vi.setSystemTime(START + 30 * MINUTE);
    act(() => { result.current.endSession(2); });
    const t = result.current.state.tasks.find((x) => x.id === "taskToday")!;
    expect(t.doneMinutes).toBe(30);
    expect(t.status).toBe("pending");
    expect(result.current.state.sessions[0].taskId).toBeUndefined();
  });

  it("تکمیل تسک از بخش برنامه، ساعت مطالعه ثبت می‌کند و برای تسک آینده بازچینی می‌کند", () => {
    seedPlan();
    const today = todayKey();
    const { result } = renderHook(useStore, { wrapper });
    act(() => result.current.completeTask("taskFuture"));
    const s = result.current.state;
    expect(s.tasks.find((x) => x.id === "taskFuture")!.status).toBe("done");
    // ۶۰ دقیقه مطالعه برای همین تسک ثبت شد
    expect(s.sessions).toHaveLength(1);
    expect(s.sessions[0]).toMatchObject({ topicId: "topicF", taskId: "taskFuture", durationMinutes: 60, rating: null });
    expect(minutesOnDate(s.sessions, today)).toBe(60);
    // بار امروز به فردا منتقل شد
    expect(s.tasks.find((x) => x.id === "taskToday")!.date).toBe(addDays(today, 1));
  });

  it("نوع فعالیت ثبت‌شده به تسک هم‌نوع واریز می‌شود", () => {
    const today = todayKey();
    localStorage.setItem("study-planner-v1", JSON.stringify({
      subjects: [{ id: "subA", name: "ریاضی", color: "#0d9488", priority: "medium", createdAt: 1 }],
      topics: [{ id: "topicA", subjectId: "subA", name: "مشتق", volume: 10, estimatedMinutes: 120, priority: "medium", difficulty: 2, status: "not_started", createdAt: 1 }],
      tasks: [
        { id: "learn", planId: "p1", topicId: "topicA", date: today, plannedMinutes: 60, doneMinutes: 0, status: "pending", order: 0, priority: "medium", kind: "learn" },
        { id: "test", planId: "p1", topicId: "topicA", date: today, plannedMinutes: 60, doneMinutes: 0, status: "pending", order: 1, priority: "medium", kind: "test" },
      ],
      plans: [{ id: "p1", goal: "برنامه", startDate: today, endDate: addDays(today, 5), topicIds: ["topicA"], studyDays: [0, 1, 2, 3, 4, 5, 6], dailyMinutes: 240, createdAt: 1, archived: false }],
    }));
    const { result } = renderHook(useStore, { wrapper });
    act(() => result.current.logManualSession("topicA", 45, "test"));
    const tasks = result.current.state.tasks;
    expect(tasks.find((x) => x.id === "test")!.doneMinutes).toBe(45);
    expect(tasks.find((x) => x.id === "learn")!.doneMinutes).toBe(0);
    expect(result.current.state.sessions[0].kind).toBe("test");
  });

  it("شروع جلسه از تسک برنامه، نوع همان تسک را به جلسه منتقل می‌کند", () => {
    const today = todayKey();
    localStorage.setItem("study-planner-v1", JSON.stringify({
      subjects: [{ id: "subA", name: "ریاضی", color: "#0d9488", priority: "medium", createdAt: 1 }],
      topics: [{ id: "topicA", subjectId: "subA", name: "مشتق", volume: 10, estimatedMinutes: 120, priority: "medium", difficulty: 2, status: "not_started", createdAt: 1 }],
      tasks: [
        { id: "test", planId: "p1", topicId: "topicA", date: today, plannedMinutes: 45, doneMinutes: 0, status: "pending", order: 0, priority: "medium", kind: "test", label: "تست آموزشی" },
      ],
      plans: [{ id: "p1", goal: "برنامه", startDate: today, endDate: addDays(today, 5), topicIds: ["topicA"], studyDays: [0, 1, 2, 3, 4, 5, 6], dailyMinutes: 240, createdAt: 1, archived: false }],
    }));
    const { result } = renderHook(useStore, { wrapper });
    act(() => result.current.startSession("topicA", "free", "test"));
    expect(result.current.state.activeSession?.kind).toBe("test");
    vi.setSystemTime(START + 45 * MINUTE);
    act(() => { result.current.endSession(2); });
    const s = result.current.state;
    expect(s.tasks[0]).toMatchObject({ status: "done", doneMinutes: 45 });
    expect(s.sessions[0].kind).toBe("test");
    expect(saved().tasks[0].status).toBe("done");
  });
});
