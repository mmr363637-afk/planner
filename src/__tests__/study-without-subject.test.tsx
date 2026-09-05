// @vitest-environment jsdom
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import App from "../App";
import { StoreProvider, useStore } from "../store";
import { computeStreak, minutesBySubject, minutesOnDate, totalMinutes, UNASSIGNED_SUBJECT_ID } from "../lib/stats";
import { todayKey } from "../lib/jalali";
import type { AppState } from "../types";

const START = new Date("2026-09-05T12:00:00").getTime();
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

function seedTopic() {
  localStorage.setItem("study-planner-v1", JSON.stringify({
    subjects: [{ id: "subject", name: "درس دلخواه", color: "#0d9488", priority: "medium", createdAt: 1 }],
    topics: [{ id: "topic", subjectId: "subject", name: "مبحث من", volume: 10, estimatedMinutes: 60, priority: "medium", difficulty: 2, status: "not_started", createdAt: 1 }],
    tasks: [{ id: "task", topicId: "topic", date: todayKey(), plannedMinutes: 60, doneMinutes: 0, status: "pending", order: 0, priority: "medium" }],
    reviews: [{ id: "review", topicId: "topic", dueDate: todayKey(), reviewNumber: 1, stage: 0, intervalDays: 1, status: "pending" }],
  }));
}

describe("time-only study store", () => {
  it("saves time/XP/streak without creating a fake subject, assessment, review or task", () => {
    const { result } = renderHook(useStore, { wrapper });
    act(() => result.current.startSession(null, "free", "should-not-link"));
    vi.setSystemTime(START + 18 * MINUTE);
    act(() => { result.current.endSession(3); }); // even a caller-provided rating cannot award mastery XP
    const s = result.current.state;
    expect(s.sessions).toHaveLength(1);
    expect(s.sessions[0]).toMatchObject({ topicId: null, taskId: undefined, rating: null, durationMinutes: 18, mode: "free" });
    expect(s.activeSession).toBeNull();
    expect(s.subjects).toEqual([]);
    expect(s.topics).toEqual([]);
    expect(s.reviews).toEqual([]);
    expect(s.tasks).toEqual([]);
    expect(s.settings.xp - s.achievements.length * 50).toBe(18);
    expect(totalMinutes(s.sessions)).toBe(18);
    expect(minutesOnDate(s.sessions, todayKey())).toBe(18);
    expect(computeStreak(s.sessions)).toBe(1);
    expect(minutesBySubject(s.sessions, s.topics)).toEqual({ [UNASSIGNED_SUBJECT_ID]: 18 });
  });

  it("preserves the timer through pause, reload and resume; excludes paused time", () => {
    let hook = renderHook(useStore, { wrapper });
    act(() => hook.result.current.startSession(null, "free"));
    vi.setSystemTime(START + 12 * MINUTE);
    act(() => hook.result.current.pauseSession());
    expect(saved().activeSession?.topicId).toBeNull();
    hook.unmount();
    vi.setSystemTime(START + 20 * MINUTE);
    hook = renderHook(useStore, { wrapper });
    expect(hook.result.current.state.activeSession?.totalStudyMs).toBe(12 * MINUTE);
    act(() => hook.result.current.resumeSession());
    vi.setSystemTime(START + 25 * MINUTE);
    act(() => { hook.result.current.endSession(null); });
    expect(hook.result.current.state.sessions[0].durationMinutes).toBe(17);
  });

  it("excludes Pomodoro breaks even when ending during a break", () => {
    const { result } = renderHook(useStore, { wrapper });
    act(() => result.current.startSession(null, "pomodoro"));
    vi.setSystemTime(START + 25 * MINUTE);
    act(() => result.current.advancePhase());
    expect(result.current.state.activeSession?.phase).toBe("short");
    vi.setSystemTime(START + 30 * MINUTE);
    act(() => result.current.advancePhase());
    vi.setSystemTime(START + 40 * MINUTE);
    act(() => result.current.advancePhase());
    vi.setSystemTime(START + 43 * MINUTE);
    act(() => { result.current.endSession(null); });
    expect(result.current.state.sessions[0]).toMatchObject({ durationMinutes: 35, mode: "pomodoro", rating: null });
    expect(result.current.state.reviews).toEqual([]);
  });

  it("leaves existing lessons, tasks and reviews untouched and survives subject deletion", () => {
    seedTopic();
    const { result } = renderHook(useStore, { wrapper });
    const original = result.current.state;
    act(() => result.current.startSession(null, "free"));
    vi.setSystemTime(START + 10 * MINUTE);
    act(() => { result.current.endSession(null); });
    expect(result.current.state.subjects).toEqual(original.subjects);
    expect(result.current.state.topics).toEqual(original.topics);
    expect(result.current.state.tasks).toEqual(original.tasks);
    expect(result.current.state.reviews).toEqual(original.reviews);
    act(() => result.current.startSession(null, "free"));
    act(() => result.current.deleteSubject("subject"));
    expect(result.current.state.activeSession?.topicId).toBeNull();
    expect(result.current.state.activeSession).not.toBeNull();
    expect(result.current.state.sessions).toHaveLength(1);
  });

  it("keeps ordinary rated topic sessions and review scheduling intact", () => {
    seedTopic();
    const { result } = renderHook(useStore, { wrapper });
    act(() => result.current.startSession("topic", "free", "task"));
    vi.setSystemTime(START + 20 * MINUTE);
    act(() => { expect(result.current.endSession(null)).toBeNull(); });
    expect(result.current.state.activeSession).not.toBeNull();
    act(() => { result.current.endSession(3); });
    expect(result.current.state.sessions[0]).toMatchObject({ topicId: "topic", rating: 3, durationMinutes: 20 });
    expect(result.current.state.topics[0].status).toBe("mastered");
    expect(result.current.state.reviews).toHaveLength(1);
    expect(result.current.state.reviews[0].topicId).toBe("topic");
    expect(result.current.state.tasks[0].status).toBe("done");
  });

  it("cannot overwrite an active session, and discarding never logs time", () => {
    seedTopic();
    const { result } = renderHook(useStore, { wrapper });
    act(() => result.current.startSession(null, "free"));
    act(() => result.current.startSession("topic", "pomodoro"));
    expect(result.current.state.activeSession?.topicId).toBeNull();
    expect(result.current.state.activeSession?.mode).toBe("free");
    act(() => result.current.discardSession());
    expect(result.current.state.activeSession).toBeNull();
    expect(result.current.state.sessions).toEqual([]);
    expect(result.current.state.topics[0].status).toBe("not_started");
  });

  it("saves only once when finish is submitted twice in the same batch", () => {
    const { result } = renderHook(useStore, { wrapper });
    act(() => result.current.startSession(null, "free"));
    vi.setSystemTime(START + 6 * MINUTE);
    act(() => { result.current.endSession(null); result.current.endSession(null); });
    expect(result.current.state.sessions).toHaveLength(1);
    expect(result.current.state.sessions[0].durationMinutes).toBe(6);
  });

  it("round-trips null topic IDs through backup/restore without extra entities", () => {
    const { result } = renderHook(useStore, { wrapper });
    act(() => result.current.startSession(null, "free"));
    vi.setSystemTime(START + 9 * MINUTE);
    act(() => { result.current.endSession(null); });
    const backup = result.current.exportData();
    act(() => result.current.resetAll());
    act(() => { expect(result.current.importData(backup)).toBe(true); });
    expect(result.current.state.sessions[0]).toMatchObject({ topicId: null, rating: null, durationMinutes: 9 });
    expect(result.current.state.subjects).toEqual([]);
    expect(result.current.state.reviews).toEqual([]);
  });
});

