// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  AI_QUESTION_BATCH_MAX,
  applyAiPatch,
  buildAiQuestionsPrompt,
  parseAiQuestionsResponse,
  questionsNeedingAi,
} from "../aiQuestions";
import { normalizeText } from "../cardQuiz";
import type { CardQuestion, Flashcard } from "../../types";

const card: Flashcard = {
  id: "c1",
  topicId: "t1",
  front: "داروی خط اول فشار خون بالای بدون عارضه؟",
  back: "دیورتیک تیازیدی",
  ef: 2.5,
  intervalDays: 0,
  repetitions: 0,
  dueDate: "2026-01-01",
  lapses: 0,
  createdAt: 1,
  origin: "user",
};

const question: CardQuestion = {
  id: "q:c1:abc:mcq",
  cardId: "c1",
  topicId: "t1",
  kind: "mcq",
  prompt: card.front,
  options: ["دیورتیک تیازیدی", "مهارکننده آنزیم مبدل آنژیوتانسین", "مسدودکننده کانال کلسیم", "بتابلاکر"],
  correctIndex: 0,
  explanation: "پاسخ آفلاین کوتاه",
  source: "offline",
  cardHash: "abc",
  createdAt: 1,
  status: "ok",
};

const patch = (over: Partial<{ id: string; explanation: string; distractors: string[] }> = {}) => ({
  id: question.id,
  explanation: "پاسخ درست دیورتیک تیازیدی است؛ چون در خط اول فشار خون بدون عارضه انتخاب می‌شود و عوارض کمتری دارد. گزینه‌های دیگر خط دوم‌اند. نکته: در نارسایی کلیه احتیاط کن.",
  distractors: ["مهارکننده آنزیم مبدل آنژیوتانسین", "مسدودکننده کانال کلسیم", "بتابلاکر"],
  ...over,
});

