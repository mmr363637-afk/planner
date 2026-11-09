import { describe, expect, it } from "vitest";
import {
  MAX_KEY_POINTS,
  MAX_POINT_LENGTH,
  analysisForQuestion,
  hasStructuredAnalysis,
  optionAnalysisFor,
  parseQuestionAnalysis,
  pointKey,
  renderAnalysisText,
  teachingPoints,
  toLatinDigits,
} from "../examAnalysis";
import type { BankQuestion } from "../../types";

/** پاسخنامهٔ واقعیِ یک سؤالِ «کلید تأییدشده» — همان الگویی که در ۱۵ هزار سؤالِ بانک هست */
const CONFIRMED = [
  "کلید: گزینهٔ ۳ (هیدروکلروتیازید) ✅",
  "💡 تیازیدها اوریک‌اسید را بالا می‌برند و در نقرس منع نسبی دارند.",
  "💡 نکات کلیدی:",
  "• لوزارتان تنها ARB با اثر اوریکوزوریک است",
  "• دوزِ بالای آسپرین هم اوریک‌اسید را کم می‌کند",
  "✔ هیدروکلروتیازید: با افزایش بازجذب اورات، حملهٔ نقرس را برمی‌انگیزد.",
  "✖ لوزارتان: اثر اوریکوزوریک دارد و در نقرس انتخابِ خوبی است.",
  "✖ ۲ آملودیپین: تأثیری بر اوریک‌اسید ندارد.",
  "📌 نکتهٔ آزمونی: در فشارخون + نقرس، لوزارتان انتخابِ اول است.",
].join("\n");

/** پاسخنامهٔ سؤالی که کلیدش زیر سؤال است — ساختارش فرق دارد و باید همان‌قدر کامل تجزیه شود */
const DOUBTFUL = [
  "⚠️ کلید ذخیره‌شده: گزینهٔ ۱ (پروپرانولول) — اما منابعِ جدید گزینهٔ ۳ را درست می‌دانند.",
  "💡 بتابلاکرِ غیرانتخابی در آسم ممنوع است.",
  "🔍 چرا کلید زیر سؤال است:",
  "• کتابِ ۲۰۲۴ رقیبِ دارویی دیگری را پیشنهاد می‌دهد",
  "✔ طبق منطق علمی: دیلتیازم در آسم ایمن‌تر است.",
  "📌 نکتهٔ آزمونی: آنژین + آسم = کلسیم‌بلوکر.",
  "🚩 یادداشتِ بازبینی: کلیدِ دفترچه با منبعِ درسنامه فرق دارد.",
].join("\n");

const question = (over: Partial<BankQuestion> = {}): BankQuestion => ({
  id: "galb:50",
  examType: "pre_internship",
  year: 1402,
  subject: "داخلی",
  topicId: "internal-cardio",
  topicTitle: "قلب و عروق",
  stem: "قطع کدام دارو در بیمارِ مبتلا به فشارخون و دو حملهٔ نقرس توصیه می‌شود؟",
  options: ["لوزارتان", "آملودیپین", "هیدروکلروتیازید", "بیزوپرولول"],
  correctIndex: 2,
  explanation: CONFIRMED,
  keyPoints: [],
  difficulty: 2,
  ...over,
});

