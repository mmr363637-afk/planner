// @vitest-environment jsdom
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import App from "../App";
import { StoreProvider, useStore } from "../store";
import { SAMPLE_SUBJECTS } from "../lib/sampleData";
import type { AppState } from "../types";

const saved = (): AppState => JSON.parse(localStorage.getItem("study-planner-v1")!);

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function goSubjects() {
  fireEvent.click(screen.getByRole("button", { name: "برنامه" }));
  fireEvent.click(screen.getByRole("button", { name: "دروس" }));
}

describe("custom subjects alongside medical samples", () => {
  it("keeps a visible add-subject action after importing, with fresh forms and editable topics", () => {
    render(<StrictMode><App /></StrictMode>);
    goSubjects();
    fireEvent.click(screen.getByRole("button", { name: "یا بارگذاری نمونه دروس پزشکی" }));
    expect(saved().subjects).toHaveLength(SAMPLE_SUBJECTS.length);
    fireEvent.click(screen.getByRole("button", { name: "افزودن درس" }));
    expect((screen.getByRole("button", { name: "ذخیره" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("نام درس"), { target: { value: "  زبان انگلیسی  " } });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));
    const custom = saved().subjects.find((s) => s.name === "زبان انگلیسی")!;
    expect(custom).toBeDefined();
    expect(custom.sampleId).toBeUndefined();
    const topicsPanel = document.getElementById(`subject-topics-${custom.id}`)!;
    fireEvent.click(within(topicsPanel).getByRole("button", { name: "افزودن مبحث" }));
    fireEvent.change(screen.getByLabelText("نام مبحث"), { target: { value: "Reading" } });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));
    expect(saved().topics.find((t) => t.name === "Reading")?.subjectId).toBe(custom.id);
    fireEvent.click(within(topicsPanel).getByRole("button", { name: "افزودن مبحث" }));
    expect((screen.getByLabelText("نام مبحث") as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "انصراف" }));
    fireEvent.click(screen.getByRole("button", { name: "افزودن درس" }));
    expect((screen.getByLabelText("نام درس") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("نام درس"), { target: { value: "ریاضی" } });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));
    expect(saved().subjects).toHaveLength(SAMPLE_SUBJECTS.length + 2);

    // Updating from settings must not affect custom courses or recreate samples.
    const before = saved();
    fireEvent.click(screen.getByTitle("تنظیمات"));
    fireEvent.click(screen.getByRole("button", { name: "افزودن نمونه دروس پزشکی" }));
    expect(saved().subjects).toEqual(before.subjects);
    expect(saved().topics).toEqual(before.topics);
    fireEvent.click(screen.getByRole("button", { name: "مطالعه" }));
    fireEvent.click(screen.getByText("Reading"));
    fireEvent.click(screen.getByRole("button", { name: "شروع مطالعه" }));
    expect(saved().activeSession?.topicId).toBe(before.topics.find((t) => t.name === "Reading")!.id);
  });

  it("the study page offers a route to creating a custom lesson, even without any samples", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "مطالعه" }));
    fireEvent.click(screen.getByRole("button", { name: "افزودن درس" }));
    expect(screen.getByRole("button", { name: "افزودن اولین درس" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "افزودن اولین درس" }));
    expect(screen.getByLabelText("نام درس")).toBeTruthy();
  });

  it("preserves legacy sample history and keeps imported catalogue keys through backup/restore", () => {
    const legacy = {
      subjects: [{ id: "old-sub", name: "قلب", color: "#123456", priority: "high", createdAt: 1 }],
      topics: [{ id: "old-topic", subjectId: "old-sub", name: "Heart Failure", volume: 10, estimatedMinutes: 40, priority: "high", difficulty: 3, status: "learning", createdAt: 1 }],
      tasks: [{ id: "task", topicId: "old-topic", date: "2026-09-05", plannedMinutes: 40, doneMinutes: 20, status: "pending", order: 0, priority: "high" }],
      sessions: [{ id: "session", topicId: "old-topic", taskId: "task", startedAt: 1, endedAt: 2, durationMinutes: 20, date: "2026-09-05", rating: 2, mode: "free" }],
      reviews: [{ id: "review", topicId: "old-topic", dueDate: "2026-09-06", reviewNumber: 1, stage: 0, intervalDays: 1, status: "pending" }],
      plans: [{ id: "plan", goal: "قلب", topicIds: ["old-topic"], studyDays: [0], startDate: "2026-09-05", endDate: "2026-09-10", dailyMinutes: 60, createdAt: 1, archived: false }],
    };
    localStorage.setItem("study-planner-v1", JSON.stringify(legacy));
    const { result } = renderHook(useStore, { wrapper: StoreProvider });
    act(() => result.current.loadSampleData());
    for (const key of ["tasks", "sessions", "reviews", "plans"] as const) expect(result.current.state[key]).toEqual(legacy[key]);
    expect(result.current.state.subjects[0].id).toBe("old-sub");
    expect(result.current.state.topics[0].id).toBe("old-topic");
    act(() => result.current.updateSubject("old-sub", { name: "درس تغییرنام‌یافته" }));
    act(() => result.current.updateTopic("old-topic", { name: "مبحث تغییرنام‌یافته" }));
    const backup = result.current.exportData();
    act(() => result.current.resetAll());
    act(() => { expect(result.current.importData(backup)).toBe(true); });
    const restored = result.current.state;
    act(() => result.current.loadSampleData());
    expect(result.current.state.subjects).toEqual(restored.subjects);
    expect(result.current.state.topics).toEqual(restored.topics);
  });

  it("two imports in a single batch stay idempotent under React StrictMode", () => {
    const { result } = renderHook(useStore, { wrapper: ({ children }) => <StrictMode><StoreProvider>{children}</StoreProvider></StrictMode> });
    act(() => { result.current.loadSampleData(); result.current.loadSampleData(); });
    expect(result.current.state.subjects).toHaveLength(SAMPLE_SUBJECTS.length);
    expect(result.current.state.topics).toHaveLength(SAMPLE_SUBJECTS.flatMap((s) => s.topics).length);
  });
});

