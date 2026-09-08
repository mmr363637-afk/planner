import { describe, expect, it } from "vitest";
import { fuzzyScore, normalizeText, searchItems } from "../search";

interface Item {
  id: string;
  title: string;
  subtitle?: string;
  keywords?: string[];
}

const item = (id: string, title: string, extra?: Partial<Item>): Item => ({ id, title, ...extra });

describe("نرمال‌سازی متن فارسی/عربی", () => {
  it("حروفِ معادل و اعراب و نیم‌فاصله یکی می‌شوند", () => {
    expect(normalizeText("كی كه آمَد")).toBe("کی که امد");
    expect(normalizeText("كتاب")).toBe("کتاب");
    expect(normalizeText("كتاب‌ها")).toBe("کتاب ها"); // نیم‌فاصله → فاصله
    expect(normalizeText("بندرأبّاس")).toBe("بندراباس");
    // trim فقط دو سرِ رشته را می‌گیرد؛ فاصله‌های تودرتو حفظ می‌شوند
    expect(normalizeText("  فضا‌ی  مُمیز  ")).toBe("فضا ی  ممیز");
    expect(normalizeText("آب")).toBe("اب");
  });
});

describe("fuzzyScore", () => {
  it("بدون تطابق null است و تطابقِ ابتدای متن بالاترین امتیاز را دارد", () => {
    expect(fuzzyScore("qqq", "قلب")).toBeNull();
    expect(fuzzyScore("ش", "شیمی")).toBeGreaterThan(fuzzyScore("ش", "کش")!);
    expect(fuzzyScore("", "هر چیزی")).toBe(0);
  });

  it("کوتاهیِ متن و تطابقِ ابتدای کلمه جایزه دارند", () => {
    const a = fuzzyScore("شیمی", "شیمی")!; // برابری کامل
    const b = fuzzyScore("شیمی", "شیمی آلی")!; // ابتدای متن ولی طولانی‌تر
    expect(a).toBeGreaterThan(b);
  });
});

describe("جستجوی سراسری (searchItems)", () => {
  it("پرس‌و‌جوی خالی، آغازِ فهرست را با همان ترتیب برمی‌گرداند", () => {
    const items = [item("a", "قلب"), item("b", "ریه")];
    expect(searchItems(items, "   ").map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("مقایسه‌ی دقیقِ عنوان بهتر از تطبیقِ ناقص است", () => {
    const items = [item("x", "شیمی آلی"), item("y", "شیمی")];
    const out = searchItems(items, "شیمی");
    expect(out[0].id).toBe("y");
    expect(out.map((x) => x.id)).toContain("x");
  });

  it("کاراکترهای پراکنده (فازی) هم تطبیق می‌کنند ولی تطابقِ متوالی قوی‌تر است", () => {
    const items = [item("a", "فیزیولوژی سیستمیک"), item("b", "فیلم"), item("c", "فلسفه")];
    const out = searchItems(items, "فس");
    expect(out[0].id).toBe("c");
    expect(out.map((x) => x.id)).toContain("a");
    expect(out.map((x) => x.id)).not.toContain("b");
  });

  it("کلیدواژه‌ها هم جست‌وجو می‌شوند (ولی کمی ضعیف‌تر از عنوان)؛ زیرنویس جست‌وجو نمی‌شود", () => {
    const items = [item("a", "کنکور", { keywords: ["آزمون سراسری"] }), item("b", "آزمون کلاسی")];
    const out = searchItems(items, "آزمون");
    expect(out.map((x) => x.id)).toEqual(expect.arrayContaining(["a", "b"]));
    expect(out[0].id).toBe("b"); // تطابق عنوان جلوتر از کلیدواژه است
    // زیرنویس فقط نمایشی است و در امتیاز دخالت ندارد
    const withSub = [item("c", "ریاضی گسسته", { subtitle: "ترم اول" })];
    expect(searchItems(withSub, "ترم")).toHaveLength(0);
  });

  it("نتیجه‌ها سقف دارند و پرس‌و‌جوی بی‌معنی ته است", () => {
    const items = Array.from({ length: 40 }, (_, i) => item(`i${i}`, `کارت ${i}`));
    expect(searchItems(items, "کارت")).toHaveLength(20);
    expect(searchItems(items, "کارت", 5)).toHaveLength(5);
    expect(searchItems(items, "zzzz")).toHaveLength(0);
  });

  it("پرس‌و‌جوی چندکلمه‌ای با معیارِ زیردنباله در هر دو مورد تطبیق می‌کند", () => {
    const items = [item("a", "شیمی آلی فصل سوم"), item("b", "شیمی فصل سوم"), item("c", "زیست فصل دوم")];
    const out = searchItems(items, "شیمی سوم");
    expect(out.map((x) => x.id)).toEqual(expect.arrayContaining(["a", "b"]));
    expect(out.map((x) => x.id)).not.toContain("c");
    expect(out[0].id).toBe("b"); // متنِ کوتاه‌ترِ نزدیک‌ترِ به پرسه، جلوتر است
  });
});
