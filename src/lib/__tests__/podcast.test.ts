import { describe, expect, it } from "vitest";
import { buildPodcastQueue } from "../podcast";
import type { Subject, Topic } from "../../types";

const topics = new Map<string, Topic>([
  ["t1", { id: "t1", subjectId: "s1", name: "قلب", volume: 1, estimatedMinutes: 10, priority: "high", difficulty: 2, status: "learning", createdAt: 1 }],
]);
const subjects = new Map<string, Subject>([
  ["s1", { id: "s1", name: "داخلی", color: "#000", priority: "high", createdAt: 1 }],
]);

describe("صف پادکست مرور", () => {
  it("اشتباهات اول، بعد مرورها، بعد کارت‌ها", () => {
    const q = buildPodcastQueue({
      reviews: [{ id: "r", topicId: "t1", dueDate: "2026-01-01", reviewNumber: 2, stage: 1, intervalDays: 3, status: "pending" }],
      flashcards: [{ id: "c", front: "علت؟", back: "فشار", ef: 2.5, intervalDays: 1, repetitions: 1, dueDate: "2026-01-01", lapses: 0, createdAt: 1 }],
      mistakes: [{ id: "m", question: "تست غلط", answer: "گزینه ۲", dueDate: "2026-01-01", reviewCount: 0, lapses: 0, createdAt: 1 }],
      topicById: topics,
      subjectOfTopic: (id) => subjects.get(topics.get(id)?.subjectId ?? ""),
      subjectById: subjects,
    });
    expect(q).toHaveLength(3);
    expect(q[0].title).toContain("اشتباه");
    expect(q[1].text).toContain("قلب");
    expect(q[2].text).toContain("فشار");
  });

  it("سقف تعداد رعایت می‌شود", () => {
    const q = buildPodcastQueue({
      reviews: [], flashcards: [], mistakes: [],
      topicById: topics,
      subjectOfTopic: () => undefined,
      subjectById: subjects,
      limit: 5,
    });
    expect(q).toEqual([]);
  });
});
