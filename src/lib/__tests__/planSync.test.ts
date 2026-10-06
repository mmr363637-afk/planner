import { describe, expect, it } from "vitest";
import { RELEARN_LABEL, buildRelearnTasks, creditStudyToTasks, rebalanceToday, relearnMinutes } from "../planSync";
import { addDays } from "../jalali";
import type { StudyTask } from "../../types";

const TODAY = "2026-10-02";
const FUTURE = addDays(TODAY, 3);
const TOMORROW = addDays(TODAY, 1);

function task(over: Partial<StudyTask> & Pick<StudyTask, "id" | "topicId" | "date" | "plannedMinutes">): StudyTask {
  return { doneMinutes: 0, status: "pending", order: 0, priority: "medium", ...over };
}

describe("creditStudyToTasks — واریز مطالعه به تسک‌های برنامه", () => {
  it("پر کردن تسک از قدیمی‌ترین و تکمیل خودکار عند پر شدن", () => {
    const tasks = [
      task({ id: "b", topicId: "t", date: addDays(TODAY, 1), plannedMinutes: 60 }),
      task({ id: "a", topicId: "t", date: TODAY, plannedMinutes: 60 }),
      task({ id: "x", topicId: "other", date: TODAY, plannedMinutes: 60 }),
    ];
    const res = creditStudyToTasks({ tasks, topicId: "t", minutes: 80, today: TODAY });
    const byId = new Map(res.tasks.map((t) => [t.id, t]));
    expect(byId.get("a")).toMatchObject({ status: "done", doneMinutes: 60 });
    expect(byId.get("b")).toMatchObject({ status: "pending", doneMinutes: 20 });
    expect(byId.get("x")).toMatchObject({ status: "pending", doneMinutes: 0 });
    expect(res.creditedMinutes).toBe(80);
  });

  it("هرگز بیش از سقف برنامه واریز نمی‌شود", () => {
    const tasks = [task({ id: "a", topicId: "t", date: TODAY, plannedMinutes: 30 })];
    const res = creditStudyToTasks({ tasks, topicId: "t", minutes: 500, today: TODAY });
    expect(res.creditedMinutes).toBe(30);
    expect(res.tasks[0]).toMatchObject({ status: "done", doneMinutes: 30 });
  });

  it("تسکِ هم‌نوعِ فعالیت، حتی با تاریخ دورتر، اول واریز می‌شود", () => {
    const tasks = [
      task({ id: "learn", topicId: "t", date: TODAY, plannedMinutes: 60, kind: "learn" }),
      task({ id: "test", topicId: "t", date: addDays(TODAY, 2), plannedMinutes: 60, kind: "test" }),
    ];
    const res = creditStudyToTasks({ tasks, topicId: "t", minutes: 40, today: TODAY, kind: "test" });
    const byId = new Map(res.tasks.map((t) => [t.id, t]));
    expect(byId.get("test")).toMatchObject({ doneMinutes: 40 });
    expect(byId.get("learn")).toMatchObject({ doneMinutes: 0 });
  });

  it("تسک ترجیحی جلسه (preferTaskId) اول از همه واریز می‌شود", () => {
    const tasks = [
      task({ id: "early", topicId: "t", date: TODAY, plannedMinutes: 60 }),
      task({ id: "late", topicId: "t", date: addDays(TODAY, 1), plannedMinutes: 60 }),
    ];
    const res = creditStudyToTasks({ tasks, topicId: "t", minutes: 30, today: TODAY, preferTaskId: "late" });
    const byId = new Map(res.tasks.map((t) => [t.id, t]));
    expect(byId.get("late")).toMatchObject({ doneMinutes: 30 });
    expect(byId.get("early")).toMatchObject({ doneMinutes: 0 });
  });

  it("تسک فعال و تسک‌های انجام‌شده دست نمی‌خورند", () => {
    const tasks = [
      task({ id: "active", topicId: "t", date: TODAY, plannedMinutes: 60 }),
      task({ id: "done", topicId: "t", date: TODAY, plannedMinutes: 60, status: "done", doneMinutes: 60 }),
      task({ id: "next", topicId: "t", date: addDays(TODAY, 1), plannedMinutes: 60 }),
    ];
    const res = creditStudyToTasks({ tasks, topicId: "t", minutes: 40, today: TODAY, activeTaskId: "active" });
    const byId = new Map(res.tasks.map((t) => [t.id, t]));
    expect(byId.get("active")).toMatchObject({ doneMinutes: 0 });
    expect(byId.get("next")).toMatchObject({ doneMinutes: 40 });
  });

  it("بدون مبحث یا بدون دقیقه، هیچ کاری نمی‌کند", () => {
    const tasks = [task({ id: "a", topicId: "t", date: TODAY, plannedMinutes: 60 })];
    expect(creditStudyToTasks({ tasks, topicId: "", minutes: 30, today: TODAY }).tasks).toEqual(tasks);
    expect(creditStudyToTasks({ tasks, topicId: "t", minutes: 0, today: TODAY }).tasks).toEqual(tasks);
  });
});

