import { describe, expect, it } from "vitest";
import type { Flashcard, Subject, Topic } from "../../types";
import { buildQuizScopes, cardsInQuizScope, recommendQuizScope } from "../quizScope";

const subjects: Subject[] = [
  { id: "s1", name: "داخلی", color: "#3b82f6", priority: "high", createdAt: 1 },
  { id: "s2", name: "جراحی", color: "#ef4444", priority: "medium", createdAt: 2 },
];
const topics: Topic[] = [
  { id: "t1", subjectId: "s1", name: "قلب", volume: 10, estimatedMinutes: 60, priority: "high", difficulty: 2, status: "learning", createdAt: 1 },
  { id: "t2", subjectId: "s1", name: "ریه", volume: 10, estimatedMinutes: 60, priority: "medium", difficulty: 2, status: "learning", createdAt: 2 },
  { id: "t3", subjectId: "s2", name: "شکم", volume: 10, estimatedMinutes: 60, priority: "medium", difficulty: 2, status: "learning", createdAt: 3 },
];

function card(id: string, topicId: string | undefined, dueDate: string): Flashcard {
  return { id, topicId, front: id, back: id, ef: 2.5, intervalDays: 0, repetitions: 0, dueDate, lapses: 0, createdAt: 1 };
}

const cards = [
  card("c1", "t1", "2026-01-01"),
  card("c2", "t1", "2020-01-01"),
  card("c3", "t2", "2030-01-01"),
  card("c4", "t3", "2020-01-01"),
  card("c5", undefined, "2030-01-01"),
];

describe("دامنه‌های آزمون چهارگزینه‌ای", () => {
  it("برای هر مبحث یک دامنه می‌سازد و کارت‌های بی‌مبحث را فقط در «همه» می‌آورد", () => {
    const scopes = buildQuizScopes(cards, topics, subjects, "2026-01-01");
    const t1 = scopes.find((s) => s.key === "t:t1")!;
    expect(t1.count).toBe(2);
    expect(t1.dueCount).toBe(2);
    expect(t1.subjectName).toBe("داخلی");
    expect(scopes.some((s) => s.key === "t:t9")).toBe(false);
    const all = scopes.find((s) => s.key === "all")!;
    expect(all.count).toBe(5);
  });

  it("دامنهٔ درس فقط برای درسی که چند مبحث دارد ساخته می‌شود", () => {
    const scopes = buildQuizScopes(cards, topics, subjects, "2026-01-01");
    expect(scopes.find((s) => s.key === "s:s1")?.count).toBe(3);
    expect(scopes.find((s) => s.key === "s:s2")).toBeUndefined();
  });

  it("تعداد سؤال‌های آماده جدا شمرده می‌شود", () => {
    const scopes = buildQuizScopes(cards, topics, subjects, "2026-01-01", new Set(["c1", "c4"]));
    expect(scopes.find((s) => s.key === "t:t1")!.questionCount).toBe(1);
    expect(scopes.find((s) => s.key === "all")!.questionCount).toBe(2);
  });

  it("کارت‌های هر دامنه با کلید همان دامنه برمی‌گردند", () => {
    expect(cardsInQuizScope(cards, topics, "t:t1").map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(cardsInQuizScope(cards, topics, "s:s1").map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
    expect(cardsInQuizScope(cards, topics, "all")).toHaveLength(5);
    expect(cardsInQuizScope(cards, topics, "unknown")).toHaveLength(5);
  });

  it("پیشنهاد خودکار یک مبحثِ واقعی می‌دهد، نه آزمون سراسری", () => {
    const scopes = buildQuizScopes(cards, topics, subjects, "2026-01-01");
    const rec = recommendQuizScope(scopes)!;
    expect(rec.kind).toBe("topic");
    expect(["t:t1", "t:t3"]).toContain(rec.key);
    expect(recommendQuizScope([])).toBeNull();
  });
});
