import { describe, expect, it } from "vitest";
import { calculateFsrsNext, mapQualityToFsrs } from "../fsrs";
import type { Flashcard } from "../../types";

describe("FSRS Scheduler Engine", () => {
  const baseCard: Flashcard = {
    id: "c1",
    front: "پرسش",
    back: "پاسخ",
    ef: 2.5,
    repetitions: 0,
    intervalDays: 1,
    lapses: 0,
    dueDate: "2026-09-21",
    createdAt: 1000,
  };

  it("handles 'Again' rating (rating: 1) by resetting reps and increasing lapses", () => {
    const updated = calculateFsrsNext(baseCard, 1, "2026-09-21");
    expect(updated.repetitions).toBe(0);
    expect(updated.intervalDays).toBe(1);
    expect(updated.lapses).toBe(1);
    expect(updated.dueDate).toBe("2026-09-22");
  });

  it("handles 'Good' rating (rating: 3) by advancing interval and reps", () => {
    const updated = calculateFsrsNext(baseCard, 3, "2026-09-21");
    expect(updated.repetitions).toBe(1);
    expect(updated.intervalDays).toBeGreaterThanOrEqual(2);
    expect(updated.lapses).toBe(0);
  });

  it("handles 'Easy' rating (rating: 4) with larger initial interval", () => {
    const updated = calculateFsrsNext(baseCard, 4, "2026-09-21");
    expect(updated.repetitions).toBe(1);
    expect(updated.intervalDays).toBeGreaterThanOrEqual(6);
  });
});

describe("نگاشت درجه‌های UI به FSRS", () => {
  it("چهار دکمه‌ی موجود به چهار درجه‌ی FSRS می‌نشینند", () => {
    expect(mapQualityToFsrs(0)).toBe(1);
    expect(mapQualityToFsrs(1)).toBe(1); // بلد نبودم → Again
    expect(mapQualityToFsrs(3)).toBe(2); // سخت → Hard
    expect(mapQualityToFsrs(4)).toBe(3); // خوب → Good
    expect(mapQualityToFsrs(5)).toBe(4); // آسون → Easy
  });
});
