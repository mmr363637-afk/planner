import { describe, expect, it } from "vitest";
import type { Flashcard, Topic } from "../../types";
import {
  answerKey,
  buildQuestionFromCard,
  buildQuizQueue,
  cardContentHash,
  ensureQuestionsForCards,
  formatClock,
  isUsableDistractor,
  keyAnswer,
  normalizeText,
  pickDistractors,
  pickSessionCards,
  questionIsValid,
  scoreSession,
} from "../cardQuiz";

let n = 0;
function card(partial: Partial<Flashcard> & { front: string; back: string }): Flashcard {
  n += 1;
  return {
    id: partial.id ?? `c${n}`,
    ef: 2.5,
    intervalDays: 0,
    repetitions: 0,
    dueDate: "2026-01-01",
    lapses: 0,
    createdAt: n,
    ...partial,
  };
}

function topic(id: string, subjectId = "s1"): Topic {
  n += 1;
  return {
    id, subjectId, name: id, volume: 1, estimatedMinutes: 60,
    priority: "medium", difficulty: 2, status: "learning", createdAt: n,
  };
}

describe("نرمال‌سازی و هش محتوای کارت", () => {
  it("ی/ک عربی و نیم‌فاصله را یکدست می‌کند", () => {
    expect(normalizeText("فوروزمِيد")).toBe(normalizeText("فوروزمِید"));
    expect(normalizeText("کتاب‌ها")).toBe(normalizeText("کتاب ها"));
  });

  it("هش با ویرایش محتوا عوض می‌شود", () => {
    expect(cardContentHash("سوال", "جواب")).toBe(cardContentHash("سوال", "جواب"));
    expect(cardContentHash("سوال", "جواب")).not.toBe(cardContentHash("سوال", "جواب دیگر"));
  });

  it("پاسخ کلیدی از بخش اولِ پشت کارت و بدون پیشوند ساخته می‌شود", () => {
    expect(keyAnswer("پاسخ: مهار پمپ سدیم-پتاسیم؛ افزایش دفع آب")).toBe("مهار پمپ سدیم-پتاسیم");
    expect(keyAnswer("کاهش فشار خون")).toBe("کاهش فشار خون");
  });
});

describe("فیلتر گزینه‌های انحرافی", () => {
  const prompt = "داروی مدر حلقه در درمان ادم ریوی چیست؟";
  const correct = "فوروزماید";

  it("گزینهٔ تکراری یا زیرمجموعهٔ پاسخ درست را رد می‌کند", () => {
    expect(isUsableDistractor("فوروزماید", correct, prompt)).toBe(false);
    expect(isUsableDistractor("فوروزماید تزریقی", correct, prompt)).toBe(false);
  });

  it("گزینه‌ای که در صورت سؤال آمده را رد می‌کند", () => {
    expect(isUsableDistractor("ادم ریوی", correct, prompt)).toBe(false);
  });

  it("دو عددِ متفاوت با متنِ مشابه را رد می‌کند (خطر چندپاسخی)", () => {
    expect(isUsableDistractor("دوز ۴۰ میلی‌گرم فوروزماید", "دوز ۲۰ میلی‌گرم فوروزماید", "دوز؟")).toBe(false);
  });

  it("گزینهٔ کوتاه/بی‌ربط یا هم‌واژهٔ زیاد را رد می‌کند", () => {
    expect(isUsableDistractor("اب", correct, prompt)).toBe(false);
    expect(isUsableDistractor("مهار پمپ سدیم-پتاسیم در لولهٔ پروگزیمال", correct, prompt)).toBe(false);
  });

  it("گزینهٔ محتمل و متفاوت را می‌پذیرد", () => {
    expect(isUsableDistractor("هیدروکلروتیازید", correct, prompt)).toBe(true);
  });

  it("اگر سه گزینهٔ سالم نباشد null برمی‌گرداند", () => {
    expect(pickDistractors(correct, prompt, [{ text: "فوروزماید" }, { text: "فوروزماید وریدی" }])).toBeNull();
  });
});

