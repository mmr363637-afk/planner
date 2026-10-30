import { describe, expect, it } from "vitest";
import type { BankQuestion } from "../../types";
import {
  availableYears,
  bankPerformance,
  bankStudyAdvice,
  buildBankManifest,
  extractQuestions,
  filterBankQuestions,
  makeBankAttempt,
  normalizeBankQuestion,
  normalizeManifest,
  scoreBankSession,
  selectBankQuestions,
  weakBankTopics,
} from "../examBank";
import { BANK_SAMPLE_QUESTIONS } from "../examBankSeed";

function q(partial: Partial<BankQuestion> & { id: string }): BankQuestion {
  return {
    examType: "pre_internship",
    year: 1401,
    subject: "داخلی",
    topicId: "t1",
    topicTitle: "قلب",
    stem: "سؤال نمونهٔ کافی برای اعتبارسنجی؟",
    options: ["الف", "ب", "ج", "د"],
    correctIndex: 0,
    explanation: "توضیح",
    ...partial,
  };
}

describe("اعتبارسنجی سؤال بانک", () => {
  it("سؤال سالم را می‌پذیرد و فیلدهای اضافی را پاک می‌کند", () => {
    const out = normalizeBankQuestion({
      id: " x1 ",
      examType: "residency",
      year: "1400",
      subject: "جراحی",
      topicTitle: "شکم",
      stem: "  صورت سؤالِ معتبر برای آزمون  ",
      options: ["یک", "دو", "سه", "چهار"],
      correctIndex: 3,
      explanation: "  توضیح  ",
      keyPoints: ["نکتهٔ اول مهم", "ک", "نکتهٔ دوم مهم"],
    })!;
    expect(out.id).toBe("x1");
    expect(out.year).toBe(1400);
    expect(out.stem).toBe("صورت سؤالِ معتبر برای آزمون");
    expect(out.correctIndex).toBe(3);
    expect(out.topicId).toBe("شکم");
    expect(out.keyPoints).toEqual(["نکتهٔ اول مهم", "نکتهٔ دوم مهم"]);
  });

  it("سؤال ناقص/چندپاسخی/خارج از بازه را رد می‌کند", () => {
    expect(normalizeBankQuestion(null)).toBeNull();
    expect(normalizeBankQuestion(q({ id: "a", options: ["الف", "ب", "ج", "د"] } as never))).toBeTruthy();
    expect(normalizeBankQuestion({ ...q({ id: "b" }), options: ["الف", "ب", "ج"] })).toBeNull();
    expect(normalizeBankQuestion({ ...q({ id: "c" }), options: ["الف", "الف", "ج", "د"] })).toBeNull();
    expect(normalizeBankQuestion({ ...q({ id: "d" }), correctIndex: 4 })).toBeNull();
    expect(normalizeBankQuestion({ ...q({ id: "e" }), year: 1300 })).toBeNull();
    expect(normalizeBankQuestion({ ...q({ id: "f" }), year: 1600 })).toBeNull();
    expect(normalizeBankQuestion({ ...q({ id: "g" }), examType: "other" })).toBeNull();
    expect(normalizeBankQuestion({ ...q({ id: "h" }), stem: "کوتاه" })).toBeNull();
  });

  it("شارد را می‌خواند، شناسهٔ تکراری را یک‌بار می‌آورد", () => {
    const list = extractQuestions({ questions: [q({ id: "a" }), q({ id: "a" }), q({ id: "b" }), { broken: true }] });
    expect(list.map((x) => x.id)).toEqual(["a", "b"]);
    expect(extractQuestions(null)).toEqual([]);
  });
});

describe("مانیفست بانک", () => {
  it("از سؤال‌ها مانیفستِ مبحث‌محور با سال و نوع آزمون می‌سازد", () => {
    const manifest = buildBankManifest([
      q({ id: "1", topicId: "t1", year: 1402, examType: "residency" }),
      q({ id: "2", topicId: "t1", year: 1400 }),
      q({ id: "3", topicId: "t2", topicTitle: "ریه", year: 1399 }),
    ]);
    expect(manifest.topics).toHaveLength(2);
    const t1 = manifest.topics.find((t) => t.topicId === "t1")!;
    expect(t1.count).toBe(2);
    expect(t1.byExamType).toEqual({ residency: 1, pre_internship: 1 });
    expect(t1.years).toEqual([1402, 1400]);
    expect(normalizeManifest(manifest)!.topics).toHaveLength(2);
  });

  it("مانیفست خراب را رد می‌کند و مبحثِ بدون سؤال را می‌اندازد", () => {
    expect(normalizeManifest(null)).toBeNull();
    expect(normalizeManifest({ topics: [] })).toBeNull();
    const ok = normalizeManifest({ topics: [{ topicId: "t1", topicTitle: "قلب", subject: "داخلی", count: 0, years: [1401] }] });
    expect(ok).toBeNull(); // count صفر ارزش نمایش ندارد
  });

  it("سال‌های موجود از مانیفست و سؤال‌ها یکی می‌شود", () => {
    const manifest = buildBankManifest([q({ id: "1", year: 1402 }), q({ id: "2", year: 1399 })]);
    expect(availableYears(manifest, [q({ id: "3", year: 1400 })])).toEqual([1402, 1400, 1399]);
  });
});

