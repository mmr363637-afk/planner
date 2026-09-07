// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { closePersist, flushPersist, loadDurable, loadMirror, persistState } from "../persist";
import { EMPTY_STATE, parseStateText } from "../stateIO";
import type { AppState } from "../../types";

afterEach(async () => {
  await closePersist();
  localStorage.clear();
  // پاک‌کردن دیتابیس بین تست‌ها
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase("study-planner");
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

function sampleState(): AppState {
  return {
    ...EMPTY_STATE,
    subjects: [{ id: "s1", name: "فیزیولوژی", color: "#0ea5a4", priority: "high", createdAt: 1 }],
    topics: [{ id: "t1", subjectId: "s1", name: "قلب", volume: 20, estimatedMinutes: 120, priority: "medium", difficulty: 2, status: "learning", createdAt: 2 }],
    sessions: [{ id: "x1", topicId: "t1", startedAt: 1, endedAt: 2, durationMinutes: 30, rating: 3, mode: "free", date: "2026-01-01" }],
  };
}

describe("persistence (IndexedDB + localStorage mirror)", () => {
  it("parses legacy localStorage JSON into a full AppState with merged settings", () => {
    localStorage.setItem("study-planner-v1", JSON.stringify({ subjects: sampleState().subjects, topics: sampleState().topics, settings: { theme: "dark" } }));
    const state = loadMirror();
    expect(state).not.toBeNull();
    expect(state!.subjects.length).toBe(1);
    expect(state!.settings.theme).toBe("dark");
    expect(state!.settings.pomodoro.work).toBe(25); // پیش‌فرض‌ها حفظ می‌شوند
    expect(state!.exams).toEqual([]);
  });

  it("returns null for corrupt mirror data", () => {
    localStorage.setItem("study-planner-v1", "{not json");
    expect(loadMirror()).toBeNull();
    expect(parseStateText(null)).toBeNull();
  });

  it("writes through to IndexedDB and reads it back", async () => {
    const state = sampleState();
    persistState(state);
    await flushPersist();
    const durable = await loadDurable();
    expect(durable).not.toBeNull();
    expect(durable!.sessions[0].id).toBe("x1");
    expect(durable!.subjects[0].name).toBe("فیزیولوژی");
  });

  it("recovers data from IndexedDB after the localStorage mirror is wiped (migration safety)", async () => {
    persistState(sampleState());
    await flushPersist();
    // شبیه‌سازی پاک‌شدن localStorage (یا انتقال از نسخه‌ی قدیمی بدون IDB)
    localStorage.clear();
    const durable = await loadDurable();
    expect(durable).not.toBeNull();
    expect(durable!.topics[0].name).toBe("قلب");
  });

  it("keeps the mirror in sync so the next boot is instant", async () => {
    persistState(sampleState());
    await flushPersist();
    const mirror = loadMirror();
    expect(mirror).not.toBeNull();
    expect(mirror!.sessions.length).toBe(1);
  });
});
