// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { StoreProvider, useStore } from "../store";
import App from "../App";
import { APP_VERSION } from "../lib/appVersion";
import SourceNotebook from "../components/SourceNotebook";
import PlanningLab from "../components/PlanningLab";
import RemediationCoach from "../components/RemediationCoach";
import { paceEstimates, planningFingerprint } from "../lib/decisions";
import { syncPreviewFingerprint } from "../components/SupabaseSyncCard";
import { EMPTY_STATE, parseStateText } from "../lib/stateIO";
import { flushPersist, closePersist } from "../lib/persist";
import { listHistory } from "../lib/history";
import * as history from "../lib/history";
import { scheduledReviewTargets } from "../lib/reviewCleanup";
import ReviewsPage from "../pages/Reviews";
import { NavContext } from "../nav";
import { addDays, todayKey } from "../lib/jalali";
import type { AppState } from "../types";
const today = todayKey();
function seed(patch: Partial<AppState> = {}) {
  localStorage.setItem(
    "study-planner-v1",
    JSON.stringify({
      ...EMPTY_STATE,
      settings: {
        ...EMPTY_STATE.settings,
        onboarded: true,
        lastSeenVersion: APP_VERSION,
      },
      subjects: [
        {
          id: "s",
          name: "زیست",
          priority: "high",
          color: "#0aa",
          createdAt: 1,
        },
      ],
      topics: [
        {
          id: "t",
          subjectId: "s",
          name: "سلول",
          volume: 10,
          estimatedMinutes: 60,
          priority: "high",
          difficulty: 2,
          status: "learning",
          createdAt: 1,
        },
      ],
      ...patch,
    }),
  );
}
const saved = () => JSON.parse(localStorage.getItem("study-planner-v1")!);
async function clear() {
  await closePersist();
  localStorage.clear();
  for (const name of ["study-planner", "planner-recovery-v1"])
    await new Promise<void>((resolve) => {
      const r = indexedDB.deleteDatabase(name);
      r.onsuccess = r.onerror = r.onblocked = () => resolve();
    });
}
beforeEach(clear);
afterEach(async () => {
  cleanup();
  await flushPersist();
  await clear();
  vi.restoreAllMocks();
});