describe("تجزیهٔ پاسخنامهٔ سؤالِ بانک", () => {
  it("کلید، تحلیلِ آموزشی، تحلیلِ گزینه‌ها و نکتهٔ آزمونی را از هم جدا می‌کند", () => {
    const analysis = parseQuestionAnalysis(CONFIRMED, {
      options: question().options,
      correctIndex: 2,
    });

    expect(analysis.keyLine).toContain("گزینهٔ ۳");
    expect(analysis.keyIndex).toBe(2);
    // بدنهٔ 💡 از بولت‌هایش جدا می‌ماند، ولی هیچ‌کدام دور ریخته نمی‌شود
    expect(analysis.insights).toEqual(["تیازیدها اوریک‌اسید را بالا می‌برند و در نقرس منع نسبی دارند."]);
    expect(analysis.tips).toEqual(["نکتهٔ آزمونی: در فشارخون + نقرس، لوزارتان انتخابِ اول است."]);
    expect(analysis.doubts).toEqual([]);
    expect(analysis.reviewNote).toBeUndefined();

    // تحلیلِ هر گزینه به شمارهٔ همان گزینه وصل می‌شود — حتی وقتی نشانِ ✔/✖ شماره ندارد
    // تحلیل‌ها همیشه به ترتیبِ شمارهٔ گزینه می‌آیند تا با ردیف‌های UI هم‌تراز بمانند
    expect(analysis.options.map((o) => o.index)).toEqual([0, 1, 2]);
    expect(optionAnalysisFor(analysis, 2)?.verdict).toBe("correct");
    expect(optionAnalysisFor(analysis, 0)?.verdict).toBe("wrong");
    expect(optionAnalysisFor(analysis, 1)?.verdict).toBe("wrong");
    // برچسبِ تکراریِ خودِ گزینه در متنِ تحلیل نمی‌آید (وگرنه در UI دوبار دیده می‌شد)
    expect(optionAnalysisFor(analysis, 2)?.text).not.toContain("هیدروکلروتیازید:");
    expect(optionAnalysisFor(analysis, 1)?.label).toBeUndefined();
    // اگر تحلیل با صورتِ دیگری از همان گزینه شروع شود، برچسب نگه داشته می‌شود
    const aliased = parseQuestionAnalysis("✔ هیدروکلروتیازیدها: اورات را بازجذب می‌کنند.", {
      options: question().options,
      correctIndex: 2,
    });
    expect(optionAnalysisFor(aliased, 2)?.label).toBe("هیدروکلروتیازیدها");
    // عبارتی که هیچ ربطی به متنِ گزینه ندارد، به‌زور به آن وصل نمی‌شود
    const unrelated = parseQuestionAnalysis("✖ ۲ کلسیم‌بلوکر: تأثیری بر اوریک‌اسید ندارد.", {
      options: question().options,
      correctIndex: 2,
    });
    expect(optionAnalysisFor(unrelated, 1)?.label).toBeUndefined();
    expect(optionAnalysisFor(unrelated, 1)?.text).toContain("کلسیم‌بلوکر");
    // تحلیلِ گزینه‌ها هرگز واردِ نکته‌های آموزشی نمی‌شود
    expect(analysis.keyPoints.some((p) => p.includes("اثر اوریکوزوریک دارد و در نقرس"))).toBe(false);
    expect(analysis.keyPoints).toEqual([
      "تیازیدها اوریک‌اسید را بالا می‌برند و در نقرس منع نسبی دارند.",
      "لوزارتان تنها ARB با اثر اوریکوزوریک است",
      "دوزِ بالای آسپرین هم اوریک‌اسید را کم می‌کند",
      "نکتهٔ آزمونی: در فشارخون + نقرس، لوزارتان انتخابِ اول است.",
    ]);
    expect(hasStructuredAnalysis(analysis)).toBe(true);
  });

  it("ساختارِ کلیدِ مشکوک (⚠️/🔍/🚩) را هم کامل نگه می‌دارد", () => {
    const analysis = parseQuestionAnalysis(DOUBTFUL, {
      options: question().options,
      correctIndex: 0,
      keyUnreliable: true,
    });
    expect(analysis.keyLine).toContain("کلید ذخیره‌شده");
    // بولتِ زیرِ 🔍 هم مثلِ بولتِ 💡 یک نکتهٔ آموزشی است (همان سیاستِ اسکریپتِ ساختِ بانک)
    expect(analysis.keyPoints).toContain("کتابِ ۲۰۲۴ رقیبِ دارویی دیگری را پیشنهاد می‌دهد");
    expect(analysis.reviewNote).toBe("کلیدِ دفترچه با منبعِ درسنامه فرق دارد.");
    expect(analysis.tips).toEqual(["نکتهٔ آزمونی: آنژین + آسم = کلسیم‌بلوکر."]);
    // «✔ طبق منطق علمی» شمارهٔ گزینه ندارد، ولی چون تنها خطِ ✔ است و گزینهٔ کلید
    // هنوز تحلیلی ندارد، به خودِ کلید می‌چسبد (و چون کلید زیر سؤال است، بی‌حکم)
    expect(analysis.options.map((o) => o.index)).toEqual([0]);
    expect(analysis.options[0].verdict).toBe("neutral");
    expect(analysis.options[0].text).toContain("طبق منطق علمی");
    expect(analysis.notes.join(" ")).not.toContain("طبق منطق علمی");
    // وقتی کلید زیر سؤال است، حکمِ گزینه‌ها ساخته نمی‌شود تا گمراه‌کننده نباشد
    expect(analysis.keyPoints).toContain("بتابلاکرِ غیرانتخابی در آسم ممنوع است.");
  });

  it("✔/✖ِ بی‌شماره را با ترتیبِ خطوط به گزینه‌ها وصل می‌کند (برچسبِ فارسی‌نویس)", () => {
    // galb:268 واقعی: گزینه‌ها لاتین‌اند ولی تحلیل با نامِ فارسی‌نویس آمده؛ هیچ
    // تطبیقِ متنی ممکن نیست، پس خطِ ✔ به کلید و ✖ها به‌ترتیب به بقیه می‌چسبند.
    const options = ["Nesiritide", "Furosemide", "Digoxin", "Bisoprolol"];
    const text = [
      "کلید: گزینهٔ ۱ (Nesiritide) ✅",
      "",
      "💡 نکات کلیدی: وازودیلاتورهای داخل وریدی در نارسایی حاد.",
      "✔ نزیریتاید: تنها گزینهٔ وازودیلاتور واقعی لیست.",
      "✖ فورزماید: دیورتیک لوپ است؛ احتقان را خالی می‌کند.",
      "✖ دیگوکسین: اینوتروپ خفیف + کاهش بارورسپتور.",
      "✖ بیزوپرولول: بلوکر β با اثر منفی اینوتروپ.",
      "📌 نکتهٔ آزمونی: در نارسایی حاد با افت فشار، نیتروگلیسیرین.",
    ].join("\n");
    const analysis = parseQuestionAnalysis(text, { options, correctIndex: 0 });
    expect(analysis.options.map((o) => o.index)).toEqual([0, 1, 2, 3]);
    expect(analysis.options[0].verdict).toBe("correct");
    expect(analysis.options[0].text).toContain("تنها گزینهٔ وازودیلاتور");
    expect(analysis.options[3].verdict).toBe("wrong");
    expect(analysis.notes).toEqual([]);
    // تحلیلِ گزینه‌ها زیرِ ردیفِ خودش می‌نشیند، نه در فهرستِ فلش‌کارت
    expect(analysis.keyPoints.some((p) => p.includes("فورزماید"))).toBe(false);
    expect(analysis.keyPoints).toContain("نکتهٔ آزمونی: در نارسایی حاد با افت فشار، نیتروگلیسیرین.");
  });

  it("اگر جای ✖ها معلوم نباشد، فقط ✔ به کلید می‌چسبد و بقیه گم نمی‌شود", () => {
    // galb:145 واقعی: یک ✖ سه گزینه را با هم پوشش می‌دهد، پس حدسِ ترتیب ناامن است
    const options = ["Atenolol", "Metoprolol", "Propranolol", "Labetalol"];
    const text = [
      "کلید: گزینهٔ ۴ ✅",
      "💡 کریز آدرنرژیک: بتابلوکرِ خالص ممنوع.",
      "✔ لابتالول: آلفا+بتا بلاکر؛ تنها گزینهٔ قابل قبول.",
      "✖ اتنولول/متاپرولول/پروپرانولول: بلوکر خالص β و خطر تشدید ایسکمی.",
    ].join("\n");
    const analysis = parseQuestionAnalysis(text, { options, correctIndex: 3 });
    expect(analysis.options.map((o) => o.index)).toEqual([3]);
    expect(analysis.options[0].verdict).toBe("correct");
    // برچسبِ فارسی‌نویس با گزینهٔ لاتین تطبیق نمی‌دهد، پس سرِ متنِ تحلیل می‌ماند
    // (اتفاقاً خوب است: نامِ فارسیِ دارو زیرِ گزینهٔ لاتین دیده می‌شود)
    expect(analysis.options[0].label).toBeUndefined();
    expect(analysis.options[0].text).toContain("لابتالول: آلفا+بتا بلاکر");
    expect(analysis.notes.join(" ")).toContain("بلوکر خالص β");
  });

  it("پاسخنامهٔ بدونِ ساختار را دور نمی‌ریزد و «ساختاردار» حساب نمی‌کند", () => {
    const prose = "در ۲۴ ساعت اول انفارکتوس، آریتمی بطنی شایع‌ترین علت مرگ است.\nپارگی دیواره روز ۳ تا ۵ رخ می‌دهد.";
    const analysis = parseQuestionAnalysis(prose, { options: question().options, correctIndex: 0 });
    expect(analysis.keyPoints.length).toBeGreaterThan(0);
    expect(hasStructuredAnalysis(analysis)).toBe(false);
    expect(analysis.notes.length).toBe(2);
  });

  it("متنِ خالی، نشانِ نیمه و سقفِ طول را امن رد می‌کند", () => {
    expect(parseQuestionAnalysis("", {}).keyPoints).toEqual([]);
    expect(parseQuestionAnalysis(undefined as unknown as string, {}).insights).toEqual([]);
    // انتخابگرِ تغییرِ نوع‌دهنده (VS16) نباید نیمهٔ اولِ ایموجی را بگذارد یا متن را خراب کند
    const withVs = parseQuestionAnalysis("💡\uFE0F نکتهٔ بالینیِ مهم برای مرورِ سریع", {});
    expect(withVs.keyPoints.join("")).not.toContain("\uFFFD");
    expect(withVs.keyPoints.join("")).toContain("نکتهٔ بالینیِ مهم");
    const long = parseQuestionAnalysis(`💡 ${"نکتهٔ بسیار طولانی ".repeat(60)}`, {});
    expect(long.keyPoints[0].length).toBeLessThanOrEqual(MAX_POINT_LENGTH);
  });

  it("بولتِ تکراری یک بار شمرده می‌شود و سقفِ تعدادِ نکته‌ها رعایت می‌شود", () => {
    const dup = ["💡 نکات کلیدی:", "• نکتهٔ تکراریِ آموزشی", "• نکتهٔ تکراریِ آموزشی", "💡 نکتهٔ تکراریِ آموزشی"].join("\n");
    expect(parseQuestionAnalysis(dup, {}).keyPoints).toEqual(["نکتهٔ تکراریِ آموزشی"]);
    const many = Array.from({ length: 30 }, (_, i) => `💡 نکتهٔ آموزشیِ شمارهٔ ${i} برای آزمون`).join("\n");
    expect(parseQuestionAnalysis(many, {}).keyPoints.length).toBeLessThanOrEqual(MAX_KEY_POINTS);
  });

  it("ارقامِ فارسی/عربی را برای تطبیقِ گزینه به لاتین می‌خواند", () => {
    expect(toLatinDigits("گزینهٔ ۳ و ٤ و 4")).toBe("گزینهٔ 3 و 4 و 4");
  });

  it("خروجیِ خوانا برای Anki/اشتراک‌گذاری می‌سازد که تحلیلِ گزینه‌ها زیرِ خودشان است", () => {
    const analysis = parseQuestionAnalysis(CONFIRMED, { options: question().options, correctIndex: 2 });
    const text = renderAnalysisText(analysis, question().options);
    expect(text).toContain("کلید: گزینهٔ ۳");
    expect(text).toContain("💡");
    expect(text).toContain("📌");
    // تحلیلِ هر گزینه در خطِ خودش می‌آید، نه چسبیده به بقیه
    const optionLines = text.split("\n").filter((line) => /^[✔✖]/u.test(line.trim()));
    expect(optionLines).toHaveLength(3);
    for (const line of optionLines) {
      const matches = ["لوزارتان", "آملودیپین", "هیدروکلروتیازید", "بیزوپرولول"].filter((o) => line.includes(o));
      expect(matches.length).toBeLessThanOrEqual(1);
    }
  });

  it("کلیدِ پایدارِ نکته برای جلوگیری از فلش‌کارتِ تکراری", () => {
    const point = "تیازیدها اوریک‌اسید را بالا می‌برند.";
    expect(pointKey("galb:50", point)).toBe(pointKey("galb:50", point));
    // فاصلهٔ اضافی، بزرگیِ حروف و رقمِ فارسی/عربی هویتِ نکته را عوض نمی‌کند
    expect(pointKey("galb:50", point)).toBe(pointKey("galb:50", `  ${point.replace(/ /g, "   ")}  `));
    expect(pointKey("galb:50", point)).toBe(pointKey("galb:50", point.toUpperCase()));
    expect(pointKey("galb:50", "نکتهٔ ۳")).toBe(pointKey("galb:50", "نکتهٔ 3"));
    // سؤالِ دیگر، نکتهٔ دیگر
    expect(pointKey("galb:51", point)).not.toBe(pointKey("galb:50", point));
    expect(pointKey("galb:50", point)).toMatch(/^bkp:/);
  });
});

