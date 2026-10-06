// @vitest-environment jsdom
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configure, act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
configure({ asyncUtilTimeout: 10000 });
import { StoreProvider, useStore } from "../store";
import TestLogModal from "../components/TestLogModal";
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

describe("بازآموزی بعد از مرور/جلسه‌ی ضعیف", () => {
  function seedWithReview() {
    const today = todayKey();
    localStorage.setItem("study-planner-v1", JSON.stringify({
      subjects: [{ id: "subA", name: "ریاضی", color: "#0d9488", priority: "medium", createdAt: 1 }],
      topics: [{ id: "topicA", subjectId: "subA", name: "مشتق", volume: 10, estimatedMinutes: 150, priority: "medium", difficulty: 2, status: "learning", createdAt: 1 }],
      tasks: [
        { id: "taskToday", planId: "p1", topicId: "topicA", date: today, plannedMinutes: 120, doneMinutes: 0, status: "pending", order: 0, priority: "medium", kind: "learn" },
      ],
      reviews: [{ id: "rev1", topicId: "topicA", dueDate: today, reviewNumber: 1, stage: 0, intervalDays: 1, status: "pending" }],
      plans: [{ id: "p1", goal: "برنامه", startDate: today, endDate: addDays(today, 10), topicIds: ["topicA"], studyDays: [0, 1, 2, 3, 4, 5, 6], dailyMinutes: 300, createdAt: 1, archived: false }],
    }));
  }

  it("مرور با امتیاز ۰ → بازآموزی فردا و ۳ روز بعد برنامه‌ریزی می‌شود", () => {
    seedWithReview();
    const today = todayKey();
    const { result } = renderHook(useStore, { wrapper });
    act(() => result.current.completeReview("rev1", 0));
    const relearns = result.current.state.tasks.filter((t) => t.label === "🩹 بازآموزی");
    expect(relearns.map((t) => t.date).sort()).toEqual([addDays(today, 1), addDays(today, 3)]);
    expect(relearns.every((t) => t.topicId === "topicA" && t.kind === "learn" && t.status === "pending")).toBe(true);
    expect(result.current.state.topics[0].status).toBe("needs_review");
  });

  it("مرور خوب هیچ بازآموزی‌ای نمی‌سازد", () => {
    seedWithReview();
    const { result } = renderHook(useStore, { wrapper });
    act(() => result.current.completeReview("rev1", 3));
    expect(result.current.state.tasks.filter((t) => t.label === "🩹 بازآموزی")).toHaveLength(0);
  });

  it("جلسه‌ی مطالعه با ارزیابی ضعیف هم بازآموزی می‌گیرد", () => {
    seedWithReview();
    const today = todayKey();
    const { result } = renderHook(useStore, { wrapper });
    act(() => result.current.startSession("topicA", "free"));
    vi.setSystemTime(START + 20 * MINUTE);
    act(() => { result.current.endSession(1); });
    const relearns = result.current.state.tasks.filter((t) => t.label === "🩹 بازآموزی");
    expect(relearns.map((t) => t.date)).toEqual([addDays(today, 1)]);
  });

  it("تکرار مرور ضعیف، بازآموزی تکراری نمی‌سازد", () => {
    seedWithReview();
    const { result } = renderHook(useStore, { wrapper });
    act(() => result.current.completeReview("rev1", 0));
    const count = () => result.current.state.tasks.filter((t) => t.label === "🩹 بازآموزی").length;
    expect(count()).toBe(2);
    act(() => result.current.relearnForTopic("topicA", 0));
    expect(count()).toBe(2);
    act(() => result.current.relearnForTopic("topicA", 1));
    expect(count()).toBe(2);
  });
});