describe("page-specific static backgrounds", () => {
  it("uses matching decorative graphics for every page and plan sub-tab", () => {
    render(<App />);
    const check = (scene: string) => {
      const backdrop = document.querySelector(".page-backdrop")!;
      expect(backdrop.getAttribute("data-scene")).toBe(scene);
      expect(backdrop.getAttribute("aria-hidden")).toBe("true");
      expect(backdrop.querySelectorAll("svg")).toHaveLength(2);
      expect(backdrop.querySelector("button, a, img, canvas, video, animate")).toBeNull();
    };
    check("home");
    for (const [label, scene] of [["مطالعه", "study"], ["مرور", "reviews"], ["آمار", "stats"], ["امتحانات", "exams"]]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      check(scene);
    }
    expect(document.querySelector('[data-motif="clipboard"]')).toBeTruthy();
    expect(document.querySelector('[data-motif="cap"]')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "برنامه" }));
    check("calendar");
    fireEvent.click(screen.getByRole("button", { name: "برنامه‌ها" }));
    check("plans");
    fireEvent.click(screen.getByRole("button", { name: "دروس" }));
    check("subjects");
    fireEvent.click(screen.getByTitle("تنظیمات"));
    check("settings");
  });

  it("can be disabled, remains off after reload, and coexists with the dark/accent themes", () => {
    localStorage.setItem("study-planner-v1", JSON.stringify({ settings: { theme: "dark", accentColor: "#2563eb" } }));
    render(<App />);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--acc-600")).toBe("#2563eb");
    expect(saved().settings.pageBackgrounds).toBe(true);
    fireEvent.click(screen.getByTitle("تنظیمات"));
    fireEvent.click(screen.getByRole("switch", { name: "گرافیک پس‌زمینهٔ صفحه‌ها" }));
    expect(document.querySelector(".page-backdrop")).toBeNull();
    expect(saved().settings.pageBackgrounds).toBe(false);
    cleanup();
    render(<App />);
    expect(document.querySelector(".page-backdrop")).toBeNull();
    fireEvent.click(screen.getByTitle("تنظیمات"));
    fireEvent.click(screen.getByRole("switch", { name: "گرافیک پس‌زمینهٔ صفحه‌ها" }));
    expect(document.querySelector(".page-backdrop")).toBeTruthy();
  });
});