describe("time-only study UI", () => {
  it("works with an empty library, survives navigation/reload, and appears in statistics", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "مطالعه" }));
    expect(screen.getByRole("button", { name: "مطالعه بدون درس" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "شروع مطالعه" }));
    expect(screen.getByRole("heading", { name: "مطالعه بدون درس" })).toBeTruthy();
    vi.setSystemTime(START + 8 * MINUTE);
    fireEvent.click(screen.getByRole("button", { name: "توقف تایمر" }));
    fireEvent.click(screen.getByRole("button", { name: "خانه" }));
    expect(screen.getByRole("button", { name: /متوقف · مطالعه بدون درس/ })).toBeTruthy();
    cleanup();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /متوقف · مطالعه بدون درس/ }));
    fireEvent.click(screen.getByTitle("پایان"));
    expect(screen.queryByText("کامل یاد گرفتم")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ثبت مطالعه" }));
    expect(screen.getByText(/زمان این جلسه بدون درس در آمار ثبت شد/)).toBeTruthy();
    expect(saved().sessions[0].durationMinutes).toBe(8);
    expect(saved().reviews).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "بازگشت به خانه" }));
    fireEvent.click(screen.getByRole("button", { name: "آمار" }));
    expect(screen.getByText("مطالعه بدون درس")).toBeTruthy();
    expect(screen.getByText("۸ دقیقه")).toBeTruthy();
  });

  it("lets a user switch from a scheduled topic to no subject, also in Pomodoro mode", () => {
    seedTopic();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "مطالعه" }));
    fireEvent.click(screen.getAllByText("مبحث من")[0]);
    fireEvent.click(screen.getByRole("button", { name: "مطالعه بدون درس" }));
    fireEvent.click(screen.getByRole("button", { name: /پومودورو ۲۵/ }));
    fireEvent.click(screen.getByRole("button", { name: "شروع پومودورو" }));
    expect(saved().activeSession).toMatchObject({ topicId: null, mode: "pomodoro" });
    expect(saved().activeSession?.taskId).toBeUndefined();
    expect(screen.getByRole("heading", { name: "مطالعه بدون درس" })).toBeTruthy();
    // The global watcher must handle the null topic on other pages as well.
    fireEvent.click(screen.getByRole("button", { name: "خانه" }));
    vi.setSystemTime(START + 25 * MINUTE);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(saved().activeSession?.phase).toBe("short");
  });
});