describe("پیش‌خوانی — آزادسازی بار امروز وقتی مبحث آینده خوانده شد", () => {
  it("واریز به تسک آینده، تسک امروز را به فردا منتقل می‌کند", () => {
    const tasks = [
      task({ id: "today-a", topicId: "a", date: TODAY, plannedMinutes: 120, priority: "high" }),
      task({ id: "today-b", topicId: "b", date: TODAY, plannedMinutes: 90, priority: "low" }),
      task({ id: "future", topicId: "f", date: FUTURE, plannedMinutes: 60 }),
    ];
    const res = creditStudyToTasks({ tasks, topicId: "f", minutes: 60, today: TODAY });
    const byId = new Map(res.tasks.map((t) => [t.id, t]));
    expect(byId.get("future")).toMatchObject({ status: "done" });
    // کم‌اولویت‌تر اول جابه‌جا می‌شود
    expect(byId.get("today-b")?.date).toBe(TOMORROW);
    expect(byId.get("today-a")?.date).toBe(TODAY);
    expect(res.futureMinutes).toBe(60);
    expect(res.movedMinutes).toBeGreaterThanOrEqual(60);
  });

  it("مبحث‌های دیگر به مبحث خوانده‌شده ترجیح داده می‌شوند", () => {
    const tasks = [
      task({ id: "same-topic", topicId: "f", date: TODAY, plannedMinutes: 60 }),
      task({ id: "other-topic", topicId: "o", date: TODAY, plannedMinutes: 60 }),
      task({ id: "future", topicId: "f", date: FUTURE, plannedMinutes: 60 }),
    ];
    // ۹۰ دقیقه: اول تسک امروزِ همان مبحث پر می‌شود، بعد تسک آینده → ۳۰ دقیقه پیش‌خوانی
    const res = creditStudyToTasks({ tasks, topicId: "f", minutes: 90, today: TODAY });
    const byId = new Map(res.tasks.map((t) => [t.id, t]));
    expect(byId.get("same-topic")).toMatchObject({ status: "done", date: TODAY });
    expect(byId.get("other-topic")?.date).toBe(TOMORROW);
    expect(res.futureMinutes).toBe(30);
  });

  it("به اندازه‌ی نیاز جابه‌جا می‌کند، نه بیشتر", () => {
    const tasks = [
      task({ id: "t1", topicId: "a", date: TODAY, plannedMinutes: 30 }),
      task({ id: "t2", topicId: "b", date: TODAY, plannedMinutes: 30 }),
      task({ id: "t3", topicId: "c", date: TODAY, plannedMinutes: 30 }),
      task({ id: "future", topicId: "f", date: FUTURE, plannedMinutes: 40 }),
    ];
    const res = creditStudyToTasks({ tasks, topicId: "f", minutes: 40, today: TODAY });
    expect(res.movedTaskIds).toHaveLength(2); // 30+30 ≥ 40 → دو تسک کافی است
    const byId = new Map(res.tasks.map((t) => [t.id, t]));
    expect(byId.get("t3")?.date).toBe(TODAY);
  });

  it("واریز به تسک امروز هیچ بازچینی‌ای ندارد", () => {
    const tasks = [
      task({ id: "today-a", topicId: "a", date: TODAY, plannedMinutes: 120 }),
      task({ id: "today-f", topicId: "f", date: TODAY, plannedMinutes: 60 }),
    ];
    const res = creditStudyToTasks({ tasks, topicId: "f", minutes: 60, today: TODAY });
    expect(res.movedTaskIds).toHaveLength(0);
    expect(res.tasks.map((t) => t.date)).toEqual([TODAY, TODAY]);
  });

  it("rebalance خاموش‌پذیر است", () => {
    const tasks = [
      task({ id: "today-a", topicId: "a", date: TODAY, plannedMinutes: 120 }),
      task({ id: "future", topicId: "f", date: FUTURE, plannedMinutes: 60 }),
    ];
    const res = creditStudyToTasks({ tasks, topicId: "f", minutes: 60, today: TODAY, rebalance: false });
    expect(res.movedTaskIds).toHaveLength(0);
    expect(res.tasks.find((t) => t.id === "today-a")?.date).toBe(TODAY);
  });
});