describe("خواندن ≠ مرور کردن (اصلاح رفتار واریز)", () => {
  /** مبحث با تسک یادگیری امروز + تسک «مرور ۳ روز بعد» + یک مرور فاصله‌دار سررسیدشده */
  function seedTopic(over?: { withDueSrs?: boolean }) {
    const today = todayKey();
    localStorage.setItem("study-planner-v1", JSON.stringify({
      subjects: [{ id: "subA", name: "قلب", color: "#0d9488", priority: "medium", createdAt: 1 }],
      topics: [{ id: "topicA", subjectId: "subA", name: "نارسایی قلبی", volume: 10, estimatedMinutes: 180, priority: "medium", difficulty: 2, status: "not_started", createdAt: 1 }],
      tasks: [
        { id: "learn", planId: "p1", topicId: "topicA", date: today, plannedMinutes: 60, doneMinutes: 0, status: "pending", order: 0, priority: "medium", kind: "learn" },
        { id: "reviewFuture", planId: "p1", topicId: "topicA", date: addDays(today, 3), plannedMinutes: 30, doneMinutes: 0, status: "pending", order: 900, priority: "medium", kind: "review", label: "مرور ۳ روز بعد" },
      ],
      reviews: over?.withDueSrs === false ? [] : [
        { id: "srs1", topicId: "topicA", dueDate: today, reviewNumber: 1, stage: 0, intervalDays: 1, status: "pending" },
      ],
      plans: [{ id: "p1", goal: "برنامه", startDate: addDays(today, -3), endDate: addDays(today, 20), topicIds: ["topicA"], studyDays: [0, 1, 2, 3, 4, 5, 6], dailyMinutes: 300, createdAt: 1, archived: false }],
    }));
  }

  it("زمانِ اضافه، تسک مرورِ آینده را «انجام‌شده» نمی‌کند و به‌عنوان زمان بی‌تسک ثبت می‌شود", () => {
    seedTopic();
    const { result } = renderHook(useStore, { wrapper });
    act(() => result.current.startSession("topicA", "free", "learn"));
    vi.setSystemTime(START + 120 * MINUTE);
    act(() => { result.current.endSession(2, "learn"); });
    const s = result.current.state;
    expect(s.tasks.find((t) => t.id === "learn")).toMatchObject({ status: "done", doneMinutes: 60 });
    expect(s.tasks.find((t) => t.id === "reviewFuture")).toMatchObject({ status: "pending", doneMinutes: 0 });
    expect(s.sessions[0].unplannedMinutes).toBe(60);
    expect(s.sessions[0].durationMinutes).toBe(120); // کل زمان در آمار می‌ماند
  });

  it("جلسه‌ی یادگیری، مرورهای در انتظارِ همان مبحث را حذف یا جلو نمی‌برد", () => {
    seedTopic();
    const { result } = renderHook(useStore, { wrapper });
    act(() => result.current.startSession("topicA", "free"));
    vi.setSystemTime(START + 30 * MINUTE);
    act(() => { result.current.endSession(3, "learn"); });
    const pending = result.current.state.reviews.filter((r) => r.status === "pending");
    expect(pending.map((r) => r.id)).toEqual(["srs1"]); // همان مرور، همان تاریخ، همان مرحله
    expect(pending[0]).toMatchObject({ dueDate: todayKey(), stage: 0, reviewNumber: 1 });
  });

  it("مبحثی که هیچ مروری ندارد، اولین مرورش را از جلسه‌ی یادگیری می‌گیرد (مثل قبل)", () => {
    seedTopic({ withDueSrs: false });
    const { result } = renderHook(useStore, { wrapper });
    act(() => result.current.startSession("topicA", "free"));
    vi.setSystemTime(START + 30 * MINUTE);
    act(() => { result.current.endSession(2, "learn"); });
    expect(result.current.state.reviews).toHaveLength(1);
    expect(result.current.state.reviews[0]).toMatchObject({ topicId: "topicA", status: "pending" });
  });

  it("جلسه‌ی «مرور» زنجیره را جلو می‌برد و مرورِ قبلی را می‌بندد", () => {
    seedTopic();
    const { result } = renderHook(useStore, { wrapper });
    act(() => result.current.startSession("topicA", "free"));
    vi.setSystemTime(START + 30 * MINUTE);
    act(() => { result.current.endSession(3, ["review"]); });
    const s = result.current.state;
    const done = s.reviews.find((r) => r.id === "srs1")!;
    const pending = s.reviews.filter((r) => r.status === "pending");
    expect(done.status).toBe("done");
    expect(pending).toHaveLength(1);
    expect(pending[0].stage).toBe(1);
    expect(pending[0].dueDate).toBe(addDays(todayKey(), 5)); // امتیاز ۳ از مرحله‌ی ۰ → فاصله‌ی ۵ روز
  });

  it("خلاصه‌ی جلسه می‌گوید مرورِ مبحث دست‌نخورده مانده و سررسیدش کِی است", () => {
    seedTopic();
    const { result } = renderHook(useStore, { wrapper });
    act(() => result.current.startSession("topicA", "free"));
    vi.setSystemTime(START + 30 * MINUTE);
    let res: ReturnType<typeof result.current.endSession> = null;
    act(() => { res = result.current.endSession(2, "learn"); });
    expect(res!.review).toBeNull();
    expect(res!.keptReviewDue).toBe(todayKey());
  });

  it("مبحثی که در هیچ برنامه‌ای نیست، «زمان بی‌تسک» و توست اضافه نمی‌گیرد", () => {
    localStorage.setItem("study-planner-v1", JSON.stringify({
      subjects: [{ id: "subA", name: "قلب", color: "#0d9488", priority: "medium", createdAt: 1 }],
      topics: [{ id: "free1", subjectId: "subA", name: "مبحث آزاد", volume: 10, estimatedMinutes: 60, priority: "medium", difficulty: 2, status: "not_started", createdAt: 1 }],
      tasks: [], reviews: [], plans: [],
    }));
    const { result } = renderHook(useStore, { wrapper });
    act(() => result.current.startSession("free1", "free"));
    vi.setSystemTime(START + 50 * MINUTE);
    act(() => { result.current.endSession(2, "learn"); });
    const s = result.current.state;
    expect(s.sessions[0].durationMinutes).toBe(50);
    expect(s.sessions[0].unplannedMinutes).toBeUndefined();
  });

  it("«ترکیبی» (درسنامه + تست با هم) هر دو تسک را پر می‌کند و به مرورِ آینده دست نمی‌زند", () => {
    seedTopic({ withDueSrs: false });
    const today = todayKey();
    const seed = JSON.parse(localStorage.getItem("study-planner-v1")!);
    seed.tasks.push({ id: "test", planId: "p1", topicId: "topicA", date: today, plannedMinutes: 40, doneMinutes: 0, status: "pending", order: 1, priority: "medium", kind: "test" });
    localStorage.setItem("study-planner-v1", JSON.stringify(seed));
    const { result } = renderHook(useStore, { wrapper });
    act(() => result.current.startSession("topicA", "free"));
    vi.setSystemTime(START + 100 * MINUTE);
    act(() => { result.current.endSession(2, ["learn", "test"]); });
    const s = result.current.state;
    expect(s.tasks.find((t) => t.id === "learn")).toMatchObject({ status: "done", doneMinutes: 60 });
    expect(s.tasks.find((t) => t.id === "test")).toMatchObject({ status: "done", doneMinutes: 40 });
    expect(s.tasks.find((t) => t.id === "reviewFuture")).toMatchObject({ status: "pending", doneMinutes: 0 });
    expect(s.sessions[0]).toMatchObject({ kind: "mixed", kinds: ["learn", "test"] });
  });

  it("ثبت نتیجه‌ی مرورِ برنامه، مرورِ فاصله‌دارِ سررسیدشده را هم می‌بندد (دو دفتر یکی می‌شوند)", () => {
    const today = todayKey();
    localStorage.setItem("study-planner-v1", JSON.stringify({
      subjects: [{ id: "subA", name: "قلب", color: "#0d9488", priority: "medium", createdAt: 1 }],
      topics: [{ id: "topicA", subjectId: "subA", name: "نارسایی قلبی", volume: 10, estimatedMinutes: 120, priority: "medium", difficulty: 2, status: "learning", createdAt: 1 }],
      tasks: [{ id: "planReview", planId: "p1", topicId: "topicA", date: today, plannedMinutes: 30, doneMinutes: 0, status: "pending", order: 0, priority: "medium", kind: "review", label: "مرور" }],
      reviews: [{ id: "srs1", topicId: "topicA", dueDate: today, reviewNumber: 1, stage: 0, intervalDays: 1, status: "pending" }],
      plans: [{ id: "p1", goal: "برنامه", startDate: today, endDate: addDays(today, 10), topicIds: ["topicA"], studyDays: [0, 1, 2, 3, 4, 5, 6], dailyMinutes: 300, createdAt: 1, archived: false }],
    }));
    const { result } = renderHook(useStore, { wrapper });
    act(() => result.current.completeReview("srs1", 3, { completeTaskIds: ["planReview"] }));
    const s = result.current.state;
    expect(s.reviews.find((r) => r.id === "srs1")!.status).toBe("done");
    expect(s.reviews.filter((r) => r.status === "pending")).toHaveLength(1); // مرور بعدی چیده شد
    expect(s.tasks.find((t) => t.id === "planReview")!.status).toBe("done");
    expect(s.sessions).toHaveLength(1); // زمان تسکِ مرور هم ثبت شد
  });
});

