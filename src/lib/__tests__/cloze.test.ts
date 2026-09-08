import { describe, expect, it } from "vitest";
import { hasCloze, maskCloze, parseBulkCards, revealCloze } from "../cloze";

describe("کلز (جاخالی)", () => {
  it("hasCloze فقط الگوی {{…}}ِ محتوادار را قبول می‌کند", () => {
    expect(hasCloze("سر {{قلب}} می‌تپد")).toBe(true);
    expect(hasCloze("متن عادی")).toBe(false);
    expect(hasCloze("شهر {{}} تهران")).toBe(false);
    expect(hasCloze("{ {قلب} }")).toBe(false);
    // الگوی تودرتو از دید موتور، جفتِ داخلی است و پنهان‌سازی همان را می‌گیرد
    expect(hasCloze("{{یک {{دو}} سه}}")).toBe(true);
    expect(maskCloze("{{یک {{دو}} سه}}")).toBe("{{یک […] سه}}");
  });

  it("maskCloze پشت الگو را می‌پوشاند و revealCloze فقط دست‌کک‌ها را برمی‌دارد", () => {
    const front = "بزرگ‌ترین رگِ بدن {{آئورت}} و کوچک‌ترین آن {{مویرگ‌ها}} هستند.";
    expect(maskCloze(front)).toBe("بزرگ‌ترین رگِ بدن […] و کوچک‌ترین آن […] هستند.");
    expect(revealCloze(front)).toBe("بزرگ‌ترین رگِ بدن آئورت و کوچک‌ترین آن مویرگ‌ها هستند.");
    expect(maskCloze("معمولی")).toBe("معمولی");
    expect(revealCloze("معمولی")).toBe("معمولی");
  });
});

describe("ورود گروهی فلش‌کارت", () => {
  it("جدا کننده‌ها به ترتیب اولویت: تب، «؛»، «;»، «|»", () => {
    const text = "قلب\tعضوی از بدن\nسر؛ بخشی از بدن\nریه; اندام تنفس\nپا|ارگان حرکت\nسطرِ تنها\nکتاب، محصول چاپی";
    const r = parseBulkCards(text);
    expect(r.cards).toHaveLength(4);
    expect(r.skipped).toBe(2); // سطرِ بدون جداکننده + سطر با کامای معمولی
    expect(r.cards[0]).toEqual({ front: "قلب", back: "عضوی از بدن", line: 1 });
    expect(r.cards[1].front).toBe("سر");
    expect(r.cards[3].back).toBe("ارگان حرکت");
  });

  it("خط خالی رد می‌شود (بدون ثبت در شمار خطا) و سطر ناقص شمرده می‌شود", () => {
    const r = parseBulkCards("این چیست؟\n\nپاسخ\tچیزی\n\tفقط پاسخ\n");
    expect(r.cards).toHaveLength(1);
    expect(r.skipped).toBe(2); // ناقص + روِ خالی
  });

  it("وقتی هم تب هم نقطه‌ویرگول هست، تب پیروز است و بقیه‌ی خط پشت کارت می‌شود", () => {
    const r = parseBulkCards("فرمولِ a;b\tx = 1; y = 2");
    expect(r.cards[0].front).toBe("فرمولِ a;b");
    expect(r.cards[0].back).toBe("x = 1; y = 2");
  });

  it("بیش از یک جداکننده، ستون‌های بعدی دوباره با «؛» به هم می‌چسبند", () => {
    const r = parseBulkCards("قلب\tعضو\tماهیچه‌ای");
    expect(r.cards[0].front).toBe("قلب");
    expect(r.cards[0].back).toBe("عضو؛ ماهیچه‌ای");
  });

  it("کوتیشنِ دور ستون‌ها (سبک CSV) برداشته می‌شود", () => {
    const r = parseBulkCards('"قلبِ قرقره‌ای"\t"پمپ ""خون"" دوار"');
    expect(r.cards[0].front).toBe("قلبِ قرقره‌ای");
    expect(r.cards[0].back).toBe('پمپ "خون" دوار');
  });

  it("خطِ سرستونِ آشکار فقط در سطرِ اول نادیده گرفته می‌شود؛ تکرارِ آن در سطرهای بعد کارت می‌شود", () => {
    const withoutHeader = parseBulkCards("سوال\tجواب\nقلب\tعضو");
    expect(withoutHeader.cards.map((c) => c.front)).toEqual(["قلب"]);
    expect(withoutHeader.skipped).toBe(0); // سرستون، «خطا» حساب نمی‌شود

    const repeated = parseBulkCards("سوال\tجواب\nقلب\tعضو\nfront\tback");
    expect(repeated.cards).toHaveLength(2);
    expect(repeated.cards.map((c) => c.front)).toEqual(["قلب", "front"]); // front/back فقط سطرِ صفر ویژه است

    // صرف نظر از شکلِ جداکننده، variant سرستون‌ها سطر اول پوشانده می‌شوند
    expect(parseBulkCards("front;back\nقلب\tعضو").cards.map((c) => c.front)).toEqual(["قلب"]);
    expect(parseBulkCards("سؤال; جواب\nقلب\tعضو").cards.map((c) => c.front)).toEqual(["قلب"]);
    // این‌ها سرستون نیستند
    expect(parseBulkCards("روز\tجمعه").cards[0].front).toBe("روز");
  });

  it("شماره‌ی سطرها برای گزارش خطا صحیح است", () => {
    const r = parseBulkCards("کارت۱\tالف\n\nکارت۲؛ب");
    expect(r.cards[0].line).toBe(1);
    expect(r.cards[1].line).toBe(3);
  });
});
