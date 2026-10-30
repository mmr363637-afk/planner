import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
// @ts-expect-error اسکریپتِ Node بدون تایپ است — توابعِ خالصش را تست می‌کنیم
import { buildShards, jalaliYear, keyPointsFrom, normalizeExportRow, topicIdFor } from "../../../scripts/buildQuestionBank.mjs";
import { normalizeBankQuestion, normalizeManifest, questionShardUrl } from "../examBank";

const exportRow = (over: Record<string, unknown> = {}) => ({
  uid: "galb:50",
  exam: "پره‌انترنی پزشکی",
  course: "کورس قلب",
  topic: "ارزیابی بیمار قلبی عروقی و معاینه فیزیکی",
  year: "خرداد 1402",
  text: "قطع کدام دارو در بیماری با فشارخون و دو حملهٔ نقرس توصیه می‌شود؟",
  options: ["لوزارتان", "آملودیپین", "هیدروکلروتیازید", "بیزوپرولول"],
  correct: 2,
  key_status: "confirmed",
  flashcard:
    "کلید: گزینهٔ ۳ (هیدروکلروتیازید) ✅\n💡 تیازیدها اوریک‌اسید را بالا می‌برند.\n✔ هیدروکلروتیازید در نقرس منع نسبی دارد.\n✖ لوزارتان اثر اوریکوزوریک دارد.",
  references: ["هاریسون، ویرایش ۲۲", "درسنامهٔ قلب — نعمتی‌پور"],
  base: "source",
  ...over,
});

describe("خواندن خروجی بازبینی‌شدهٔ بانک", () => {
  it("سال شمسی را از «ماه ۱۴۰۲» و ارقام فارسی می‌خواند", () => {
    expect(jalaliYear("خرداد 1402")).toBe(1402);
    expect(jalaliYear("اسفند ۱۳۹۷")).toBe(1397);
    expect(jalaliYear("نامشخص")).toBeNull();
    expect(jalaliYear("1200")).toBeNull();
  });

  it("نوع آزمون، درس، مبحث و کلید را درست نگاشت می‌کند", () => {
    const q = normalizeExportRow(exportRow())!;
    expect(q.id).toBe("galb:50");
    expect(q.examType).toBe("pre_internship");
    expect(q.year).toBe(1402);
    expect(q.subject).toBe("قلب");
    expect(q.correctIndex).toBe(2);
    expect(q.topicId).toMatch(/^tp-/);
    expect(q.keyStatus).toBe("confirmed");
    expect(normalizeExportRow(exportRow({ exam: "دستیاری پزشکی" }))!.examType).toBe("residency");
    expect(normalizeExportRow(exportRow({ key_status: "doubtful" }))!.keyStatus).toBe("doubtful");
  });

  it("«کورس قلب» و «دستیاری قلب» یک درس/مبحث می‌شوند تا سؤال دو آزمون کنارِ هم باشد", () => {
    const a = normalizeExportRow(exportRow({ course: "کورس قلب", topic: "آریتمی" }))!;
    const b = normalizeExportRow(exportRow({ uid: "dast:1", course: "دستیاری قلب", topic: "آریتمی", exam: "دستیاری پزشکی" }))!;
    expect(a.subject).toBe(b.subject);
    expect(a.topicId).toBe(b.topicId);
  });

  it("گزینهٔ تکراری حذف نمی‌شود (هشدار می‌گیرد) و فقط ساختارِ غیرقابل‌استفاده رد می‌شود", () => {
    // «هیچ سؤالی حذف نمی‌شود»: گزینهٔ تکراری نگه داشته می‌شود و در گزارش هشدار می‌آید
    const dup = normalizeExportRow(exportRow({ options: ["الف", "الف", "ب", "ج"] }));
    expect(dup).not.toBeNull();
    const built = buildShards([exportRow({ options: ["الف", "الف", "ب", "ج"] })]);
    expect(built.stats.total).toBe(1);
    expect(built.stats.warningCount).toBe(1);
    expect(built.stats.warnings[0].reason).toContain("تکراری");
    // این‌ها واقعاً قابلِ نمایش نیستند
    expect(normalizeExportRow(exportRow({ correct: 9 }))).toBeNull();
    expect(normalizeExportRow(exportRow({ text: "کوتاه" }))).toBeNull();
  });

  it("نکات کلیدی از پاسخنامه استخراج می‌شوند و شناسهٔ مبحث پایدار است", () => {
    expect(keyPointsFrom(exportRow().flashcard)).toEqual([
      "تیازیدها اوریک‌اسید را بالا می‌برند.",
      "هیدروکلروتیازید در نقرس منع نسبی دارد.",
      "لوزارتان اثر اوریکوزوریک دارد.",
    ]);
    // ایموجیِ چندواحدی نباید نیمهٔ خراب در نکته بگذارد
    expect(keyPointsFrom("💡 نکتهٔ مهم بالینی برای مرور").every((p: string) => !p.includes("\uFFFD"))).toBe(true);
    expect(topicIdFor("قلب", "آریتمی")).toBe(topicIdFor("قلب", "آریتمی"));
    expect(topicIdFor("قلب", "آریتمی")).not.toBe(topicIdFor("ریه", "آریتمی"));
  });

  it("کلیدِ نامعتبر هم با برچسب وارد بانک می‌شود (هیچ سؤالی حذف نمی‌شود)", () => {
    const { stats, manifest, shards } = buildShards([
      exportRow(),
      exportRow({ uid: "galb:51" }),
      exportRow({ uid: "galb:52", key_status: "doubtful" }),
      exportRow({ uid: "galb:53", key_status: "incorrect", key_note: "طبق منابع، گزینهٔ ۴ درست است." }),
    ]);
    expect(stats.total).toBe(4);
    expect(stats.rejected).toBe(0);
    expect(stats.incorrectKey).toBe(1);
    expect(stats.doubtfulKey).toBe(1);
    const all = [...shards.values()].flat();
    const bad = all.find((q) => q.id === "galb:53")!;
    expect(bad.keyStatus).toBe("incorrect");
    // کلیدِ ذخیره‌شده دست‌نخورده می‌ماند و یادداشتِ بازبینی در توضیح دیده می‌شود
    expect(bad.correctIndex).toBe(exportRow().correct);
    expect(bad.explanation).toContain("یادداشتِ بازبینی");
    expect(manifest.topics[0].flagged).toBe(2);
    expect(manifest.topics[0].count).toBe(4);
    expect(manifest.sample).toBe(false);
    expect(manifest.version).toMatch(/^c[0-9a-z]+-/);
  });
});

