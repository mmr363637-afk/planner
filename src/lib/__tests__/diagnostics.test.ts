import { describe, expect, it } from "vitest";
import { diagnoseWeakSpots } from "../diagnostics";
import { EMPTY_STATE } from "../stateIO";
import type { AppState } from "../../types";

describe("Weak Spot Diagnostics", () => {
  it("detects topics with low test accuracy (< 50%)", () => {
    const mockState: AppState = {
      ...EMPTY_STATE,
      subjects: [{ id: "s1", name: "قلب", color: "#e11d48", priority: "high", createdAt: 1 }],
      topics: [{ id: "t1", subjectId: "s1", name: "نارسایی قلبی", volume: 1, estimatedMinutes: 60, difficulty: 3, priority: "high", status: "learning", createdAt: 1 }],
      testLogs: [
        { id: "l1", date: "2026-09-21", topicId: "t1", total: 10, correct: 3, createdAt: 1 },
      ],
    };

    const spots = diagnoseWeakSpots(mockState);
    expect(spots.length).toBe(1);
    expect(spots[0].topicName).toBe("نارسایی قلبی");
    expect(spots[0].testAccuracy).toBe(30);
  });

  it("detects topics with high flashcard lapses", () => {
    const mockState: AppState = {
      ...EMPTY_STATE,
      subjects: [{ id: "s1", name: "دارو", color: "#10b981", priority: "high", createdAt: 1 }],
      topics: [{ id: "t2", subjectId: "s1", name: "آنتی‌بیوتیک", volume: 1, estimatedMinutes: 60, difficulty: 2, priority: "medium", status: "learning", createdAt: 1 }],
      flashcards: [
        {
          id: "c1",
          topicId: "t2",
          front: "پنی‌سیلین",
          back: "بتالاکتام",
          ef: 1.5,
          repetitions: 1,
          intervalDays: 1,
          lapses: 4,
          dueDate: "2026-09-21",
          createdAt: 1,
        },
      ],
    };

    const spots = diagnoseWeakSpots(mockState);
    expect(spots.length).toBe(1);
    expect(spots[0].topicName).toBe("آنتی‌بیوتیک");
    expect(spots[0].lapseCount).toBe(4);
  });
});
