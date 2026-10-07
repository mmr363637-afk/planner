import { describe, expect, it } from "vitest";
import { curatedPending, curatedPendingCount, deckCuratedPacks, deckScopedCards } from "../deckScope";
import type { CuratedPack } from "../curatedPacks";
import type { Flashcard, Topic } from "../../types";

const card = (over: Partial<Flashcard>): Flashcard => ({
  id: over.id ?? "c",
  front: "رو",
  back: "پشت",
  ef: 2.5,
  intervalDays: 0,
  repetitions: 0,
  dueDate: "2026-01-01",
  lapses: 0,
  createdAt: 1,
  ...over,
});

const pack = (over: Partial<CuratedPack> = {}): CuratedPack => ({
  id: "pk1",
  subjectKey: "s",
  subjectName: "درس",
  topicName: "مبحث",
  cards: [
    { f: "س۱", b: "ج۱" },
    { f: "س۲", b: "ج۲" },
    { f: "س۳", b: "ج۳" },
  ],
  ...over,
});

describe("deckScopedCards — دامنه‌ی یک مجموعه", () => {
  it("بدون کلید، همه‌ی کارت‌ها برمی‌گردند («همه‌ی کارت‌ها»)", () => {
    const cards = [card({ id: "a", topicId: "t1" }), card({ id: "b", packId: "pk9" })];
    expect(deckScopedCards(cards, undefined, new Map()).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("کلید p:<packId> فقط کارت‌های همان پک را می‌دهد", () => {
    const cards = [card({ id: "a", packId: "pk-missing" }), card({ id: "b", packId: "pk-other" }), card({ id: "c", topicId: "t1" })];
    expect(deckScopedCards(cards, "p:pk-missing", new Map()).map((c) => c.id)).toEqual(["a"]);
  });

  it("کلید t:<topicId> کارت‌های همان مبحث را می‌دهد", () => {
    const cards = [card({ id: "a", topicId: "t1" }), card({ id: "b", topicId: "t2" })];
    expect(deckScopedCards(cards, "t:t1", new Map()).map((c) => c.id)).toEqual(["a"]);
  });

  it("مجموعه‌ی پکِ ناشناس، پک منتخبی ندارد", () => {
    const topics = new Map<string, Topic>();
    expect(deckCuratedPacks(undefined, topics)).toEqual([]);
    expect(deckCuratedPacks("p:pk-missing", topics)).toEqual([]);
  });
});

describe("curatedPending — چه چیزی برای «افزودن همه» باقی مانده", () => {
  it("کارت‌های قبلاً اضافه‌شده و کارت‌های هم‌متنِ کاربر را دوباره نمی‌شمارد", () => {
    const cards = [
      card({ id: "x", packId: "pk1", front: "س۱", origin: "curated" }), // قبلاً از همین پک اضافه شده
      card({ id: "y", front: "س۲" }), // کارت خودِ کاربر با همان متن
    ];
    expect(curatedPending([pack()], cards)).toEqual([{ packId: "pk1", indices: [2] }]);
    expect(curatedPendingCount([pack()], cards)).toBe(1);
  });

  it("با کارت‌های خالی، همه‌ی کارت‌های پک آماده‌ی افزودن‌اند", () => {
    expect(curatedPendingCount([pack(), pack({ id: "pk2", cards: [{ f: "س۴", b: "ج۴" }] })], [])).toBe(4);
  });

  it("وقتی چیزی باقی نمانده، فهرست خالی است (دکمه‌ی افزودن همه ناپدید می‌شود)", () => {
    const all = pack().cards.map((c, i) => card({ id: `i${i}`, packId: "pk1", front: c.f, origin: "curated" }));
    expect(curatedPendingCount([pack()], all)).toBe(0);
  });
});