describe("مانیفست فشرده و آدرس شارد", () => {
  it("encoding=gzip را می‌شناسد و آدرس .json.gz می‌سازد", () => {
    const manifest = normalizeManifest({
      version: "c10-ab",
      updatedAt: "2026-10-30T00:00:00Z",
      shardBase: "topics",
      encoding: "gzip",
      topics: [{ topicId: "tp-1", subject: "قلب", topicTitle: "آریتمی", count: 5, byExamType: {}, years: [1402] }],
    })!;
    expect(manifest.encoding).toBe("gzip");
    expect(questionShardUrl("tp-1", manifest)).toMatch(/topics\/tp-1\.json\.gz$/);
    expect(questionShardUrl("tp-1", { shardBase: "topics" })).toMatch(/topics\/tp-1\.json$/);
    // فیلدِ keyStatus در سؤال حفظ می‌شود
    expect(normalizeBankQuestion({ ...normalizeExportRow(exportRow({ key_status: "doubtful" })) })!.keyStatus).toBe("doubtful");
  });
});

describe("بانکِ همراهِ اپ", () => {
  const dir = join(process.cwd(), "public", "qbank");
  const hasBank = existsSync(join(dir, "manifest.json"));

  it.skipIf(!hasBank)("مانیفست معتبر، فشرده و پوششِ کامل دارد", () => {
    const manifest = normalizeManifest(JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")))!;
    expect(manifest.encoding).toBe("gzip");
    expect(manifest.sample).toBe(false);
    const total = manifest.topics.reduce((sum, t) => sum + t.count, 0);
    expect(manifest.topics.length).toBeGreaterThan(300);
    expect(total).toBeGreaterThan(9000);
    expect(new Set(manifest.topics.map((t) => t.topicId)).size).toBe(manifest.topics.length);
    // هر مبحث سال و نوع آزمون دارد
    for (const topic of manifest.topics.slice(0, 20)) {
      expect(topic.years.length).toBeGreaterThan(0);
      expect(Object.keys(topic.byExamType).length).toBeGreaterThan(0);
    }
  });

  it.skipIf(!hasBank)("شاردِ یک مبحث، gzip معتبر و سؤال‌های سالم دارد", () => {
    const manifest = normalizeManifest(JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")))!;
    const topic = [...manifest.topics].sort((a, b) => b.count - a.count)[0];
    const raw = gunzipSync(readFileSync(join(dir, "topics", `${encodeURIComponent(topic.topicId)}.json.gz`))).toString("utf8");
    const payload = JSON.parse(raw);
    expect(payload.topicId).toBe(topic.topicId);
    expect(payload.questions.length).toBe(topic.count);
    const first = normalizeBankQuestion(payload.questions[0])!;
    expect(first.options).toHaveLength(4);
    expect(first.stem.length).toBeGreaterThan(7);
    expect(first.correctIndex).toBeGreaterThanOrEqual(0);
    expect(first.correctIndex).toBeLessThanOrEqual(3);
    expect(first.explanation.length).toBeGreaterThan(0);
    expect(first.keyPoints?.length ?? 0).toBeGreaterThan(0);
  });
});
