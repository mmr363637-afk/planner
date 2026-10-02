import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, xpStreakMultiplier } from "../gamification";
import { reviewAdherenceWeek } from "../stats";
import { recommendNext } from "../decisions";
import { RELEARN_LABEL, buildRelearnTasks } from "../planSync";
import { EMPTY_STATE } from "../stateIO";
import { addDays } from "../jalali";
import type { AppState, StudySession, StudyTask, Topic } from "../../types";

const TODAY = "2026-10-02";

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

const session = (id: string, over: Partial<StudySession> = {}): StudySession => ({
  id,
  topicId: null,
  durationMinutes: 30,
  date: TODAY,
  startedAt: new Date(2026, 9, 2, 10).getTime(),
  endedAt: new Date(2026, 9, 2, 10, 30).getTime(),
  rating: null,
  mode: "free",
  ...over,
});

const task = (id: string, date = TODAY, over: Partial<StudyTask> = {}): StudyTask => ({
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

describe("ضریب امتیازِ زنجیره", () => {
  it("پله‌های ضریب را درست برمی‌گرداند", () => {
    expect(xpStreakMultiplier(0)).toBe(1);
    expect(xpStreakMultiplier(2)).toBe(1);
    expect(xpStreakMultiplier(3)).toBe(1.1);
    expect(xpStreakMultiplier(7)).toBe(1.2);
    expect(xpStreakMultiplier(13)).toBe(1.2);
    expect(xpStreakMultiplier(14)).toBe(1.3);
    expect(xpStreakMultiplier(30)).toBe(1.5);
  });
});

describe("نظم مرور هفته", () => {
  it("کسر مرورهای انجام‌شده در ۷ روز اخیر را حساب می‌کند", () => {
    const reviews = [
      { id: "v1", topicId: "t", dueDate: TODAY, status: "done" },
      { id: "v2", topicId: "t", dueDate: addDays(TODAY, -3), status: "done" },
      { id: "v3", topicId: "t", dueDate: addDays(TODAY, -5), status: "pending" },
      { id: "v4", topicId: "t", dueDate: addDays(TODAY, -8), status: "pending" }, // خارج از بازه
    ] as AppState["reviews"];
    const tasks = [
      task("r1", addDays(TODAY, -1), { kind: "review", status: "done", doneMinutes: 20 }),
      task("r2", TODAY, { kind: "review" }),
      task("l1", TODAY, { kind: "learn" }), // تسک غیرمروری شمرده نمی‌شود
    ];
    // ۳ مرور در بازه + ۲ تسک مرور؛ ۲ مرور + ۱ تسک انجام شده
    expect(reviewAdherenceWeek(reviews, tasks, TODAY)).toEqual({ due: 5, done: 3, pct: 60 });
  });

  it("بدون مرور سررسید، ۱۰۰٪ می‌دهد", () => {
    expect(reviewAdherenceWeek([], [], TODAY)).toEqual({ due: 0, done: 0, pct: 100 });
  });
});

describe("پیشنهاد شروع با اولویت بازآموزی", () => {
  it("مبحث دارای تسک بازآموزی، بالاتر از مرورِ تنها می‌نشیند", () => {
    const state: AppState = {
      ...EMPTY_STATE,
      subjects: [{ id: "s", name: "درس", color: "#0ff", priority: "high", createdAt: 1 }],
      topics: [topic("t1", { name: "بازآموزی‌دار" }), topic("t2", { name: "مروردار" })],
      tasks: [task("x1", TODAY, { topicId: "t1", order: -1, kind: "learn", label: RELEARN_LABEL })],
      reviews: [
        { id: "v1", topicId: "t2", dueDate: TODAY, reviewNumber: 1, stage: 0, intervalDays: 1, status: "pending" },
      ],
    };
    const recs = recommendNext(state, TODAY);
    expect(recs[0].topicId).toBe("t1");
    expect(recs[0].reasons.some((r) => r.includes("بازآموزی"))).toBe(true);
    expect(recs[0].score).toBeGreaterThan(recs[1].score);
  });
});

describe("صدرِ صف برای بازآموزی", () => {
  it("تسک بازآموزی با ترتیب منفی ساخته می‌شود تا صدرِ بنشیند", () => {
    const out = buildRelearnTasks({
      rating: 0,
      today: TODAY,
      topic: topic(),
      existingTasks: [task("a", addDays(TODAY, 1), { plannedMinutes: 45 })],
    });
    expect(out.length).toBe(2);
    expect(out.every((t) => t.order === -1 && t.label === RELEARN_LABEL)).toBe(true);
  });
});

describe("دستاوردهای پنهان", () => {
  it("دقیقاً چهار دستاورد پنهان دارد", () => {
    const hidden = ACHIEVEMENTS.filter((a) => a.hidden).map((a) => a.id).sort();
    expect(hidden).toEqual(["marathon_session", "night_owl_deep", "overdue_slayer", "sharpshooter"]);
  });

  it("جغد نیمه‌شب با ۵ جلسه‌ی ۱۲ تا ۴ صبح باز می‌شود", () => {
    const owl = ACHIEVEMENTS.find((a) => a.id === "night_owl_deep")!;
    const nights = Array.from({ length: 5 }, (_, i) =>
      session(`s${i}`, { startedAt: new Date(2026, 9, 1, 2, 15).getTime() }),
    );
    expect(owl.check({ ...EMPTY_STATE })).toBe(false);
    expect(owl.check({ ...EMPTY_STATE, sessions: nights })).toBe(true);
    expect(owl.check({ ...EMPTY_STATE, sessions: nights.slice(0, 4) })).toBe(false);
  });

  it("شکارچی عقب‌افتاده‌ها: جلسه‌ی امروز که به تسکِ روز قبل واریز شده", () => {
    const hunter = ACHIEVEMENTS.find((a) => a.id === "overdue_slayer")!;
    const t = task("old", addDays(TODAY, -1));
    const s = { ...EMPTY_STATE, tasks: [t], sessions: [session("s", { topicId: "t", taskId: "old" })] };
    expect(hunter.check(s)).toBe(true);
    // بدون اتصال به تسک عقب‌افتاده، دستاوردی نیست
    expect(hunter.check({ ...EMPTY_STATE, sessions: s.sessions })).toBe(false);
  });

  it("دونده‌ی ماراتن با جلسه‌ی ۳ ساعته باز می‌شود", () => {
    const marathon = ACHIEVEMENTS.find((a) => a.id === "marathon_session")!;
    expect(marathon.check({ ...EMPTY_STATE, sessions: [session("m", { durationMinutes: 180 })] })).toBe(true);
    expect(marathon.check({ ...EMPTY_STATE, sessions: [session("m", { durationMinutes: 179 })] })).toBe(false);
  });
});