describe("نکته‌های آموزشیِ یک سؤال (منبعِ حقیقتِ فلش‌کارت)", () => {
  it("وقتی پاسخنامه ساختار دارد، از همان پاسخنامه می‌آید", () => {
    expect(teachingPoints(question())).toEqual(parseQuestionAnalysis(CONFIRMED, { options: question().options, correctIndex: 2 }).keyPoints);
  });

  it("نکته‌های آمادهٔ خودِ داده اولویت دارند و پاسخنامهٔ ساده جایشان را نمی‌گیرد", () => {
    const curated = [
      "شایع‌ترین علت مرگ در ۲۴ ساعت اول MI: آریتمی بطنی.",
      "پارگی دیوارهٔ قلب معمولاً روز ۳ تا ۵ پس از انفارکتوس رخ می‌دهد.",
    ];
    const q = question({
      explanation: "در ۲۴ ساعت اول انفارکتوس، آریتمی‌های بطنی شایع‌ترین علت مرگ هستند.\nپایش قلبی در این بازه حیاتی است.",
      keyPoints: curated,
    });
    // جملهٔ سادهٔ توضیح، نکتهٔ سومِ تکراری نمی‌سازد
    expect(teachingPoints(q)).toEqual(curated);
  });

  it("نکتهٔ ساختاردارِ پاسخنامه که در فهرستِ آماده نیست، اضافه می‌شود (چیزی از قلم نمی‌افتد)", () => {
    const q = question({
      keyPoints: ["تیازیدها اوریک‌اسید را بالا می‌برند و در نقرس منع نسبی دارند."],
    });
    const points = teachingPoints(q);
    expect(points[0]).toBe("تیازیدها اوریک‌اسید را بالا می‌برند و در نقرس منع نسبی دارند.");
    expect(points).toContain("لوزارتان تنها ARB با اثر اوریکوزوریک است");
    expect(points).toContain("نکتهٔ آزمونی: در فشارخون + نقرس، لوزارتان انتخابِ اول است.");
    // تحلیلِ گزینه‌ها هرگز نکتهٔ آموزشی نمی‌شود
    expect(points.some((p) => p.includes("اثر اوریکوزوریک دارد و در نقرس انتخابِ خوبی است"))).toBe(false);
  });

  it("نکتهٔ کوتاه یا غیرمتنی حذف می‌شود و سقفِ تعداد رعایت می‌شود", () => {
    const q = question({
      explanation: "",
      keyPoints: ["کوتاه", "", "   ", 42 as unknown as string, "نکتهٔ معتبر و sufficiently طولانی برای فلش‌کارت"],
    });
    expect(teachingPoints(q)).toEqual(["نکتهٔ معتبر و sufficiently طولانی برای فلش‌کارت"]);
    const many = question({
      explanation: "",
      keyPoints: Array.from({ length: 30 }, (_, i) => `نکتهٔ آموزشیِ شمارهٔ ${i} که به‌اندازهٔ کافی طولانی هست`),
    });
    expect(teachingPoints(many).length).toBeLessThanOrEqual(MAX_KEY_POINTS);
  });

  it("analysisForQuestion کلیدِ ذخیره‌شده و وضعیتِ مشکوکِ سؤال را به تحلیل می‌دهد", () => {
    const analysis = analysisForQuestion(question({ keyStatus: "doubtful", explanation: DOUBTFUL, correctIndex: 0 }));
    expect(analysis.keyIndex).toBe(0);
    expect(analysis.keyPoints).toContain("کتابِ ۲۰۲۴ رقیبِ دارویی دیگری را پیشنهاد می‌دهد");
    // ناسازگاریِ کلیدِ پاسخنامه با کلیدِ ذخیره‌شده قابلِ تشخیص است
    const mismatch = analysisForQuestion(question({ explanation: CONFIRMED, correctIndex: 0 }));
    expect(mismatch.keyIndex).toBe(2);
  });
});