describe("ثبت تست هم برنامه را به‌روز می‌کند", () => {
  it("با ثبت تست مبحث، تسک «تست» برنامه بسته و زمانش ثبت می‌شود", () => {
    const today = todayKey();
    localStorage.setItem("study-planner-v1", JSON.stringify({
      subjects: [{ id: "subA", name: "قلب", color: "#0d9488", priority: "medium", createdAt: 1 }],
      topics: [{ id: "topicA", subjectId: "subA", name: "نارسایی قلبی", volume: 10, estimatedMinutes: 120, priority: "medium", difficulty: 2, status: "not_started", createdAt: 1 }],
      tasks: [{ id: "testTask", planId: "p1", topicId: "topicA", date: today, plannedMinutes: 45, doneMinutes: 0, status: "pending", order: 0, priority: "medium", kind: "test", label: "تست آموزشی" }],
      plans: [{ id: "p1", goal: "برنامه", startDate: today, endDate: addDays(today, 10), topicIds: ["topicA"], studyDays: [0, 1, 2, 3, 4, 5, 6], dailyMinutes: 300, createdAt: 1, archived: false }],
    }));
    render(
      <StrictMode>
        <StoreProvider>
          <TestLogModal open onClose={() => {}} presetTopicId="topicA" />
        </StoreProvider>
      </StrictMode>,
    );
    // گزینه‌ی واریز به تسک برنامه پیش‌فرض روشن است
    expect(screen.getByRole("checkbox")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "ثبت" }));
    const savedState = JSON.parse(localStorage.getItem("study-planner-v1")!);
    expect(savedState.testLogs).toHaveLength(1);
    expect(savedState.tasks.find((t: { id: string }) => t.id === "testTask")).toMatchObject({ status: "done", doneMinutes: 45 });
    expect(savedState.sessions[0]).toMatchObject({ topicId: "topicA", taskId: "testTask", durationMinutes: 45, kind: "test" });
  });
});

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
