import { describe, expect, it } from "vitest";
import type { Flashcard, Review, StudySession, StudyTask, TestLog, Topic } from "../../types";
import { assessLateTopic, LATE_STATE_LABEL } from "../lateTopic";

const topic: Topic = {
  id: "t1", subjectId: "s1", name: "مدرها", volume: 1, estimatedMinutes: 120,
  priority: "high", difficulty: 2, status: "learning", createdAt: 1,
};

function session(id: string, date: string, minutes: number): StudySession {
  return { id, topicId: "t1", startedAt: 1, endedAt: 2, durationMinutes: minutes, rating: null, mode: "free", date };
}
function review(id: string, dueDate: string, status: Review["status"] = "pending"): Review {
  return { id, topicId: "t1", dueDate, reviewNumber: 1, stage: 0, intervalDays: 3, status };
}
function card(id: string, partial: Partial<Flashcard> = {}): Flashcard {
  return {
    id, topicId: "t1", front: `س${id}`, back: `پاسخ ${id}`, ef: 2.5, intervalDays: 5, repetitions: 2,
    dueDate: "2026-01-01", lapses: 0, createdAt: 1, lastReviewedAt: Date.now() - 40 * 86_400_000, ...partial,
  };
}
function task(id: string, partial: Partial<StudyTask> = {}): StudyTask {
  return { id, topicId: "t1", date: "2025-12-01", plannedMinutes: 60, doneMinutes: 0, status: "done", order: 0, priority: "high", ...partial };
}

describe("تشخیص وضعیت مبحث عقب‌افتاده", () => {
  it("مبحثِ بدون سابقه «شروع‌نشده» است و یادگیری مجدد پیشنهاد می‌شود", () => {
    const a = assessLateTopic({ topic, today: "2026-01-10" });
    expect(a.state).toBe("not_started");
    expect(a.recommended).toBe("relearn");
    expect(a.options.find((o) => o.id === "relearn")!.recommended).toBe(true);
    expect(a.options.find((o) => o.id === "quiz")!.available).toBe(false);
    expect(a.stateLabel).toBe(LATE_STATE_LABEL.not_started);
  });

  it("مرورِ سررسیدشده = نیاز به مرور، نه یادگیری مجدد", () => {
    const a = assessLateTopic({
      topic, today: "2026-01-10",
      sessions: [session("s1", "2026-01-05", 90)],
      reviews: [review("r1", "2026-01-09")],
      flashcards: [card("c1", { lastReviewedAt: Date.now() - 86_400_000 })],
    });
    expect(a.state).toBe("needs_review");
    expect(a.pendingReviews).toBe(1);
    expect(a.recommended).not.toBe("relearn");
    expect(a.reason).toContain("مرور");
  });

  it("گذشتِ طولانی + یادآوری ضعیف = احتمال فراموشی (نه لزوماً از صفر)", () => {
    const a = assessLateTopic({
      topic, today: "2026-06-01",
      sessions: [session("s1", "2026-01-01", 120)],
      flashcards: [card("c1"), card("c2")],
    });
    expect(a.state).toBe("forgotten");
    expect(a.reason).toContain("از صفر");
    expect(a.daysSinceStudy).toBeGreaterThan(100);
  });

  it("سابقهٔ نزدیک و بدون مرورِ عقب‌افتاده = روی مسیر", () => {
    const a = assessLateTopic({
      topic, today: "2026-01-10",
      sessions: [session("s1", "2026-01-08", 60)],
      reviews: [review("r1", "2026-01-12")],
      flashcards: [card("c1", { lastReviewedAt: Date.now() - 2 * 86_400_000 })],
    });
    expect(a.state).toBe("on_track");
  });

  it("وقتی تست‌ها ضعیف‌اند، تمرین سؤال پیشنهاد می‌شود", () => {
    const logs: TestLog[] = [{ id: "l1", topicId: "t1", date: "2026-01-08", total: 20, correct: 8, createdAt: 1 }];
    const a = assessLateTopic({
      topic, today: "2026-01-10",
      sessions: [session("s1", "2026-01-08", 60)],
      reviews: [review("r1", "2026-01-09")],
      flashcards: [card("c1"), card("c2"), card("c3"), card("c4")],
      testLogs: logs,
    });
    expect(a.testAccuracy).toBe(40);
    expect(a.recommended).toBe("targeted");
    expect(a.options.find((o) => o.id === "targeted")!.available).toBe(true);
  });

  it("چهار گزینه همیشه با برچسب و توضیح برمی‌گردند", () => {
    const a = assessLateTopic({ topic, today: "2026-01-10" });
    expect(a.options.map((o) => o.id)).toEqual(["relearn", "review", "quiz", "targeted"]);
    expect(a.options.every((o) => o.label.length > 0 && o.description.length > 0)).toBe(true);
    expect(a.options.filter((o) => o.recommended)).toHaveLength(1);
  });

  it("تسکِ مرورِ برنامه هم مرورِ سررسیدشده حساب می‌شود", () => {
    const a = assessLateTopic({
      topic, today: "2026-01-10",
      tasks: [task("k1", { kind: "review", status: "pending", date: "2026-01-09", plannedMinutes: 15 })],
    });
    expect(a.pendingReviews).toBe(1);
    expect(a.state).toBe("needs_review");
  });
});
