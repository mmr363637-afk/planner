import { describe, expect, it } from "vitest";
import { normalizeFa, scoreQuery, tokenize } from "../textSearch";

describe("نرمال‌سازیِ فارسی", () => {
  it("ی/ک عربی، اعراب، نیم‌فاصله و ارقامِ فارسی را یکسان می‌کند", () => {
    expect(normalizeFa("عروقِ كليوي")).toBe("عروق کلیوی");
    expect(normalizeFa("نيم‌فاصله")).toBe("نیم فاصله"); // ي عربی → ی
    expect(normalizeFa("نیم‌فاصله")).toBe("نیم فاصله");
    expect(normalizeFa("۱۲۳")).toBe("123");
    expect(tokenize("  آریتمی‌های بطنی ")).toEqual(["اریتمی", "های", "بطنی"]);
  });
});

describe("امتیازِ جست‌وجو", () => {
  it("تطبیقِ کامل از زیررشته و از بی‌ربط بیشتر امتیاز می‌گیرد", () => {
    const exact = scoreQuery("آئورت", [{ text: "تنگی دریچهٔ آئورت" }]);
    const partial = scoreQuery("آئور", [{ text: "تنگی دریچهٔ آئورت" }]);
    const none = scoreQuery("کلیه", [{ text: "تنگی دریچهٔ آئورت" }]);
    expect(exact).toBeGreaterThan(partial);
    expect(partial).toBeGreaterThan(0);
    expect(none).toBe(0);
  });

  it("غلطِ تایپیِ یک‌حرفی را می‌بخشد («آورت» ↔ «آئورت»)", () => {
    expect(scoreQuery("آورت", [{ text: "تنگی دریچهٔ آئورت" }])).toBeGreaterThan(0);
  });

  it("چندواژه‌ای است: یک واژهٔ بی‌ربط کلِ نتیجه را رد می‌کند", () => {
    expect(scoreQuery("تنگی آئورت", [{ text: "تنگی دریچهٔ آئورت" }])).toBeGreaterThan(0);
    expect(scoreQuery("تنگی کلیه", [{ text: "تنگی دریچهٔ آئورت" }])).toBe(0);
  });

  it("وزنِ فیلد اثر دارد: عنوان از نامِ فایل مهم‌تر است", () => {
    const query = "قلب";
    const titleHit = scoreQuery(query, [{ text: "قلب و عروق", weight: 1.25 }, { text: "" , weight: 0.6 }]);
    const sourceHit = scoreQuery(query, [{ text: "", weight: 1.25 }, { text: "قلب و عروق", weight: 0.6 }]);
    expect(titleHit).toBeGreaterThan(sourceHit);
  });

  it("عبارتِ کوتاه فقط از ابتدای واژه تطبیق می‌گیرد تا فهرست شلوغ نشود", () => {
    expect(scoreQuery("قل", [{ text: "قلب و عروق" }])).toBeGreaterThan(0);
    expect(scoreQuery("لب", [{ text: "قلب و عروق" }])).toBe(0);
  });
});