describe("پرامپت و پارس پاسخ AI", () => {
  it("قواعد ضدِ چندپاسخی و ممنوعیت تغییر پاسخ درست را صریح می‌گوید", () => {
    const messages = buildAiQuestionsPrompt([{ question, card }]);
    expect(messages).toHaveLength(2);
    const system = messages[0].content;
    expect(system).toContain("پاسخ درست را تغییر نده");
    expect(system).toContain("قطعاً غلط");
    expect(system).toContain("دو گزینه هم‌زمان درست");
    expect(system).toContain('"distractors"');
    // داده‌ی کارت و پاسخ درست به مدل داده می‌شود
    const payload = JSON.parse(messages[1].content) as { id: string; correct: string }[];
    expect(payload[0].id).toBe(question.id);
    expect(payload[0].correct).toBe("دیورتیک تیازیدی");
  });

  it("پاسخ فنس‌دار/دارای متن اضافه را می‌خواند و ردیف‌های ناقص را رد می‌کند", () => {
    const raw = 'سلام\n```json\n[{"id":"q1","explanation":"' + "این توضیح به اندازهٔ کافی بلند است تا پذیرفته شود." + '","distractors":["الف","ب","ج","د"]},' +
      '{"id":"q2","explanation":"کوتاه"},{"id":"","explanation":"این توضیح به اندازهٔ کافی بلند است تا پذیرفته شود."}]\n```';
    const parsed = parseAiQuestionsResponse(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("q1");
    expect(parsed[0].distractors).toHaveLength(3); // سقف سه گزینه
  });

  it("خروجی غیر JSON یا خالی، آرایهٔ خالی برمی‌گرداند (بدون کرش)", () => {
    expect(parseAiQuestionsResponse("")).toEqual([]);
    expect(parseAiQuestionsResponse("مدل توضیح داد ولی JSON نداد")).toEqual([]);
    expect(parseAiQuestionsResponse("{bad json}")).toEqual([]);
  });
});

describe("اعمال پاسخ AI روی سؤال", () => {
  it("توضیح را می‌نویسد، پاسخ درست را دست‌نخورده نگه می‌دارد و منبع را AI می‌کند", () => {
    const next = applyAiPatch(question, card, patch(), "gpt-test");
    expect(next).toBeTruthy();
    const correctBefore = question.options[question.correctIndex];
    expect(normalizeText(next!.options[next!.correctIndex])).toBe(normalizeText(correctBefore));
    expect(next!.options).toHaveLength(4);
    expect(new Set(next!.options.map(normalizeText)).size).toBe(4);
    expect(next!.source).toBe("ai");
    expect(next!.aiModel).toBe("gpt-test");
    expect(next!.aiAt).toBeGreaterThan(0);
    expect(next!.explanation).toContain("دیورتیک تیازیدی");
  });

  it("ترتیب گزینه‌ها با همان ورودی همیشه یکسان است (seed پایدار)", () => {
    const a = applyAiPatch(question, card, patch())!;
    const b = applyAiPatch(question, card, patch())!;
    expect(a.options).toEqual(b.options);
    expect(a.correctIndex).toBe(b.correctIndex);
  });

  it("گزینهٔ هم‌پوشان با پاسخ درست رد می‌شود", () => {
    const next = applyAiPatch(
      question,
      card,
      patch({ distractors: ["دیورتیک تیازیدی (همان پاسخ)", "بتابلاکر", "مسدودکننده کانال کلسیم"] }),
    )!;
    // فقط دو گزینهٔ سالم ماند ⇒ گزینه‌ها عوض نمی‌شوند، ولی توضیح نوشته می‌شود
    expect(next.options).toEqual(question.options);
    expect(next.explanation).toContain("دیورتیک");
    expect(next.source).toBe("ai");
  });

  it("گزینهٔ تکراری یا برگرفته از صورت سؤال پذیرفته نمی‌شود", () => {
    const next = applyAiPatch(
      question,
      card,
      patch({ distractors: [question.prompt, "بتابلاکر", "بتابلاکر", "مسدودکننده کانال کلسیم"] }),
    )!;
    expect(next.options).toEqual(question.options);
  });

  it("توضیح کوتاه یا شناسهٔ نادرست، کل پاسخ را رد می‌کند", () => {
    expect(applyAiPatch(question, card, patch({ explanation: "خیلی کوتاه" }))).toBeNull();
    expect(applyAiPatch(question, card, patch({ id: "q:other" }))).toBeNull();
  });

  it("توضیح بیش از حد بلند بریده می‌شود", () => {
    const next = applyAiPatch(question, card, patch({ explanation: "ا".repeat(2000) }))!;
    expect(next.explanation!.length).toBe(700);
  });
});

describe("انتخاب سؤال‌های نیازمند AI", () => {
  it("سؤال علامت‌خورده را نمی‌فرستد و سقف دسته را رعایت می‌کند", () => {
    const list: CardQuestion[] = [
      { ...question, id: "a", status: "flagged" },
      { ...question, id: "b", source: "offline" },
      { ...question, id: "c", source: "ai", explanation: "توضیح بلندِ قبلی ".repeat(20), status: "ok" },
      { ...question, id: "d", source: "ai", explanation: "کوتاه", status: "ok" },
    ];
    const picked = questionsNeedingAi(list, 2);
    expect(picked.map((q) => q.id)).toEqual(["b", "d"]);
    expect(questionsNeedingAi(list, 999).length).toBeLessThanOrEqual(AI_QUESTION_BATCH_MAX);
  });
});

describe("aiEnrichQuestions (شبکهٔ ساختگی)", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it("بدون پیکربندی، خطای روشن می‌دهد و داده را عوض نمی‌کند", async () => {
    const mod = await import("../aiQuestions");
    const res = await mod.aiEnrichQuestions([{ question, card }]);
    expect(res.updated).toEqual([]);
    expect(res.error).toContain("وصل نشده");
  });

  it("با پاسخ معتبر، سؤال به‌روزشده برمی‌گرداند", async () => {
    localStorage.setItem("sp_ai_config", JSON.stringify({ baseUrl: "https://example.test/v1", apiKey: "", model: "test-model" }));
    vi.doMock("../ai", async () => {
      const actual = await vi.importActual<typeof import("../ai")>("../ai");
      return {
        ...actual,
        requestAiChat: vi.fn(async () => JSON.stringify([patch()])),
      };
    });
    const mod = await import("../aiQuestions");
    const res = await mod.aiEnrichQuestions([{ question, card }]);
    expect(res.error).toBeUndefined();
    expect(res.updated).toHaveLength(1);
    expect(res.updated[0].source).toBe("ai");
    expect(res.updated[0].aiModel).toBe("test-model");
    vi.doUnmock("../ai");
  });
});
