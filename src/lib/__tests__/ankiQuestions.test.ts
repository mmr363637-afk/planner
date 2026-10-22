import { describe, expect, it } from "vitest";
import { ankiFromQuestions } from "../ankiExport";
import type { CardQuestion, Subject, Topic } from "../../types";

const subjects: Subject[] = [{ id: "s1", name: "قلب", color: "#f00", priority: "high", createdAt: 1 }];
const topics: Topic[] = [
  { id: "t1", subjectId: "s1", name: "آریتمی", volume: 10, estimatedMinutes: 60, priority: "medium", difficulty: 2, status: "learning", createdAt: 1 },
];

const q = (over: Partial<CardQuestion> = {}): CardQuestion => ({
  id: "q1",
  cardId: "c1",
  topicId: "t1",
  kind: "mcq",
  prompt: "داروی خط اول؟",
  options: ["دیورتیک تیازیدی", "بتابلاکر", "مهارکننده ACE", "مسدودکننده کانال کلسیم"],
  correctIndex: 0,
  explanation: "پاسخ درست دیورتیک تیازیدی است.",
  source: "offline",
  cardHash: "h",
  createdAt: 1,
  status: "ok",
  ...over,
});

describe("خروجی بانک سؤال برای Anki", () => {
  it("سؤال سالم را با گزینه‌ها و پاسخنامه به‌صورت Basic بیرون می‌دهد", () => {
    const { text, count } = ankiFromQuestions([q()], topics, subjects);
    expect(count).toBe(1);
    expect(text).toContain("#notetype:Basic");
    expect(text).toContain("داروی خط اول؟");
    expect(text).toContain("1) دیورتیک تیازیدی");
    expect(text).toContain("✅ دیورتیک تیازیدی");
    expect(text).toContain("پاسخ درست دیورتیک تیازیدی است.");
    // تگ سلسله‌مراتبی درس::مبحث (با زیرخط) و تگ برنامه
    expect(text).toContain("قلب");
    expect(text).toContain("آریتمی");
    expect(text).toContain("study-planner");
    // ستون‌ها با تب جدا شده‌اند: روی کارت، پشت، تگ
    const row = text.trim().split("\n").filter((l) => !l.startsWith("#"))[0];
    expect(row.split("\t")).toHaveLength(3);
  });

  it("سؤال علامت‌خورده به‌صورت پیش‌فرض حذف می‌شود (ولی با فلگ قابل‌خروجی است)", () => {
    expect(ankiFromQuestions([q({ status: "flagged" })], topics, subjects).count).toBe(0);
    expect(ankiFromQuestions([q({ status: "flagged" })], topics, subjects, { includeFlagged: true }).count).toBe(1);
  });

  it("سؤالِ ناقص (بدون صورت/گزینهٔ پاسخ) و گزینه‌های خالی روی خط نمی‌روند", () => {
    expect(ankiFromQuestions([q({ prompt: "  " })], topics, subjects).count).toBe(0);
    expect(ankiFromQuestions([q({ options: ["", "ب", "ج", "د"], correctIndex: 0 })], topics, subjects).count).toBe(0);
  });

  it("فیلتر «فقط با پاسخنامه» کار می‌کند", () => {
    const list = [q(), q({ id: "q2", explanation: "" })];
    expect(ankiFromQuestions(list, topics, subjects).count).toBe(2);
    expect(ankiFromQuestions(list, topics, subjects, { onlyWithExplanation: true }).count).toBe(1);
  });

  it("سؤال بدون مبحث هم بیرون می‌رود (بدون تگ مبحث، ولی با تگ برنامه)", () => {
    const { text, count } = ankiFromQuestions([q({ topicId: undefined })], topics, subjects);
    expect(count).toBe(1);
    expect(text).toContain("study-planner");
  });

  it("خط جدید/تب داخل متن، ستون‌های Anki را نمی‌شکند", () => {
    const { text } = ankiFromQuestions([q({ prompt: "خط اول\nخط\tدوم؟" })], topics, subjects);
    const row = text.trim().split("\n").filter((l) => !l.startsWith("#"))[0];
    expect(row.split("\t")).toHaveLength(3);
  });
});
