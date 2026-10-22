import { describe, expect, it } from "vitest";
import type { Flashcard, Subject, Topic } from "../../types";
import {
  buildCardPackage,
  packageFilename,
  packageTopicKey,
  parseCardPackage,
  planCardPackageImport,
  serializeCardPackage,
} from "../cardPackage";

let n = 0;
function subject(id: string, name: string): Subject {
  n += 1;
  return { id, name, color: "#000", priority: "high", createdAt: n };
}
function topic(id: string, subjectId: string, name: string, sampleId?: string): Topic {
  n += 1;
  return { id, subjectId, name, sampleId, volume: 1, estimatedMinutes: 60, priority: "medium", difficulty: 2, status: "learning", createdAt: n };
}
function card(id: string, front: string, back: string, topicId?: string, extra: Partial<Flashcard> = {}): Flashcard {
  n += 1;
  return { id, front, back, topicId, ef: 2.5, intervalDays: 0, repetitions: 0, dueDate: "2026-01-01", lapses: 0, createdAt: n, ...extra };
}

const subjects = [subject("s1", "فارماکولوژی")];
const topics = [topic("t1", "s1", "مدرها"), topic("t2", "s1", "قلب")];
const cards = [
  card("c1", "مدر حلقه؟", "فوروزماید", "t1", { note: "یادم بماند", highlights: ["فوروزماید"], bookmark: true }),
  card("c2", "مدر دیستال؟", "تیازید", "t1"),
  card("c3", "درمان ادم؟", "فوروزماید", "t2"),
  card("c4", "بدون مبحث", "مقدار نامعلوم"),
];

describe("ساخت و خواندن بستهٔ فلش‌کارت", () => {
  it("فقط کارت‌های مبحث انتخاب‌شده را با ساختار می‌آورد", () => {
    const pkg = buildCardPackage(cards.filter((c) => c.topicId === "t1"), topics, subjects, { exportedAt: 5 });
    expect(pkg.cards).toHaveLength(2);
    expect(pkg.topics).toHaveLength(1);
    expect(pkg.topics[0].name).toBe("مدرها");
    expect(pkg.topics[0].subjectName).toBe("فارماکولوژی");
    expect(pkg.cards[0].topicKey).toBe(packageTopicKey(topics[0], "فارماکولوژی"));
    expect(pkg.cards[0].note).toBe("یادم بماند");
    expect(pkg.cards[0].bookmarked).toBe(true);
  });

  it("رفت‌وبرگشت serialize/parse ساختار را حفظ می‌کند", () => {
    const pkg = buildCardPackage(cards.slice(0, 3), topics, subjects, { exportedAt: 9 });
    const parsed = parseCardPackage(serializeCardPackage(pkg));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.pkg.cards).toHaveLength(3);
    expect(parsed.pkg.topics).toHaveLength(2);
    expect(parsed.pkg.cards[0].front).toBe("مدر حلقه؟");
    expect(parsed.pkg.exportedAt).toBe(9);
  });

  it("کارت‌های بدون مبحث هم بدون ازدست‌رفتن ساختار می‌آیند", () => {
    const pkg = buildCardPackage(cards, topics, subjects);
    const orphan = pkg.cards.find((c) => c.front === "بدون مبحث")!;
    expect(orphan.topicKey).toBeUndefined();
  });

  it("آرایهٔ سادهٔ {front, back} هم پذیرفته می‌شود", () => {
    const parsed = parseCardPackage(JSON.stringify([{ front: "الف", back: "ب" }, { front: "", back: "ج" }]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.pkg.cards).toHaveLength(1);
  });

  it("فایل خراب یا بستهٔ نسخهٔ آینده رد می‌شود", () => {
    expect(parseCardPackage("{").ok).toBe(false);
    expect(parseCardPackage(JSON.stringify({ format: "study-planner.cards", version: 99, cards: [] })).ok).toBe(false);
    expect(parseCardPackage(JSON.stringify({ cards: [] })).ok).toBe(false);
  });
});

describe("برنامهٔ واردکردن بسته", () => {
  it("کارت‌های تکراری را دوباره اضافه نمی‌کند", () => {
    const pkg = buildCardPackage(cards.slice(0, 3), topics, subjects);
    const plan = planCardPackageImport(pkg, { topics, subjects, cards });
    expect(plan.cardsToAdd).toHaveLength(0);
    expect(plan.stats.duplicates).toBe(3);
    expect(plan.topicsToCreate).toHaveLength(0);
  });

  it("مبحث ناشناخته را می‌سازد و کلیدش را به کارت‌ها وصل می‌کند", () => {
    const pkg = buildCardPackage([card("x", "سؤال", "پاسخ", "t9")], [topic("t9", "s1", "نورولوژی")], subjects);
    const plan = planCardPackageImport(pkg, { topics, subjects, cards: [] });
    expect(plan.topicsToCreate).toHaveLength(1);
    expect(plan.topicsToCreate[0].name).toBe("نورولوژی");
    expect(plan.topicsToCreate[0].newSubjectName).toBe("");
    expect(plan.cardsToAdd).toHaveLength(1);
    expect(plan.cardsToAdd[0].newTopicKey).toBe(plan.topicsToCreate[0].key);
  });

  it("مبحث را با نام/درس تطبیق می‌دهد حتی بدون sampleId", () => {
    const pkg = buildCardPackage([card("x", "سؤال تازه", "پاسخ تازه", "t1")], topics, subjects);
    const plan = planCardPackageImport(pkg, { topics, subjects, cards: [] });
    expect(plan.topicsToCreate).toHaveLength(0);
    expect(plan.cardsToAdd[0].matchedTopicId).toBe("t1");
  });

  it("کارت بدون مبحث را در گروه «بدون مبحث» وارد می‌کند", () => {
    const pkg = buildCardPackage([cards[3]], topics, subjects);
    const plan = planCardPackageImport(pkg, { topics, subjects, cards: [] });
    expect(plan.cardsToAdd).toHaveLength(1);
    expect(plan.cardsToAdd[0].matchedTopicId).toBeUndefined();
    expect(plan.stats.orphan).toBe(1);
  });

  it("همان متن در مبحث دیگر را تکراری حساب نمی‌کند", () => {
    const pkg = buildCardPackage([card("x", "درمان ادم؟", "فوروزماید", "t2")], topics, subjects);
    const plan = planCardPackageImport(pkg, { topics, subjects, cards });
    // c3 همین متن را در t2 دارد → تکراری
    expect(plan.stats.duplicates).toBe(1);
    const pkg2 = buildCardPackage([card("x", "درمان ادم؟", "فوروزماید", "t1")], topics, subjects);
    const plan2 = planCardPackageImport(pkg2, { topics, subjects, cards });
    expect(plan2.cardsToAdd).toHaveLength(1);
  });

  it("نام فایل امن و مبحث‌محور است", () => {
    expect(packageFilename(["مدرها", "قلب"], "2026-01-01")).toBe("flashcards-مدرها+قلب-2026-01-01.json");
    expect(packageFilename([], "2026-01-01")).toBe("flashcards-all-2026-01-01.json");
  });
});