describe("مرور با مطالعه‌ی اضافه «انجام‌شده» نمی‌شود", () => {
  it("سرریزِ یادگیری به تسک مرورِ آینده دست نمی‌زند و به‌عنوان زمان بی‌تسک برمی‌گردد", () => {
    const tasks = [
      task({ id: "learn", topicId: "t", date: TODAY, plannedMinutes: 60, kind: "learn" }),
      task({ id: "review", topicId: "t", date: addDays(TODAY, 3), plannedMinutes: 30, kind: "review", label: "مرور ۳ روز بعد" }),
    ];
    const res = creditStudyToTasks({ tasks, topicId: "t", minutes: 120, today: TODAY, kind: "learn" });
    const byId = new Map(res.tasks.map((t) => [t.id, t]));
    expect(byId.get("learn")).toMatchObject({ status: "done", doneMinutes: 60 });
    expect(byId.get("review")).toMatchObject({ status: "pending", doneMinutes: 0, date: addDays(TODAY, 3) });
    expect(res.creditedMinutes).toBe(60);
    expect(res.unplannedMinutes).toBe(60);
    expect(res.futureMinutes).toBe(0);
    expect(res.movedTaskIds).toHaveLength(0);
  });

  it("مرورِ سررسیدشده (امروز/عقب‌افتاده) فقط بعد از تسک‌های دیگرِ همان روز واریز می‌شود", () => {
    const tasks = [
      task({ id: "reviewToday", topicId: "t", date: TODAY, plannedMinutes: 40, kind: "review" }),
      task({ id: "summary", topicId: "t", date: TODAY, plannedMinutes: 40, kind: "summary" }),
    ];
    const res = creditStudyToTasks({ tasks, topicId: "t", minutes: 50, today: TODAY });
    const byId = new Map(res.tasks.map((t) => [t.id, t]));
    expect(byId.get("summary")).toMatchObject({ status: "done", doneMinutes: 40 });
    expect(byId.get("reviewToday")).toMatchObject({ status: "pending", doneMinutes: 10 });
    expect(res.unplannedMinutes).toBe(0);
  });

  it("جلسه‌ی «مرور» اول از همه به تسک مرورِ سررسیدشده واریز می‌شود", () => {
    const tasks = [
      task({ id: "learn", topicId: "t", date: TODAY, plannedMinutes: 60, kind: "learn" }),
      task({ id: "reviewToday", topicId: "t", date: TODAY, plannedMinutes: 30, kind: "review" }),
    ];
    const res = creditStudyToTasks({ tasks, topicId: "t", minutes: 30, today: TODAY, kind: "review" });
    const byId = new Map(res.tasks.map((t) => [t.id, t]));
    expect(byId.get("reviewToday")).toMatchObject({ status: "done", doneMinutes: 30 });
    expect(byId.get("learn")).toMatchObject({ doneMinutes: 0 });
  });

  it("جلسه‌ی «ترکیبی» بین تسک یادگیری و تستِ همان مبحث تقسیم می‌شود", () => {
    const tasks = [
      task({ id: "learn", topicId: "t", date: TODAY, plannedMinutes: 30, order: 0, kind: "learn" }),
      task({ id: "test", topicId: "t", date: TODAY, plannedMinutes: 30, order: 1, kind: "test" }),
      task({ id: "review", topicId: "t", date: addDays(TODAY, 2), plannedMinutes: 30, kind: "review" }),
    ];
    const res = creditStudyToTasks({ tasks, topicId: "t", minutes: 45, today: TODAY, kinds: ["mixed"] });
    const byId = new Map(res.tasks.map((t) => [t.id, t]));
    expect(byId.get("learn")).toMatchObject({ status: "done", doneMinutes: 30 });
    expect(byId.get("test")).toMatchObject({ doneMinutes: 15 });
    expect(byId.get("review")).toMatchObject({ doneMinutes: 0, status: "pending" });
    expect(res.unplannedMinutes).toBe(0);
  });

  it("چندنوعِ دستی (یادگیری + تست) هم مثل «ترکیبی» عمل می‌کند", () => {
    const tasks = [
      task({ id: "test", topicId: "t", date: TODAY, plannedMinutes: 20, order: 0, kind: "test" }),
      task({ id: "learn", topicId: "t", date: TODAY, plannedMinutes: 20, order: 1, kind: "learn" }),
    ];
    const res = creditStudyToTasks({ tasks, topicId: "t", minutes: 30, today: TODAY, kinds: ["learn", "test"] });
    const byId = new Map(res.tasks.map((t) => [t.id, t]));
    expect(byId.get("test")).toMatchObject({ doneMinutes: 20, status: "done" });
    expect(byId.get("learn")).toMatchObject({ doneMinutes: 10 });
  });

  it("بدون مبحث، کل زمان به‌عنوان بی‌تسک برمی‌گردد", () => {
    const tasks = [task({ id: "a", topicId: "t", date: TODAY, plannedMinutes: 60 })];
    const res = creditStudyToTasks({ tasks, topicId: "", minutes: 30, today: TODAY });
    expect(res.unplannedMinutes).toBe(30);
    expect(res.creditedMinutes).toBe(0);
  });
});

