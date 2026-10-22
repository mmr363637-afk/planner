import { describe, expect, it } from "vitest";
import type { Subject, Topic } from "../../types";
import { generateSmartPlan } from "../smartPlan";

let n = 0;
const nid = () => `x${++n}`;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function subj(id: string, approach: Subject["approach"] = "mixed"): Subject {
  n += 1;
  return { id, name: id, color: "#000", priority: "high", approach, createdAt: n };
}
function topic(id: string, subjectId: string, est: number): Topic {
  n += 1;
  return { id, subjectId, name: id, volume: 1, estimatedMinutes: est, priority: "high", difficulty: 2, status: "not_started", createdAt: n };
}

describe("برنامه‌ریزیِ واقع‌بینانه", () => {
  it("هیچ نوبتِ یادگیری/تستی زیر کفِ اجرایی نمی‌سازد", () => {
    const r = generateSmartPlan({
      planId: "p", topics: [topic("a", "s", 200)], subjects: [subj("s")],
      startDate: "2026-01-01", endDate: "2026-01-04",
      studyDays: ALL_DAYS, dailyMinutes: 240, maxSessionMinutes: 90,
      reviewGaps: [], bufferDays: 0, idFactory: nid,
    });
    expect(r.tasks.length).toBeGreaterThan(0);
    for (const t of r.tasks) {
      if (t.kind === "learn") expect(t.plannedMinutes).toBeGreaterThanOrEqual(30);
      if (t.kind === "test") expect(t.plannedMinutes).toBeGreaterThanOrEqual(20);
      if (t.kind === "review") expect(t.plannedMinutes).toBeGreaterThanOrEqual(10);
    }
  });

  it("وقتی ظرفیت واقعاً کم است، «۱۵ دقیقه برای مبحث ۹۰ دقیقه‌ای» نمی‌سازد؛ صادقانه گزارش می‌دهد", () => {
    const r = generateSmartPlan({
      planId: "p", topics: [topic("big", "s", 300)], subjects: [subj("s")],
      startDate: "2026-01-01", endDate: "2026-01-03",
      studyDays: ALL_DAYS, dailyMinutes: 45, maxSessionMinutes: 30,
      reviewGaps: [], bufferDays: 0, idFactory: nid,
    });
    expect(r.unplacedMinutes).toBeGreaterThan(0);
    expect(r.neededExtraDays).toBeGreaterThan(0);
    expect(r.suggestedEndDate).not.toBeNull();
    expect(r.unplacedTopicIds).toContain("big");
    expect(r.warnings.join(" ")).toContain("جا نشد");
    // هیچ تسکی کوچک‌تر از کف نیست
    for (const t of r.tasks) {
      if (t.kind === "learn") expect(t.plannedMinutes).toBeGreaterThanOrEqual(30);
    }
  });

  it("روش مطالعه روی مجموع زمان اثر می‌گذارد (رفرنس > بانک سؤال)", () => {
    const base = {
      planId: "p", topics: [topic("a", "s", 120)],
      startDate: "2026-01-01", endDate: "2026-01-20",
      studyDays: ALL_DAYS, dailyMinutes: 240, reviewGaps: [], bufferDays: 0, idFactory: nid,
    };
    const reference = generateSmartPlan({ ...base, subjects: [subj("s", "reference")], approaches: { s: "reference" } });
    const qbank = generateSmartPlan({ ...base, subjects: [subj("s", "qbank")], approaches: { s: "qbank" } });
    expect(reference.totalNeeded).toBeGreaterThan(qbank.totalNeeded);
    expect(reference.estimates[0].minutes).toBeGreaterThan(qbank.estimates[0].minutes);
  });

  it("زمان دستیِ کاربر روی همان روش، در برآورد برنامه استفاده می‌شود", () => {
    const t = { ...topic("a", "s", 600), estimateOverrides: { qbank: 60 } };
    const r = generateSmartPlan({
      planId: "p", topics: [t], subjects: [subj("s", "qbank")], approaches: { s: "qbank" },
      startDate: "2026-01-01", endDate: "2026-01-10",
      studyDays: ALL_DAYS, dailyMinutes: 240, reviewGaps: [], bufferDays: 0, idFactory: nid,
    });
    expect(r.estimates[0]).toMatchObject({ topicId: "a", minutes: 60, source: "manual" });
    expect(r.totalNeeded).toBeLessThanOrEqual(70); // با کفِ اجرایی و گِردکردن
    expect(r.notes.join(" ")).toContain("زمانِ دستی");
  });

  it("مباحث در طول بازه پخش می‌شوند و همه به روزهای آخر نمی‌ریزند", () => {
    const topics = Array.from({ length: 6 }, (_, i) => topic(`t${i}`, "s", 120));
    const r = generateSmartPlan({
      planId: "p", topics, subjects: [subj("s")],
      startDate: "2026-01-01", endDate: "2026-01-10",
      studyDays: ALL_DAYS, dailyMinutes: 180, reviewGaps: [1], bufferDays: 0, idFactory: nid,
    });
    const activeDays = new Set(r.tasks.map((t) => t.date));
    expect(activeDays.size).toBeGreaterThanOrEqual(5);
    // کار از همان روزهای اول شروع می‌شود، نه از انتهای بازه
    expect(r.tasks.some((t) => t.date === r.dates[0])).toBe(true);
    expect(r.tasks.some((t) => t.date === r.dates[1])).toBe(true);
    // هیچ روزی از ظرفیتش بیشتر نشده (مرورها ممکن است کمی سوار شوند)
    const byDay = new Map<string, number>();
    for (const t of r.tasks) byDay.set(t.date, (byDay.get(t.date) ?? 0) + t.plannedMinutes);
    for (const [, minutes] of byDay) expect(minutes).toBeLessThanOrEqual(180 + 60);
    expect(r.unplacedMinutes).toBe(0);
  });
});