describe("source notebook workflow", () => {
  it("requires source review and explicit card approval, then preserves citation across export/import", async () => {
    seed();
    render(
      <StoreProvider>
        <SourceNotebook onClose={() => {}} />
      </StoreProvider>,
    );
    fireEvent.change(await screen.findByLabelText("عنوان منبع"), {
      target: { value: "جزوه زیست" },
    });
    fireEvent.change(screen.getByLabelText("متن جزوه"), {
      target: { value: "میتوکندری: اندامک تولید انرژی" },
    });
    fireEvent.click(screen.getByText("بازبینی متن منبع"));
    expect(saved().sourceDocuments).toEqual([]);
    fireEvent.click(screen.getByText("متن را بررسی کردم؛ ذخیرهٔ منبع"));
    fireEvent.click(screen.getByText("پیشنهاد کارت از عبارت‌های منبع"));
    expect(saved().flashcards).toHaveLength(0);
    fireEvent.click(screen.getByLabelText("این کارت را بررسی و تأیید کردم"));
    fireEvent.change(screen.getByLabelText("مبحث کارت‌های منبع"), {
      target: { value: "t" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /کارت تأییدشده به مرور/ }),
    );
    expect(saved().flashcards).toHaveLength(1);
    expect(saved().flashcards[0].evidence).toMatchObject({
      documentTitle: "جزوه زیست",
      page: 1,
      quote: "میتوکندری: اندامک تولید انرژی",
    });
    expect(saved().flashcards[0].topicId).toBe("t");
    const imported = parseStateText(JSON.stringify(saved()))!;
    expect(imported.flashcards[0].evidence).toEqual(
      saved().flashcards[0].evidence,
    );
    expect(imported.sourceDocuments).toEqual(saved().sourceDocuments);
  });
});
describe("safe application of schedule previews", () => {
  it("does not change the schedule until confirmation, then saves a recovery snapshot", async () => {
    seed({
      tasks: [
        {
          id: "a",
          topicId: "t",
          date: today,
          plannedMinutes: 30,
          doneMinutes: 0,
          status: "pending",
          order: 0,
          priority: "high",
        },
        {
          id: "b",
          topicId: "t",
          date: today,
          plannedMinutes: 30,
          doneMinutes: 0,
          status: "pending",
          order: 1,
          priority: "medium",
        },
      ],
    });
    render(
      <StoreProvider>
        <PlanningLab onClose={() => {}} />
      </StoreProvider>,
    );
    const field = await screen.findByLabelText("وقت باقی‌ماندهٔ امروز");
    fireEvent.change(field, { target: { value: "30" } });
    fireEvent.click(screen.getByText("ساخت پیش‌نمایش بدون تغییر برنامه"));
    expect(saved().tasks.every((t: { date: string }) => t.date === today)).toBe(
      true,
    );
    fireEvent.click(screen.getByText("ذخیرهٔ نسخهٔ ایمنی و اعمال این سناریو"));
    await waitFor(() => expect(saved().tasks[1].date).toBe(addDays(today, 1)));
    expect(
      (await listHistory()).some((e) => e.label === "پیش از روز منعطف"),
    ).toBe(true);
  });
  it("refuses a stale preview and preserves newer task changes", async () => {
    seed();
    const hook = renderHook(() => useStore(), { wrapper: StoreProvider });
    await waitFor(() => expect(hook.result.current).toBeTruthy());
    act(() => {
      hook.result.current.addTask("t", today, 30);
    });
    const before = hook.result.current.state.tasks;
    let ok = true;
    act(() => {
      ok = hook.result.current.applySchedule([], "stale");
    });
    expect(ok).toBe(false);
    expect(hook.result.current.state.tasks).toEqual(before);
  });
});
describe("replacement and remediation", () => {
  it("stores the previous state before importing and rejects malformed imports", async () => {
    seed();
    const hook = renderHook(() => useStore(), { wrapper: StoreProvider });
    await waitFor(() => expect(hook.result.current).toBeTruthy());
    let result = false;
    await act(async () => {
      result = await hook.result.current.replaceData(
        JSON.stringify({
          ...EMPTY_STATE,
          notes: [{ id: "n", text: "یادداشت", createdAt: 1 }],
        }),
      );
    });
    expect(result).toBe(true);
    expect(hook.result.current.state.notes).toHaveLength(1);
    expect(await listHistory()).toHaveLength(1);
    await act(async () => {
      result = await hook.result.current.replaceData(
        '{"subjects":{},"topics":[]}',
      );
    });
    expect(result).toBe(false);
    expect(hook.result.current.state.notes).toHaveLength(1);
  });
  it("hides answers during practice and records self-assessed results and spaced follow-up", async () => {
    seed({
      mistakes: [
        {
          id: "m1",
          question: "سؤال اول",
          answer: "پاسخ اول",
          cause: "تبدیل واحد",
          dueDate: today,
          lapses: 0,
          reviewCount: 0,
          createdAt: 1,
        },
        {
          id: "m2",
          question: "سؤال دوم",
          answer: "پاسخ دوم",
          cause: "تبدیل واحد",
          dueDate: today,
          lapses: 0,
          reviewCount: 0,
          createdAt: 1,
        },
      ],
    });
    render(
      <StoreProvider>
        <RemediationCoach />
      </StoreProvider>,
    );
    fireEvent.click(await screen.findByText("تمرین کوتاه این علت"));
    expect(screen.queryByText("پاسخ اول")).toBeNull();
    fireEvent.click(screen.getByText("پاسخ دادم؛ مقایسه با پاسخ ثبت‌شده"));
    expect(screen.getByText("پاسخ اول")).toBeTruthy();
    fireEvent.click(screen.getByText("درست پاسخ دادم"));
    fireEvent.click(screen.getByText("پاسخ دادم؛ مقایسه با پاسخ ثبت‌شده"));
    fireEvent.click(screen.getByText("نیاز به تمرین دارم"));
    expect(saved().remediationAttempts[0]).toMatchObject({
      total: 2,
      correct: 1,
    });
    expect(
      saved().mistakes.find((m: { id: string }) => m.id === "m2").dueDate,
    ).toBe(addDays(today, 1));
  });
});
describe("short start", () => {
  it("can start before filling the setup wizard and persists a 20-minute suggested target", async () => {
    render(<App />);
    fireEvent.click(
      await screen.findByText("فعلاً فقط ۲۰ دقیقه مطالعه می‌کنم"),
    );
    await waitFor(() => expect(saved().activeSession?.targetMinutes).toBe(20));
    expect(saved().settings.onboarded).toBe(true);
    expect(saved().subjects).toHaveLength(0);
  });
});

