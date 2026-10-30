import { describe, expect, it } from "vitest";
import type { Flashcard } from "../../types";
import {
  aiDraftToQuestion,
  answerSupportedByCard,
  buildAiQuizPrompt,
  cardsNeedingAiQuestions,
  parseAiQuizResponse,
} from "../aiQuizGen";
import { cardContentHash } from "../cardQuiz";

function card(partial: Partial<Flashcard> = {}): Flashcard {
  return {
    id: "c1",
    topicId: "t1",
    front: "داروی خط اول درمان ادم ریوی حاد چیست؟",
    back: "فوروزماید (مدر حلقه) — همراه با اکسیژن و نیترات",
    ef: 2.5,
    intervalDays: 0,
    repetitions: 0,
    dueDate: "2026-01-01",
    lapses: 0,
    createdAt: 1,
    ...partial,
  };
}

describe("ساخت سؤال چهارگزینه‌ای با AI", () => {
  it("پرامپت شامل همهٔ کارت‌ها و قواعد سخت است", () => {
    const msgs = buildAiQuizPrompt([{ id: "c1", front: "ف", back: "ب", topicName: "قلب" }]);
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toContain("فقط یکی درست است");
    expect(msgs[1].content).toContain("\"cardId\":\"c1\"");
  });

  it("خروجی JSON با متن اضافه/``` را می‌خواند و ردیف خراب را دور می‌ریزد", () => {
    const raw = '```json\n[{"cardId":"c1","stem":"داروی خط اول چیست؟","options":["فوروزماید","هیدروکلروتیازید","اسپیرونولاکتون","مانیتول"],"correctIndex":0,"explanation":"مدر حلقه"},{"cardId":"c2","stem":"x","options":["a","b"],"correctIndex":0}]\n```';
    const drafts = parseAiQuizResponse(raw);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].options).toHaveLength(4);
    expect(parseAiQuizResponse("not json")).toEqual([]);
  });

  it("پاسخ درست فقط وقتی پذیرفته می‌شود که در محتوای کارت باشد", () => {
    expect(answerSupportedByCard("فوروزماید", card())).toBe(true);
    expect(answerSupportedByCard("فوروزماید (مدر حلقه)", card())).toBe(true);
    expect(answerSupportedByCard("آموکسی‌سیلین", card())).toBe(false);
  });

  it("سؤال معتبر با گزینه‌های منطقی به CardQuestion تبدیل می‌شود", () => {
    const c = card();
    const q = aiDraftToQuestion(
      {
        cardId: "c1",
        stem: "داروی خط اول درمان ادم ریوی حاد کدام است؟",
        options: ["فوروزماید", "هیدروکلروتیازید", "اسپیرونولاکتون", "مانیتول"],
        correctIndex: 0,
        explanation: "فوروزماید مدر حلقه است.",
      },
      c,
      "test-model",
      1234,
    )!;
    expect(q).toBeTruthy();
    expect(q.source).toBe("ai");
    expect(q.options[q.correctIndex]).toBe("فوروزماید");
    expect(q.cardHash).toBe(cardContentHash(c.front, c.back));
    expect(q.id).toContain(":ai");
    expect(q.explanation).toContain("غیرقطعی");
    expect(q.aiModel).toBe("test-model");
  });

  it("سؤالِ چندپاسخی، پاسخِ خارج از کارت یا صورتِ لو‌دهنده رد می‌شود", () => {
    const c = card();
    const base = {
      cardId: "c1",
      stem: "داروی خط اول درمان ادم ریوی حاد کدام است؟",
      options: ["فوروزماید", "هیدروکلروتیازید", "اسپیرونولاکتون", "مانیتول"],
      correctIndex: 0,
    };
    // پاسخ درست خارج از کارت
    expect(aiDraftToQuestion({ ...base, options: ["آموکسی‌سیلین", "هیدروکلروتیازید", "اسپیرونولاکتون", "مانیتول"] }, c)).toBeNull();
    // گزینهٔ تکراری
    expect(aiDraftToQuestion({ ...base, options: ["فوروزماید", "فوروزماید", "اسپیرونولاکتون", "مانیتول"] }, c)).toBeNull();
    // گزینهٔ هم‌پوشان با پاسخ درست (چندپاسخی)
    expect(aiDraftToQuestion({ ...base, options: ["فوروزماید", "فوروزماید وریدی", "اسپیرونولاکتون", "مانیتول"] }, c)).toBeNull();
    // صورت سؤال جواب را لو می‌دهد
    expect(aiDraftToQuestion({ ...base, stem: "آیا فوروزماید برای ادم ریوی حاد مناسب است؟" }, c)).toBeNull();
    // ایندکس نامعتبر
    expect(aiDraftToQuestion({ ...base, correctIndex: 7 }, c)).toBeNull();
  });

  it("کارت‌هایی که سؤالِ AIِ به‌روز دارند دوباره فرستاده نمی‌شوند", () => {
    const c = card();
    const q = aiDraftToQuestion(
      {
        cardId: "c1",
        stem: "داروی خط اول درمان ادم ریوی حاد کدام است؟",
        options: ["فوروزماید", "هیدروکلروتیازید", "اسپیرونولاکتون", "مانیتول"],
        correctIndex: 0,
      },
      c,
    )!;
    expect(cardsNeedingAiQuestions([c], [q])).toHaveLength(0);
    // ویرایش کارت ⇐ سؤال کهنه می‌شود و باید دوباره ساخته شود
    expect(cardsNeedingAiQuestions([{ ...c, back: "فوروزماید با دوز بالا" }], [q])).toHaveLength(1);
    // سؤال علامت‌خورده نادیده گرفته نمی‌شود؛ یعنی کارت دوباره ساخته می‌شود
    expect(cardsNeedingAiQuestions([c], [{ ...q, status: "flagged" }])).toHaveLength(1);
  });
});
