// تست موتور حالت جنگی: اولویت‌ها، اسلات ۵۰/۱۰، احترام به بایگانی و بودجه
import { describe, expect, it } from "vitest";
import { buildCramPlan, cramTotals, CRAM_WORK } from "./cram";
import type { Flashcard, LearningStatus, Mistake, Review, ReviewStatus, Subject, Topic } from "../types";

const TODAY = "2026-09-13";

function sub(id: string, archived = false): Subject {
  return { id, name: id, color: "#000", priority: "medium", archived, createdAt: 1 };
}
function topic(id: string, subjectId = "s1", status: LearningStatus = "not_started"): Topic {
  return { id, subjectId, name: id, volume: 10, estimatedMinutes: 30, priority: "medium", difficulty: 2, status, createdAt: 1 };
}
function review(topicId: string, dueDate: string, status: ReviewStatus = "pending"): Review {
  return { id: `r-${topicId}`, topicId, dueDate, reviewNumber: 1, stage: 0, intervalDays: 1, status };
}
function mistake(id: string, dueDate: string, topicId = "t1"): Mistake {
  return { id, question: "سؤال سخت", topicId, dueDate, reviewCount: 0, lapses: 0, createdAt: 1 };
}
function card(id: string, dueDate: string, topicId = "t1"): Flashcard {
  return { id, topicId, front: "رو", back: "پشت", ef: 2.5, intervalDays: 1, repetitions: 0, dueDate, lapses: 0, createdAt: 1 };
}

describe("buildCramPlan", () => {
  it("وقتی درس فعالی نیست [] برمی‌گرداند", () => {
    expect(buildCramPlan({ topics: [], reviews: [], mistakes: [], flashcards: [], subjects: [], hours: 6, today: TODAY })).toEqual([]);
  });

  it("اولویت: اشتباه‌های سررسیده، بعد مرورها، بعد یادگیری، بعد کارت‌ها", () => {
    const blocks = buildCramPlan({
      topics: [topic("t1", "s1", "needs_review"), topic("t2", "s1", "not_started")],
      reviews: [review("t1", "2026-09-01")],
      mistakes: [mistake("m1", "2026-09-01", "t1")],
      flashcards: [card("c1", "2026-09-01", "t2")],
      subjects: [sub("s1")],
      hours: 6,
      today: TODAY,
    });
    const work = blocks.filter((b) => b.kind !== "break");
    expect(work.length).toBeGreaterThan(3);
    expect(work[0]!.kind).toBe("mistakes");
    expect(work[1]!.kind).toBe("review");
    const kinds = work.map((w) => w.kind);
    expect(kinds).toContain("learn");
    expect(kinds).toContain("cards");
    // مبحث ضعیف (needs_review) قبل از شروع‌نشده می‌آید
    const learnTopics = work.filter((w) => w.kind === "learn").map((w) => w.topicId);
    expect(learnTopics[0]).toBe("t1");
  });

  it("بلاک‌های کار حداکثر ۵۰ دقیقه‌اند و استراحت‌ها ۱۰ دقیقه‌ای و منظم", () => {
    const blocks = buildCramPlan({
      topics: [topic("t1", "s1", "not_started")],
      reviews: [review("t1", "2026-09-01")],
      mistakes: [mistake("m1", "2026-09-01", "t1"), mistake("m2", "2026-09-02", "t1")],
      flashcards: [card("c1", "2026-09-01", "t1")],
      subjects: [sub("s1")],
      hours: 6,
      today: TODAY,
    });
    expect(blocks.every((b) => (b.kind === "break" ? b.minutes === 10 : b.minutes <= CRAM_WORK))).toBe(true);
    expect(blocks.some((b) => b.kind === "break")).toBe(true);
    // هیچ دو استراحتی پشت سر هم نیست و استراحت تهِ لیست نیست
    for (let i = 0; i < blocks.length - 1; i++) {
      expect(blocks[i]!.kind === "break" && blocks[i + 1]!.kind === "break").toBe(false);
    }
    expect(blocks[blocks.length - 1]!.kind).not.toBe("break");
  });

  it("مجموع زمان از بودجه‌ی ساعتی بیشتر نمی‌شود (آخرش «بخشی» می‌شود)", () => {
    const blocks = buildCramPlan({
      topics: [topic("t1", "s1", "not_started"), topic("t2", "s1", "needs_review")],
      reviews: [review("t1", "2026-09-01"), review("t2", "2026-09-01")],
      mistakes: [mistake("m1", "2026-09-01", "t1")],
      flashcards: [card("c1", "2026-09-01", "t1"), card("c2", "2026-09-01", "t2")],
      subjects: [sub("s1")],
      hours: 3,
      today: TODAY,
    });
    const total = blocks.reduce((a, b) => a + b.minutes, 0);
    expect(total).toBeLessThanOrEqual(3 * 60);
  });

  it("درس بایگانی‌شده کنار گذاشته می‌شود و فیلتر subjectId کار می‌کند", () => {
    const args = {
      topics: [topic("t1", "s1", "not_started"), topic("t2", "s2", "not_started")],
      reviews: [] as Review[],
      mistakes: [] as Mistake[],
      flashcards: [] as Flashcard[],
      subjects: [sub("s1"), sub("s2", true)],
      hours: 6,
      today: TODAY,
    };
    const all = buildCramPlan(args);
    const learn = all.filter((b) => b.kind === "learn");
    expect(learn.length).toBeGreaterThan(0);
    expect(learn.every((b) => b.topicId === "t1")).toBe(true);
    // فیلتر به درس بایگانی‌شده → هیچ محتوایی در اسکوپ نیست
    const filtered = buildCramPlan({ ...args, subjectId: "s2" });
    expect(filtered.filter((b) => b.kind === "learn")).toHaveLength(0);
  });

  it("وقتی همه تسلط شده‌اند، «مرور افتخاری» ۲۵ دقیقه‌ای می‌دهد", () => {
    const blocks = buildCramPlan({
      topics: [topic("t1", "s1", "mastered")],
      reviews: [],
      mistakes: [],
      flashcards: [],
      subjects: [sub("s1")],
      hours: 6,
      today: TODAY,
    });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe("recap");
    expect(blocks[0]!.minutes).toBe(25);
  });
});

describe("cramTotals", () => {
  it("کار/استراحت/انجام‌شده را درست جمع می‌زند", () => {
    const t = cramTotals([
      { kind: "mistakes", minutes: 30, done: true },
      { kind: "break", minutes: 10, done: false },
      { kind: "learn", minutes: 50, done: false },
    ]);
    expect(t).toEqual({ work: 80, rest: 10, total: 90, doneWork: 30 });
  });
});