describe("ساخت سؤال چهارگزینه‌ای از کارت", () => {
  const topicA = topic("tA");
  const cards = [
    card({ id: "c1", front: "مکانیسم اثر فوروزماید؟", back: "مهار پمپ سدیم-پتاسیم در لولهٔ پروگزیمال", topicId: "tA" }),
    card({ id: "c2", front: "مکانیسم اثر تیازید؟", back: "مهار بازجذب سدیم در لولهٔ پیچیدهٔ دیستال", topicId: "tA" }),
    card({ id: "c3", front: "مکانیسم اثر اسپیرونولاکتون؟", back: "آنتاگونیست آلدوسترون در مجاری جمع‌کننده", topicId: "tA" }),
    card({ id: "c4", front: "مکانیسم اثر مانیتول؟", back: "دیورز اسمزی در لولهٔ پروگزیمال", topicId: "tA" }),
    card({ id: "c5", front: "مکانیسم اثر استازولامید؟", back: "مهار آنزیم کربنیک آنهیدراز", topicId: "tA" }),
  ];

  it("چهار گزینهٔ یکتا دارد و پاسخ درست در گزینه‌ها هست", () => {
    const q = buildQuestionFromCard(cards[0], cards, { topics: [topicA], now: 1000 })!;
    expect(q).toBeTruthy();
    expect(q.options).toHaveLength(4);
    expect(new Set(q.options.map(normalizeText)).size).toBe(4);
    expect(q.options[q.correctIndex]).toBe(keyAnswer(cards[0].back));
    expect(q.source).toBe("offline");
    expect(q.explanation).toContain("پاسخ درست");
    expect(q.cardHash).toBe(cardContentHash(cards[0].front, cards[0].back));
  });

  it("خروجی برای همان کارت پایدار است (ترتیب گزینه‌ها هر بار عوض نمی‌شود)", () => {
    const a = buildQuestionFromCard(cards[0], cards, { topics: [topicA] })!;
    const b = buildQuestionFromCard(cards[0], cards, { topics: [topicA] })!;
    expect(a.options).toEqual(b.options);
    expect(a.correctIndex).toBe(b.correctIndex);
    expect(a.id).toBe(b.id);
  });

  it("با کارت‌های ناکافی گزینه نمی‌سازد و null می‌دهد", () => {
    const lonely = [cards[0]];
    expect(buildQuestionFromCard(cards[0], lonely)).toBeNull();
  });

  it("سؤال کهنه بعد از ویرایش کارت معتبر نیست", () => {
    const q = buildQuestionFromCard(cards[0], cards, { topics: [topicA] })!;
    expect(questionIsValid(q, cards[0])).toBe(true);
    const edited = { ...cards[0], back: "مهار پمپ سدیم-پتاسیم در لولهٔ ضخیم صعودی" };
    expect(questionIsValid(q, edited)).toBe(false);
  });

  it("سؤالِ دارای دو گزینهٔ تکراری یا بدون چهار گزینه نامعتبر است", () => {
    const q = buildQuestionFromCard(cards[0], cards, { topics: [topicA] })!;
    expect(questionIsValid({ ...q, options: [q.options[0], q.options[0], "الف", "ب"] }, cards[0])).toBe(false);
    expect(questionIsValid({ ...q, correctIndex: 9 }, cards[0])).toBe(false);
    expect(questionIsValid({ ...q, status: "flagged" }, cards[0])).toBe(false);
  });
});

describe("حالت جاخالی", () => {
  const cards = [
    card({ id: "a", front: "داروی {{فوروزماید}} مدر حلقه است", back: "فوروزماید" }),
    card({ id: "b", front: "داروی {{تیازید}} در لولهٔ دیستال اثر می‌کند", back: "تیازید" }),
    card({ id: "c", front: "داروی {{اسپیرونولاکتون}} آنتاگونیست آلدوسترون است", back: "اسپیرونولاکتون" }),
    card({ id: "d", front: "داروی {{مانیتول}} دیورز اسمزی می‌دهد", back: "مانیتول" }),
  ];

  it("جاخالی را از {{…}} می‌سازد و گزینهٔ درست همان عبارت پنهان است", () => {
    const q = buildQuestionFromCard(cards[0], cards, { kind: "cloze" })!;
    expect(q.prompt).toContain("____");
    expect(q.prompt).not.toContain("فوروزماید");
    expect(q.options[q.correctIndex]).toBe("فوروزماید");
    expect(q.options).toHaveLength(4);
  });

  it("بدون نشانهٔ جاخالی، یک اصطلاح کلیدی از متن پنهان می‌کند", () => {
    const plain = [
      card({ id: "p1", front: "پنوموتوراکس", back: "تجمع هوا در فضای پلور" }),
      card({ id: "p2", front: "پلورال افیوژن", back: "تجمع مایع در فضای پلور" }),
      card({ id: "p3", front: "آتلکتازی", back: "کلاپس آلوئول‌ها" }),
      card({ id: "p4", front: "آمفیزم", back: "تخریب دیوارهٔ آلوئول" }),
    ];
    const q = buildQuestionFromCard(plain[0], plain, { kind: "cloze" });
    expect(q).toBeTruthy();
    expect(q!.prompt).toContain("____");
    expect(q!.options[q!.correctIndex].length).toBeGreaterThan(3);
  });
});