describe("final safety regressions", () => {
  it("compares every local collection and user settings, ignoring sync bookkeeping", () => {
    const baseline = syncPreviewFingerprint(EMPTY_STATE);
    for (const [key, value] of Object.entries(EMPTY_STATE)) {
      if (Array.isArray(value))
        expect(
          syncPreviewFingerprint({
            ...EMPTY_STATE,
            [key]: [{ id: "changed" }],
          }),
        ).not.toBe(baseline);
    }
    expect(
      syncPreviewFingerprint({
        ...EMPTY_STATE,
        settings: { ...EMPTY_STATE.settings, dailyGoalMinutes: 345 },
      }),
    ).not.toBe(baseline);
    expect(
      syncPreviewFingerprint({
        ...EMPTY_STATE,
        settings: {
          ...EMPTY_STATE.settings,
          supabase: { autoSync: false, lastSyncAt: 123 },
        },
      }),
    ).toBe(baseline);
  });
  it("rejects dropped or modified task content even with a fresh preview fingerprint", async () => {
    seed();
    const hook = renderHook(() => useStore(), { wrapper: StoreProvider });
    await waitFor(() => expect(hook.result.current).toBeTruthy());
    act(() => hook.result.current.addTask("t", today, 30));
    const original = hook.result.current.state.tasks;
    const fingerprint = planningFingerprint(hook.result.current.state);
    act(() =>
      expect(hook.result.current.applySchedule([], fingerprint)).toBe(false),
    );
    act(() =>
      expect(
        hook.result.current.applySchedule(
          original.map((t) => ({ ...t, plannedMinutes: 1 })),
          fingerprint,
        ),
      ).toBe(false),
    );
    expect(hook.result.current.state.tasks).toEqual(original);
  });
  it("retains all accepted pace sample IDs across batches and rejects stale estimates", async () => {
    seed({
      tasks: ["a", "b", "c"].map((id) => ({
        id,
        topicId: "t",
        date: today,
        plannedMinutes: 30,
        doneMinutes: 60,
        status: "done",
        order: 0,
        priority: "medium",
      })),
    });
    const hook = renderHook(() => useStore(), { wrapper: StoreProvider });
    await waitFor(() => expect(hook.result.current).toBeTruthy());
    const first = paceEstimates(hook.result.current.state, today)[0];
    act(() => hook.result.current.acceptPace(first, first.sampleKey));
    expect(hook.result.current.state.topics[0].estimatedMinutes).toBe(120);
    for (let i = 0; i < 3; i++) {
      act(() => hook.result.current.addTask("t", today, 30));
      const id = hook.result.current.state.tasks.at(-1)!.id;
      act(() =>
        hook.result.current.updateTask(id, { status: "done", doneMinutes: 60 }),
      );
    }
    const next = paceEstimates(hook.result.current.state, today)[0];
    expect(next.samples).toBe(3);
    act(() => hook.result.current.acceptPace(next, next.sampleKey));
    expect(
      hook.result.current.state.settings.paceAccepted?.s.split("|"),
    ).toHaveLength(6);
    expect(paceEstimates(hook.result.current.state, today)).toEqual([]);
    act(() => hook.result.current.acceptPace(first, first.sampleKey));
    expect(hook.result.current.state.topics[0].estimatedMinutes).toBe(240);
  });
});

