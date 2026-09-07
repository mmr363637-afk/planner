import { describe, expect, it } from "vitest";
import { SM2_MIN_EF, classifyCards, isDue, nextEf, sm2Next } from "../sm2";
import type { Flashcard } from "../../types";

function card(patch: Partial<Flashcard> = {}): Flashcard {
  return { id: "c1", front: "پرسش", back: "پاسخ", ef: 2.5, intervalDays: 0, repetitions: 0, dueDate: "2026-01-01", lapses: 0, createdAt: 1, ...patch };
}

describe("nextEf فرمول SM-2", () => {
  it("کیفیت ۵ ضریب را زیاد می‌کند و کیفیت پایین کم", () => {
    expect(nextEf(2.5, 5)).toBeCloseTo(2.6);
    expect(nextEf(2.5, 4)).toBeCloseTo(2.5);
    expect(nextEf(2.5, 3)).toBeCloseTo(2.36);
    expect(nextEf(2.5, 1)).toBeLessThan(2);
  });

  it("ضریب هرگز زیر ۱٫۳ نمی‌رود", () => {
    let ef = 2.5;
    for (let i = 0; i < 30; i++) ef = nextEf(ef, 0);
    expect(ef).toBe(SM2_MIN_EF);
  });
});

describe("sm2Next چرخه‌ی استاندارد", () => {
  it("توالی خوب: ۱ روز → ۶ روز → interval × EF", () => {
    let c = card();
    c = sm2Next(c, { quality: 4, today: "2026-01-01" });
    expect(c.intervalDays).toBe(1);
    expect(c.dueDate).toBe("2026-01-02");
    c = sm2Next(c, { quality: 4, today: "2026-01-02" });
    expect(c.intervalDays).toBe(6);
    expect(c.dueDate).toBe("2026-01-08");
    const ef = c.ef;
    c = sm2Next(c, { quality: 4, today: "2026-01-08" });
    expect(c.intervalDays).toBe(Math.round(6 * ef));
  });

  it("«آسون» فاصله را با EF بالاتر زیاد می‌کند", () => {
    let c = card();
    c = sm2Next(c, { quality: 5, today: "2026-01-01" });
    c = sm2Next(c, { quality: 5, today: "2026-01-02" }); // 6 روز
    c = sm2Next(c, { quality: 5, today: "2026-01-08" });
    expect(c.intervalDays).toBeGreaterThanOrEqual(16); // 6 × 2.6 ≈ 15.6
  });

  it("«بلد نبودم» کارت را ریست و لغزش را زیاد می‌کند", () => {
    let c = card();
    c = sm2Next(c, { quality: 4, today: "2026-01-01" });
    c = sm2Next(c, { quality: 4, today: "2026-01-02" });
    const before = c;
    c = sm2Next(c, { quality: 1, today: "2026-01-08" });
    expect(c.repetitions).toBe(0);
    expect(c.intervalDays).toBe(1);
    expect(c.lapses).toBe(before.lapses + 1);
    expect(c.dueDate).toBe("2026-01-09");
  });

  it("«سخت» (q=3) دنباله را نگه می‌دارد ولی EF پایین می‌آید", () => {
    let c = card({ repetitions: 2, intervalDays: 10, ef: 2.5 });
    c = sm2Next(c, { quality: 3, today: "2026-01-01" });
    expect(c.repetitions).toBe(3);
    expect(c.intervalDays).toBe(Math.round(10 * nextEf(2.5, 3)));
  });
});

describe("classifyCards / isDue", () => {
  it("سررسید، عقب‌افتاده و آینده را جدا می‌کند", () => {
    const cards = [card({ id: "a", dueDate: "2026-01-01" }), card({ id: "b", dueDate: "2026-01-02" }), card({ id: "c", dueDate: "2026-01-10" })];
    const g = classifyCards(cards, "2026-01-02");
    expect(g.overdue.map((c) => c.id)).toEqual(["a"]);
    expect(g.due.map((c) => c.id)).toEqual(["b"]);
    expect(g.upcoming.map((c) => c.id)).toEqual(["c"]);
    expect(isDue(cards[1], "2026-01-02")).toBe(true);
    expect(isDue(cards[2], "2026-01-02")).toBe(false);
  });
});
