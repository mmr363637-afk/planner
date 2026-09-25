import { describe, expect, it } from "vitest";
import { buildMemoryGarden, recallLevel, recallProbability } from "../recall";
import type { Flashcard, Subject, Topic } from "../../types";

const DAY = 86_400_000;

function card(partial: Partial<Flashcard> & { id: string }): Flashcard {
  return {
    front: "رو",
    back: "پشت",
    ef: 2.5,
    intervalDays: 0,
    repetitions: 0,
    dueDate: "2026-09-23",
    lapses: 0,
    createdAt: Date.now(),
    ...partial,
  };
}

function topic(id: string, subjectId: string, name: string): Topic {
  return { id, subjectId, name, volume: 1, estimatedMinutes: 30, priority: "medium", difficulty: 2, status: "learning", createdAt: 0 };
}

const subjects: Subject[] = [
  { id: "s1", name: "قلب", color: "#f00", priority: "high", createdAt: 0 },
];

describe("باغ حافظه — احتمال یادآوری", () => {
  it("کارتِ هرگز مرور نشده پیش‌بینی ندارد", () => {
    expect(recallProbability(card({ id: "c0" }), "2026-09-23")).toBeNull();
  });

  it("بلافاصله بعد از مرور، یادآوری ≈ ۱ است", () => {
    const c = card({ id: "c1", intervalDays: 7, repetitions: 2, lastReviewedAt: Date.now() });
    const r = recallProbability(c, "2026-09-23");
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThan(0.98);
  });

  it("در خودِ روزِ سررسید (t = S) یادآوری ≈ ۰.۹ است", () => {
    const c = card({ id: "c2", intervalDays: 10, repetitions: 3, lastReviewedAt: Date.now() - 10 * DAY });
    const r = recallProbability(c, "2026-09-23");
    expect(r!).toBeCloseTo(0.9, 1);
  });

  it("دو برابرِ فاصله → افت محسوس (زیر ۰.۸۵)", () => {
    const c = card({ id: "c3", intervalDays: 5, repetitions: 2, lastReviewedAt: Date.now() - 10 * DAY });
    expect(recallProbability(c, "2026-09-23")!).toBeLessThan(0.85);
  });

  it("داده‌ی قدیمی بدون lastReviewedAt از dueDate بازسازی می‌شود", () => {
    const c = card({ id: "c4", intervalDays: 4, repetitions: 2, dueDate: "2026-09-23", lastReviewedAt: undefined });
    // آخرین مرور ≈ ۴ روز پیش → t/S = 1 → R ≈ 0.9
    expect(recallProbability(c, "2026-09-23")!).toBeCloseTo(0.9, 1);
  });

  it("باغ: تشنگان زیر آستانه و میانگین کلی", () => {
    const now = Date.now();
    const cards = [
      card({ id: "a", topicId: "t1", intervalDays: 10, repetitions: 2, lastReviewedAt: now - 1 * DAY }), // ~0.99
      card({ id: "b", topicId: "t1", intervalDays: 10, repetitions: 2, lastReviewedAt: now - 15 * DAY }), // <0.7
      card({ id: "c", topicId: "t2", intervalDays: 4, repetitions: 2, lastReviewedAt: now - 12 * DAY }), // خشک: 0.9^3 ≈ 0.73
      card({ id: "d", intervalDays: 0, repetitions: 0 }), // بدون مبحث — شمرده نمی‌شود
    ];
    const topics = [topic("t1", "s1", "گردش خون"), topic("t2", "s1", "نوار قلب")];
    const garden = buildMemoryGarden(cards, topics, subjects, "2026-09-23");
    expect(garden.topics.length).toBe(2);
    expect(garden.overall).not.toBeNull();
    expect(garden.thirsty.map((t) => t.topicName)).toContain("نوار قلب");
    const t1 = garden.topics.find((t) => t.topicId === "t1")!;
    expect(t1.cards).toBe(2);
  });

  it("برچسب‌های سطح", () => {
    expect(recallLevel(null).label).toContain("نو");
    expect(recallLevel(0.3).label).toContain("خشک");
    expect(recallLevel(0.6).label).toContain("تشنه");
    expect(recallLevel(0.95).label).toContain("قوی");
  });
});