describe("بازآموزی بعد از مرور ضعیف", () => {
  const topic = { id: "t", estimatedMinutes: 150, priority: "medium" as const };

  it("امتیاز ۰ → بازآموزی فردا و ۳ روز بعد؛ امتیاز ۱ → فقط فردا", () => {
    const zero = buildRelearnTasks({ topic, rating: 0, today: TODAY, existingTasks: [] });
    expect(zero.map((t) => t.date)).toEqual([addDays(TODAY, 1), addDays(TODAY, 3)]);
    expect(zero.every((t) => t.kind === "learn" && t.label === RELEARN_LABEL && t.status === "pending")).toBe(true);
    const one = buildRelearnTasks({ topic, rating: 1, today: TODAY, existingTasks: [] });
    expect(one.map((t) => t.date)).toEqual([addDays(TODAY, 1)]);
  });

  it("امتیاز ۲ و ۳ هیچ بازآموزی‌ای نمی‌سازند", () => {
    expect(buildRelearnTasks({ topic, rating: 2, today: TODAY, existingTasks: [] })).toEqual([]);
    expect(buildRelearnTasks({ topic, rating: 3, today: TODAY, existingTasks: [] })).toEqual([]);
  });

  it("تکراری نمی‌سازد اگر بازآموزی همان روز از قبل هست", () => {
    const existing = [task({ id: "r1", topicId: "t", date: addDays(TODAY, 1), plannedMinutes: 45, kind: "learn", label: RELEARN_LABEL })];
    const again = buildRelearnTasks({ topic, rating: 0, today: TODAY, existingTasks: existing });
    expect(again.map((t) => t.date)).toEqual([addDays(TODAY, 3)]);
    const againOne = buildRelearnTasks({ topic, rating: 1, today: TODAY, existingTasks: existing });
    expect(againOne).toEqual([]);
  });

  it("دقیقه‌ی بازآموزی از روی تخمین مبحث، گرد و در بازه‌ی معقول است", () => {
    expect(relearnMinutes(150)).toBe(45);
    expect(relearnMinutes(10)).toBe(20); // حداقل
    expect(relearnMinutes(10_000)).toBe(90); // حداکثر
    expect(relearnMinutes(0)).toBe(20);
  });
});

describe("rebalanceToday — به‌تنهایی", () => {
  it("تسک فعال را جابه‌جا نمی‌کند و اولویت‌ها را رعایت می‌کند", () => {
    const tasks = [
      task({ id: "high", topicId: "a", date: TODAY, plannedMinutes: 60, priority: "high", order: 0 }),
      task({ id: "low", topicId: "b", date: TODAY, plannedMinutes: 60, priority: "low", order: 1 }),
      task({ id: "active", topicId: "c", date: TODAY, plannedMinutes: 60, priority: "low", order: 2 }),
    ];
    const res = rebalanceToday(tasks, TODAY, 60, undefined, "active");
    expect(res.movedTaskIds).toEqual(["low"]);
    expect(res.tasks.find((t) => t.id === "active")?.date).toBe(TODAY);
    expect(res.tasks.find((t) => t.id === "low")?.date).toBe(TOMORROW);
  });

  it("وقتی چیزی برای جابه‌جایی نیست، همان را برمی‌گرداند", () => {
    const tasks = [task({ id: "future", topicId: "a", date: FUTURE, plannedMinutes: 60 })];
    const res = rebalanceToday(tasks, TODAY, 60);
    expect(res.movedTaskIds).toHaveLength(0);
    expect(res.movedMinutes).toBe(0);
    expect(res.tasks).toEqual(tasks);
  });
});