describe("clear scheduled reviews", () => {
  function reviewSeed() {
    seed({
      reviews: [
        {
          id: "overdue",
          topicId: "t",
          dueDate: addDays(today, -2),
          reviewNumber: 1,
          stage: 0,
          intervalDays: 1,
          status: "pending",
        },
        {
          id: "today",
          topicId: "t",
          dueDate: today,
          reviewNumber: 2,
          stage: 1,
          intervalDays: 3,
          status: "pending",
        },
        {
          id: "future",
          topicId: "other",
          dueDate: addDays(today, 3),
          reviewNumber: 1,
          stage: 0,
          intervalDays: 3,
          status: "pending",
        },
        {
          id: "done",
          topicId: "t",
          dueDate: today,
          reviewNumber: 1,
          stage: 0,
          intervalDays: 1,
          status: "done",
        },
      ],
      tasks: [
        {
          id: "review-task",
          topicId: "t",
          date: today,
          plannedMinutes: 30,
          doneMinutes: 0,
          status: "pending",
          kind: "review",
          order: 0,
          priority: "medium",
        },
        {
          id: "learn-task",
          topicId: "t",
          date: today,
          plannedMinutes: 30,
          doneMinutes: 0,
          status: "pending",
          kind: "learn",
          order: 1,
          priority: "medium",
        },
        {
          id: "done-task",
          topicId: "t",
          date: today,
          plannedMinutes: 30,
          doneMinutes: 30,
          status: "done",
          kind: "review",
          order: 2,
          priority: "medium",
        },
      ],
      flashcards: [
        {
          id: "card",
          front: "سؤال",
          back: "پاسخ",
          ef: 2.5,
          intervalDays: 1,
          repetitions: 0,
          dueDate: today,
          lapses: 0,
          createdAt: 1,
        },
      ],
      mistakes: [
        {
          id: "mistake",
          question: "سؤال",
          dueDate: today,
          reviewCount: 0,
          lapses: 0,
          createdAt: 1,
        },
      ],
    });
  }
  it("selects pending overdue/today/future reviews and only pending review tasks", () => {
    reviewSeed();
    const targets = scheduledReviewTargets(saved(), { includeTasks: true });
    expect(targets.reviews.map((r) => r.id)).toEqual([
      "overdue",
      "today",
      "future",
    ]);
    expect(targets.tasks.map((t) => t.id)).toEqual(["review-task"]);
  });
  it("saves a recoverable snapshot and preserves completed work, cards and mistakes", async () => {
    reviewSeed();
    const hook = renderHook(() => useStore(), { wrapper: StoreProvider });
    await waitFor(() => expect(hook.result.current).toBeTruthy());
    const before = hook.result.current.state;
    await act(async () => {
      expect(
        await hook.result.current.clearScheduledReviews({ includeTasks: true }),
      ).toBe(true);
    });
    expect(hook.result.current.state.reviews.map((r) => r.id)).toEqual([
      "done",
    ]);
    expect(hook.result.current.state.tasks.map((t) => t.id)).toEqual([
      "learn-task",
      "done-task",
    ]);
    expect(hook.result.current.state.flashcards).toEqual(before.flashcards);
    expect(hook.result.current.state.mistakes).toEqual(before.mistakes);
    expect(hook.result.current.state.topics).toEqual(before.topics);
    expect(hook.result.current.state.sessions).toEqual(before.sessions);
    const entries = await listHistory();
    expect(entries).toHaveLength(1);
    expect(JSON.parse(entries[0].json).reviews).toEqual(before.reviews);
    // Recovery uses the same guarded import as the history UI.
    await act(async () => {
      expect(await hook.result.current.replaceData(entries[0].json)).toBe(true);
    });
    expect(hook.result.current.state.reviews).toEqual(before.reviews);
    expect(hook.result.current.state.tasks).toEqual(before.tasks);
  });
  it("respects the selected topic and the option to retain review tasks", async () => {
    reviewSeed();
    const hook = renderHook(() => useStore(), { wrapper: StoreProvider });
    await waitFor(() => expect(hook.result.current).toBeTruthy());
    const tasks = hook.result.current.state.tasks;
    await act(async () => {
      expect(
        await hook.result.current.clearScheduledReviews({
          topicId: "t",
          includeTasks: false,
        }),
      ).toBe(true);
    });
    expect(hook.result.current.state.reviews.map((r) => r.id)).toEqual([
      "future",
      "done",
    ]);
    expect(hook.result.current.state.tasks).toEqual(tasks);
  });
  it("fails closed if the safety snapshot cannot be saved", async () => {
    reviewSeed();
    const hook = renderHook(() => useStore(), { wrapper: StoreProvider });
    await waitFor(() => expect(hook.result.current).toBeTruthy());
    const before = hook.result.current.state;
    vi.spyOn(history, "saveHistory").mockRejectedValueOnce(new Error("quota"));
    await act(async () => {
      expect(
        await hook.result.current.clearScheduledReviews({ includeTasks: true }),
      ).toBe(false);
    });
    expect(hook.result.current.state).toBe(before);
  });
  it("does not delete after data changes while the snapshot is being saved", async () => {
    reviewSeed();
    const hook = renderHook(() => useStore(), { wrapper: StoreProvider });
    await waitFor(() => expect(hook.result.current).toBeTruthy());
    let release!: (id: string) => void;
    vi.spyOn(history, "saveHistory").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = hook.result.current.clearScheduledReviews({
      includeTasks: true,
    });
    act(() => hook.result.current.postponeReview("today", 1));
    const current = hook.result.current.state;
    await act(async () => {
      release("snapshot");
      expect(await pending).toBe(false);
    });
    expect(hook.result.current.state).toBe(current);
    expect(hook.result.current.state.reviews).toHaveLength(4);
  });
  it("refuses deletion during an active study session", async () => {
    reviewSeed();
    const hook = renderHook(() => useStore(), { wrapper: StoreProvider });
    await waitFor(() => expect(hook.result.current).toBeTruthy());
    act(() => hook.result.current.startSession("t", "free", "review-task"));
    const before = hook.result.current.state;
    await act(async () => {
      expect(
        await hook.result.current.clearScheduledReviews({ includeTasks: true }),
      ).toBe(false);
    });
    expect(hook.result.current.state).toBe(before);
    expect(await listHistory()).toHaveLength(0);
  });
  it("requires explicit UI confirmation; cancelling does not change data", async () => {
    reviewSeed();
    render(
      <StoreProvider>
        <NavContext.Provider
          value={{
            tab: "reviews",
            planSub: "calendar",
            calendarDate: null,
            go: vi.fn(),
          }}
        >
          <ReviewsPage />
        </NavContext.Provider>
      </StoreProvider>,
    );
    const open = await screen.findByRole("button", {
      name: "پاک‌کردن مرورهای برنامه‌ریزی‌شده",
    });
    fireEvent.click(open);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(saved().reviews).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "انصراف" }));
    expect(saved().reviews).toHaveLength(4);
    fireEvent.click(open);
    fireEvent.click(screen.getByRole("checkbox", { name: /کارهای «مرور»/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "تأیید و پاک‌کردن مرورها" }),
    );
    await waitFor(() =>
      expect(saved().reviews.map((r: { id: string }) => r.id)).toEqual([
        "done",
      ]),
    );
    expect(saved().tasks).toHaveLength(3);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("release announcement and About entry", () => {
  it("announces an unseen release on opening and remembers dismissal across remount", async () => {
    seed({
      settings: {
        ...EMPTY_STATE.settings,
        onboarded: true,
        lastSeenVersion: "1.7.1",
      },
    });
    const view = render(<App />);
    expect(
      await screen.findByRole("dialog", { name: "✨ چی جدیده؟" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /پاک‌کردن مرورهای برنامه‌ریزی‌شده با تأیید و نسخهٔ ایمنی/,
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "بزن بریم! 🚀" }));
    await waitFor(() =>
      expect(saved().settings.lastSeenVersion).toBe(APP_VERSION),
    );
    view.unmount();
    await flushPersist();
    render(<App />);
    await screen.findByTitle("تنظیمات");
    expect(screen.queryByRole("dialog", { name: "✨ چی جدیده؟" })).toBeNull();
  });
  it("opens About from Settings and allows viewing release notes again", async () => {
    seed();
    render(<App />);
    fireEvent.click(await screen.findByTitle("تنظیمات"));
    fireEvent.click(
      await screen.findByRole("button", { name: "دربارهٔ این اپ" }),
    );
    expect(screen.getByText("مهدی محمدرحیمی", { exact: true })).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "ارتباط در تلگرام @Mahdimr3" })
        .getAttribute("href"),
    ).toBe("https://t.me/Mahdimr3");
    fireEvent.click(screen.getByRole("button", { name: "تغییرات نسخهٔ فعلی" }));
    expect(screen.getByRole("dialog", { name: "✨ چی جدیده؟" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "بزن بریم! 🚀" }));
    expect(saved().settings.lastSeenVersion).toBe(APP_VERSION);
    expect(screen.getByRole("dialog", { name: "دربارهٔ این اپ" })).toBeTruthy();
  });
});
