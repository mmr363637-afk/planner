import { describe, expect, it } from "vitest";
import { goldenHours } from "../goldenHours";
import { topicEta, planPace } from "../eta";
import { catchUpSummary } from "../catchUp";
import { backupStatus, backupFileName } from "../backup";
import { accuracyByGroup, recentTestCount, testTotals, weeklyAccuracy } from "../testStats";
import type { StudySession, StudyTask, TestLog } from "../../types";

const DAY = 86400000;
function ses(id: string, startedAt: number, minutes: number, topicId: string | null = "t1", date?: string): StudySession {
  return {
    id, topicId, startedAt, endedAt: startedAt + minutes * 60000, durationMinutes: minutes,
    rating: null, mode: "free", date: date ?? new Date(startedAt).toISOString().slice(0, 10),
  };
}

describe("goldenHours", () => {
  it("ساعت‌ها را bucket می‌کند و بهترین پنجره را پیدا می‌کند", () => {
    const now = new Date("2026-09-10T20:00:00").getTime();
    const at = (h: number, daysAgo = 1) => new Date("2026-09-10T00:00:00").getTime() + h * 3600000 - daysAgo * DAY;
    const sessions = [
      ses("a", at(8, 2), 60),
      ses("b", at(9, 2), 45),
      ses("c", at(21, 3), 30),
      ses("d", at(8, 4), 20),
      ses("old", at(8, 200), 999), // خارج از پنجره‌ی ۹۰ روز
    ];
    const r = goldenHours(sessions, 90, now);
    expect(r.totalSessions).toBe(4);
    expect(r.buckets[8].minutes).toBe(80);
    expect(r.bestWindow).not.toBeNull();
    expect(r.bestWindow!.startHour).toBeGreaterThanOrEqual(7);
    expect(r.bestWindow!.startHour).toBeLessThanOrEqual(9);
  });

  it("بدون جلسه، bestWindow = null", () => {
    const r = goldenHours([], 90, Date.now());
    expect(r.bestWindow).toBeNull();
    expect(r.totalMinutes).toBe(0);
  });
});

describe("topicEta", () => {
  const today = "2026-09-10";
  it("با نرخ ثابت ETA می‌دهد", () => {
    // ۱۴ روز اخیر: روزی ۱۰ دقیقه → نرخ ۱۰
    const sessions: StudySession[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(new Date(today).getTime() - i * DAY);
      sessions.push(ses(`s${i}`, d.getTime(), 10, "t1", d.toISOString().slice(0, 10)));
    }
    const r = topicEta({ id: "t1", estimatedMinutes: 60 + 140 }, sessions, today);
    expect(r.studiedMin).toBe(140);
    expect(r.remainingMin).toBe(60);
    expect(r.dailyRate).toBeCloseTo(10, 1);
    expect(r.etaDays).toBe(6);
  });

  it("بدون مطالعه‌ی اخیر ETA ندارد", () => {
    const r = topicEta({ id: "t1", estimatedMinutes: 100 }, [], today);
    expect(r.etaDays).toBeNull();
    expect(r.remainingMin).toBe(100);
  });

  it("مبحثِ تمام‌شده etaDays=0", () => {
    const d0 = new Date(today).getTime();
    const r = topicEta({ id: "t1", estimatedMinutes: 30 }, [ses("x", d0, 40, "t1", today)], today);
    expect(r.etaDays).toBe(0);
  });
});

describe("planPace / catchUpSummary", () => {
  const today = "2026-09-10";
  const task = (date: string, planned: number, done = 0, status: "pending" | "done" = "pending"): StudyTask => ({
    id: `${date}-${planned}`, topicId: "t1", date, plannedMinutes: planned, doneMinutes: done, status, order: 0, priority: "medium",
  });

  it("پوشش برنامه با نرخ فعلی", () => {
    const sessions = [ses("a", new Date("2026-09-09T10:00").getTime(), 70, "t1", "2026-09-09")];
    const tasks = [task("2026-09-10", 60), task("2026-09-11", 60)];
    const p = planPace({ endDate: "2026-09-11", dailyMinutes: 70 }, tasks, sessions, today);
    expect(p.plannedRemaining).toBe(120);
    expect(p.coveragePct).not.toBeNull();
    expect(p.coveragePct!).toBeLessThanOrEqual(100);
  });

  it("catchUp پیشنهاد دقیقه‌ی اضافه می‌دهد", () => {
    const tasks = [task("2026-09-08", 100), task("2026-09-09", 100, 50)];
    const plans = [{ endDate: "2026-09-16", archived: false }];
    const r = catchUpSummary(tasks, plans, today);
    expect(r.overdueMinutes).toBe(150);
    expect(r.dailyExtra).toBeGreaterThan(0);
  });

  it("بدون عقب‌افتادگی، صفر", () => {
    const r = catchUpSummary([], [], today);
    expect(r.overdueMinutes).toBe(0);
    expect(r.feasible).toBe(true);
  });
});

describe("backup / testStats", () => {
  it("backupStatus پس از intervalDays سررسید می‌شود", () => {
    const now = Date.now();
    expect(backupStatus({ enabled: true, intervalDays: 7, lastBackupAt: now - 8 * DAY }, now).due).toBe(true);
    expect(backupStatus({ enabled: true, intervalDays: 7, lastBackupAt: now - 3 * DAY }, now).due).toBe(false);
    expect(backupStatus({ enabled: false, intervalDays: 7 }, now).due).toBe(false);
    expect(backupStatus({ enabled: true, intervalDays: 7 }, now).due).toBe(true); // هرگز بکاپ نداشته
    expect(backupFileName("2026-09-10")).toContain("2026-09-10");
  });

  it("testTotals و گروه‌بندی", () => {
    const logs: TestLog[] = [
      { id: "1", subjectId: "s1", date: "2026-09-10", total: 20, correct: 15, createdAt: 1 },
      { id: "2", subjectId: "s1", date: "2026-09-04", total: 10, correct: 5, createdAt: 2 }, // هفته‌ی قبل (شروع هفته = شنبه)
      { id: "3", date: "2026-09-09", total: 10, correct: 10, createdAt: 3 },
    ];
    const t = testTotals(logs);
    expect(t.total).toBe(40);
    expect(t.accuracy).toBe(75);
    const g = accuracyByGroup(logs);
    expect(g.get("s1")!.accuracy).toBe(67);
    expect(g.get("__free_test__")!.accuracy).toBe(100);
    expect(recentTestCount(logs, 2, "2026-09-10")).toBe(30); // ۹ و ۱۰ سپتامبر
    expect(recentTestCount(logs, 1, "2026-09-10")).toBe(20);
    const weeks = weeklyAccuracy(logs, "2026-09-10", 2);
    expect(weeks).toHaveLength(2);
    expect(weeks[0].total).toBe(10); // هفته‌ی قبل
    expect(weeks[1].total).toBe(30); // هفته‌ی جاری
  });
});