describe("فیلتر و انتخاب سؤال", () => {
  const questions = [
    q({ id: "a", topicId: "t1", year: 1402, examType: "residency" }),
    q({ id: "b", topicId: "t1", year: 1399 }),
    q({ id: "c", topicId: "t2", year: 1401 }),
    q({ id: "d", topicId: "t2", year: 1395, examType: "residency" }),
    q({ id: "e", topicId: "t3", year: 1398 }),
  ];

  it("فیلتر نوع آزمون، بازهٔ سال و مبحث هم‌زمان کار می‌کند", () => {
    expect(filterBankQuestions(questions, { examTypes: ["residency"] }).map((x) => x.id)).toEqual(["a", "d"]);
    expect(filterBankQuestions(questions, { yearFrom: 1398, yearTo: 1401 }).map((x) => x.id)).toEqual(["b", "c", "e"]);
    expect(filterBankQuestions(questions, { topicIds: ["t1"] }).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("انتخاب، بین مبحث‌ها نوبتی است و سقف تعداد را رعایت می‌کند", () => {
    const picked = selectBankQuestions(questions, { count: 4, seed: 7 });
    expect(picked).toHaveLength(4);
    expect(new Set(picked.slice(0, 3).map((x) => x.topicId)).size).toBe(3);
    expect(selectBankQuestions(questions, { count: 99 }).length).toBe(5);
  });

  it("انتخاب با seed پایدار است و onlyIds را رعایت می‌کند", () => {
    const a = selectBankQuestions(questions, { count: 5, seed: 3 }).map((x) => x.id);
    const b = selectBankQuestions(questions, { count: 5, seed: 3 }).map((x) => x.id);
    expect(a).toEqual(b);
    expect(selectBankQuestions(questions, { count: 5, onlyIds: ["c"] }).map((x) => x.id)).toEqual(["c"]);
  });
});

describe("گزارش عملکرد بانک", () => {
  const base = (topicId: string, correct: boolean, at: number, topicTitle = topicId) => {
    const question = q({ id: `q-${at}`, topicId, topicTitle });
    return makeBankAttempt(question, correct ? 0 : 1, correct, 1000, at);
  };

  it("دقت هر مبحث را حساب می‌کند و ضعیف‌ها را جدا می‌کند", () => {
    const attempts = [
      ...Array.from({ length: 6 }, (_, i) => base("t1", i < 2, 100 + i)),
      ...Array.from({ length: 4 }, (_, i) => base("t2", true, 200 + i)),
    ];
    const perf = bankPerformance(attempts);
    expect(perf.find((p) => p.topicId === "t1")!.accuracy).toBe(33);
    const weak = weakBankTopics(attempts);
    expect(weak.map((w) => w.topicId)).toEqual(["t1"]);
    // نمونهٔ کم (۴ پاسخ) ضعیف حساب نمی‌شود
    expect(weakBankTopics([...Array.from({ length: 2 }, (_, i) => base("t3", false, 300 + i))])).toEqual([]);
  });

  it("نتیجهٔ آزمون و توصیهٔ مطالعه درست ساخته می‌شود", () => {
    const questions = [q({ id: "1" }), q({ id: "2" }), q({ id: "3" })];
    const result = scoreBankSession(
      questions,
      { "1": { selectedIndex: 0, correct: true }, "3": { selectedIndex: 2, correct: false } },
      { startedAt: 1000, usedSec: 90, examType: "mixed", source: "online" },
      5000,
    );
    expect(result).toMatchObject({ total: 3, answered: 2, correct: 1, wrong: 1, skipped: 1, usedSec: 90, source: "online" });
    expect(result.topicIds).toEqual(["t1"]);
    expect(bankStudyAdvice([])).toEqual([]);
    const advice = bankStudyAdvice(
      Array.from({ length: 5 }, (_, i) => base("t1", false, 100 + i, "قلب")),
      [result],
    );
    expect(advice[0]).toContain("قلب");
  });
});

describe("مجموعهٔ نمونهٔ داخلی", () => {
  it("همهٔ سؤال‌ها معتبرند و پاسخنامه و نکته دارند", () => {
    expect(BANK_SAMPLE_QUESTIONS.length).toBeGreaterThanOrEqual(25);
    for (const q of BANK_SAMPLE_QUESTIONS) {
      expect(normalizeBankQuestion(q), q.id).toBeTruthy();
      expect(q.explanation.length, q.id).toBeGreaterThan(40);
      expect((q.keyPoints ?? []).length, q.id).toBeGreaterThan(0);
    }
    const manifest = buildBankManifest(BANK_SAMPLE_QUESTIONS);
    expect(manifest.topics.length).toBeGreaterThanOrEqual(5);
    expect(manifest.topics.every((t) => t.years.every((y) => y >= 1390))).toBe(true);
  });
});
