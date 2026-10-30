import { describe, expect, it } from "vitest";
import { smartReviewCardIds, smartReviewHeadline, smartWeakSpots } from "../smartReview";
import type { BankAttempt, CardAttempt, Flashcard, Mistake, Topic } from "../../types";

const today = "2026-10-30";
const mkCard = (id: string, topicId: string, extra: Partial<Flashcard> = {}): Flashcard =>
  ({
    id,
    topicId,
    front: `سؤال ${id}`,
    back: `پاسخ ${id}`,
    ef: 2.5,
    intervalDays: 0,
    repetitions: 0,
    dueDate: today,
    lapses: 0,
    createdAt: 0,
    origin: "user",
    ...extra,
  }) as Flashcard;

const topics = [{ id: "t1", name: "قلب", subjectId: "s1", createdAt: 0 } as Topic, { id: "t2", name: "ریه", subjectId: "s1", createdAt: 0 } as Topic];

describe("مرور هوشمند", () => {
  it("مبحث با کارتِ عقب‌افتاده و فراموشی زیاد را بالاتر می‌آورد", () => {
    const flashcards = [
      mkCard("a1", "t1", { dueDate: "2026-10-20", lapses: 4 }),
      mkCard("a2", "t1", { dueDate: "2026-10-18", lapses: 3 }),
      mkCard("b1", "t2", { dueDate: "2026-10-29" }),
    ];
    const spots = smartWeakSpots({ flashcards, topics, today });
    expect(spots.length).toBe(2);
    expect(spots[0].label).toBe("قلب");
    expect(spots[0].reasons.join(" ")).toMatch(/سررسید/);
    expect(spots[0].cardIds.length).toBe(2);
  });

  it("مبحث بدون مشکل پیشنهاد نمی‌شود", () => {
    const spots = smartWeakSpots({ flashcards: [mkCard("b1", "t2", { dueDate: "2026-12-01" })], topics, today });
    expect(spots).toHaveLength(0);
  });

  it("دقت پایین آزمون کارتی بعد از حداقل داده، وزن می‌گیرد", () => {
    const flashcards = [mkCard("a1", "t1", { dueDate: "2027-01-01" }), mkCard("a2", "t1", { dueDate: "2027-01-01" }), mkCard("a3", "t1", { dueDate: "2027-01-01" })];
    const cardAttempts: CardAttempt[] = [1, 2, 3, 4].map((n) => ({
      id: `ca${n}`,
      cardId: n % 2 === 0 ? "a1" : "a2",
      mode: "mcq",
      correct: n === 1,
      at: 100 + n,
    }));
    const spots = smartWeakSpots({ flashcards, topics, cardAttempts, today });
    expect(spots).toHaveLength(1);
    expect(spots[0].cardAccuracy).toBe(25);
    expect(spots[0].reasons.join(" ")).toContain("دقت آزمون");
  });

  it("نمونهٔ کم و پرت از بانک سؤال پیشنهاد نمی‌شود ولی نمونهٔ کافی می‌شود", () => {
    const flashcards = [mkCard("b1", "t2", { dueDate: "2027-01-01" })];
    const few: BankAttempt[] = [1, 2, 3].map((n) => ({
      id: `b${n}`,
      questionId: `q${n}`,
      topicId: "bank-1",
      topicTitle: "ریه",
      examType: "pre_internship",
      year: 1402,
      correct: false,
      at: n,
    }));
    expect(smartWeakSpots({ flashcards, topics, bankAttempts: few, today })).toHaveLength(0);

    const many: BankAttempt[] = Array.from({ length: 6 }, (_, i) => ({
      id: `m${i}`,
      questionId: `q${i}`,
      topicId: "bank-1",
      topicTitle: "ریه",
      examType: "residency" as const,
      year: 1403,
      correct: i === 0,
      at: i,
    }));
    const spots = smartWeakSpots({ flashcards, topics, bankAttempts: many, today });
    const bankSpot = spots.find((s) => s.kind === "bank");
    expect(bankSpot).toBeTruthy();
    expect(bankSpot?.bankAccuracy).toBe(17);
    expect(bankSpot?.cardIds).toEqual(["b1"]);
  });

  it("اشتباهاتِ سررسیدشده امتیاز اضافه می‌کنند", () => {
    const flashcards = [mkCard("a1", "t1", { dueDate: "2027-01-01" })];
    const mistakes: Mistake[] = [
      { id: "m1", topicId: "t1", question: "q", dueDate: today, reviewCount: 0, lapses: 0, createdAt: 0, subjectId: "s1" } as Mistake,
    ];
    const before = smartWeakSpots({ flashcards, topics, today });
    const after = smartWeakSpots({ flashcards, topics, mistakes, today });
    expect(before).toHaveLength(0);
    expect(after[0].score).toBeGreaterThan(0);
  });

  it("کارت‌های پیشنهادی بدون تکرار و سقف‌دارند و عنوان خوانا دارد", () => {
    const flashcards = [mkCard("a1", "t1"), mkCard("a2", "t1"), mkCard("b1", "t2", { dueDate: "2026-10-01" })];
    const spots = smartWeakSpots({ flashcards, topics, today });
    const ids = smartReviewCardIds(spots);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeLessThanOrEqual(3);
    expect(smartReviewCardIds(spots, 1)).toHaveLength(1);
    expect(smartReviewHeadline(spots)).toContain("تمرکز");
    expect(smartReviewHeadline([])).toContain("دادهٔ کافی");
  });
});