describe("تولید تدریجی و ذخیرهٔ سؤال‌ها", () => {
  const cards = [
    card({ id: "c1", front: "سؤال یک", back: "پاسخ یک: مهار پمپ سدیم" }),
    card({ id: "c2", front: "سؤال دو", back: "پاسخ دو: مهار بازجذب سدیم" }),
    card({ id: "c3", front: "سؤال سه", back: "پاسخ سه: آنتاگونیست آلدوسترون" }),
    card({ id: "c4", front: "سؤال چهار", back: "پاسخ چهار: دیورز اسمزی" }),
  ];

  it("بار اول می‌سازد و بار دوم همان‌ها را نگه می‌دارد", () => {
    const first = ensureQuestionsForCards(cards, cards, [], { now: 10 });
    expect(first.created).toBe(4);
    const second = ensureQuestionsForCards(cards, cards, first.questions, { now: 20 });
    expect(second.created).toBe(0);
    expect(second.rebuilt).toBe(0);
    expect(second.questions).toHaveLength(4);
    expect(second.questions.map((q) => q.createdAt)).toEqual(first.questions.map((q) => q.createdAt));
  });

  it("بعد از ویرایش فقط همان کارت بازسازی می‌شود", () => {
    const first = ensureQuestionsForCards(cards, cards, []);
    const edited = cards.map((c) => (c.id === "c2" ? { ...c, back: "پاسخ تازه: مهار کانال کلسیم" } : c));
    const next = ensureQuestionsForCards(edited, edited, first.questions);
    expect(next.rebuilt).toBe(1);
    expect(next.created).toBe(0);
    const q2 = next.questions.find((q) => q.cardId === "c2")!;
    expect(q2.options[q2.correctIndex]).toContain("مهار کانال کلسیم");
  });

  it("کارتی که امکان ساخت سؤال ندارد در unsupported گزارش می‌شود", () => {
    const lonely = [cards[0]];
    const r = ensureQuestionsForCards(lonely, lonely, []);
    expect(r.unsupported).toEqual(["c1"]);
    expect(r.questions).toHaveLength(0);
  });
});

describe("انتخاب کارت‌ها و صف جلسه", () => {
  const topicA = topic("tA");
  const cards = [
    card({ id: "due1", front: "الف", back: "پاسخ الف کامل", dueDate: "2025-12-01" }),
    card({ id: "due2", front: "ب", back: "پاسخ ب کامل", dueDate: "2025-12-02" }),
    card({ id: "future", front: "ج", back: "پاسخ ج کامل", dueDate: "2027-01-01", bookmark: true }),
  ];

  it("فقط سررسیدها را با محدودیت تعداد برمی‌گرداند", () => {
    const picked = pickSessionCards(cards, { today: "2026-01-01", onlyDue: true, count: 1 });
    expect(picked).toHaveLength(1);
    expect(picked[0].id).toBe("due1");
  });

  it("فیلتر «علامت‌شده» و ترتیب ضعیف‌ها را می‌فهمد", () => {
    expect(pickSessionCards(cards, { today: "2026-01-01", order: "bookmarked" }).map((c) => c.id)).toEqual(["future"]);
    const weak = cards.map((c, i) => (i === 1 ? { ...c, lapses: 5 } : c));
    expect(pickSessionCards(weak, { today: "2026-01-01", order: "weak" })[0].id).toBe("due2");
  });

  it("در نبود سؤال معتبر، کارت به کلاسیک برمی‌گردد و شمارش fallback درست است", () => {
    const source = [
      ...cards,
      card({ id: "x1", front: "س1", back: "پاسخ یکم", topicId: "tA" }),
      card({ id: "x2", front: "س2", back: "پاسخ دوم", topicId: "tA" }),
      card({ id: "x3", front: "س3", back: "پاسخ سوم", topicId: "tA" }),
      card({ id: "x4", front: "س4", back: "پاسخ چهارم", topicId: "tA" }),
    ];
    const topicCards = source.filter((c) => c.topicId === "tA");
    const qs = ensureQuestionsForCards(topicCards, source, [], { topics: [topicA] }).questions;
    expect(qs).toHaveLength(4);
    const built = buildQuizQueue(topicCards, qs, "mcq");
    expect(built.items.every((i) => i.mode === "mcq")).toBe(true);
    expect(built.fallback).toBe(0);
    const empty = buildQuizQueue(topicCards, [], "mcq");
    expect(empty.fallback).toBe(topicCards.length);
    expect(empty.items.every((i) => i.mode === "classic")).toBe(true);
  });
});

describe("امتیاز و زمان جلسه", () => {
  const items = [
    { card: card({ front: "a", back: "ب" }), mode: "classic" as const },
    { card: card({ front: "c", back: "د" }), mode: "classic" as const },
  ];

  it("پاسخ‌ها یک‌بار کلید می‌خورند و پاسخ تکراری دوباره شمرده نمی‌شود", () => {
    const key = answerKey(items[0]);
    const answers = { [key]: { selectedIndex: null, correct: true, answeredAt: 1 } };
    expect(answerKey(items[0])).toBe(key);
    const score = scoreSession(items, { ...answers, [key]: { ...answers[key], correct: false } });
    expect(score.answered).toBe(1);
    expect(score.correct).toBe(0);
    expect(score.wrong).toBe(1);
    expect(score.skipped).toBe(1);
    expect(score.accuracy).toBe(0);
  });

  it("زمان را با ارقام فارسی نشان می‌دهد", () => {
    expect(formatClock(0)).toBe("۰۰:۰۰");
    expect(formatClock(125)).toBe("۰۲:۰۵");
    expect(formatClock(-4)).toBe("۰۰:۰۰");
  });
});
