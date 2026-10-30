import { describe, expect, it } from "vitest";
// @ts-expect-error اسکریپتِ Node بدون تایپ است — فقط توابعِ خالصش را تست می‌کنیم
import { buildShards, normalizeRow, parseCsv, slugify } from "../../../scripts/buildQuestionBank.mjs";

const row = (over: Record<string, unknown> = {}) => ({
  id: "q1",
  examType: "pre_internship",
  year: 1402,
  subject: "داخلی",
  topicId: "قلب",
  topicTitle: "قلب",
  stem: "شایع‌ترین علت نارسایی قلبی در ایران چیست؟",
  options: ["بیماری عروق کرونر", "بیماری مادرزادی", "کاردیومیوپاتی", "آمیلوئیدوز"],
  correctIndex: 0,
  explanation: "بیماری عروق کرونر شایع‌ترین علت است.",
  keyPoints: ["بیماری عروق کرونر شایع‌ترین علت نارسایی قلبی است"],
  ...over,
});

describe("ساخت بانک سؤال", () => {
  it("سؤال سالم را می‌پذیرد و شارد و مانیفست درست می‌سازد", () => {
    const { manifest, shards, stats } = buildShards([row(), row({ id: "q2", year: 1403, examType: "residency", options: ["الف", "ب", "ج", "د"] })]);
    expect(stats.total).toBe(2);
    expect(stats.rejected).toBe(0);
    expect(manifest.topics).toHaveLength(1);
    expect(manifest.topics[0].count).toBe(2);
    expect(manifest.topics[0].byExamType).toEqual({ pre_internship: 1, residency: 1 });
    expect(manifest.topics[0].years).toEqual([1403, 1402]);
    expect(shards.get("قلب")).toHaveLength(2);
    expect(manifest.sample).toBe(false);
  });

  it("سؤال ناقص/تکراری/خارج از بازه را رد می‌کند و بقیه را نگه می‌دارد", () => {
    const { stats, shards } = buildShards([
      row(),
      row(), // تکراری
      row({ id: "q3", year: 1200 }),
      row({ id: "q4", options: ["الف", "الف", "ب", "ج"] }),
      row({ id: "q5", correctIndex: 7 }),
      row({ id: "q6", stem: "کوتاه" }),
      row({ id: "q7", examType: "other" }),
    ]);
    expect(stats.total).toBe(1);
    expect(stats.rejected).toBe(6);
    expect(stats.errors[0].reason).toContain("تکراری");
    expect(shards.size).toBe(1);
  });

  it("شناسهٔ مبحث را از عنوان می‌سازد و سال شمسی با رقم فارسی را می‌خواند", () => {
    const q = normalizeRow(row({ topicId: undefined, year: "۱۴۰۱" }));
    expect(q.topicId).toBe("قلب");
    expect(q.year).toBe(1401);
    expect(q.difficulty).toBe(2);
    expect(slugify("بیماری‌های قلب و عروق")).toBe("بیماری-های-قلب-و-عروق");
  });

  it("CSV با کوتیشن و کامای داخل فیلد را درست می‌خواند", () => {
    const rows = parseCsv('id,stem,options\nq1,"سؤال، با کاما","الف,ب"\n');
    expect(rows).toHaveLength(1);
    expect(rows[0].stem).toBe("سؤال، با کاما");
    expect(rows[0].options).toBe("الف,ب");
  });

  it("گزینه‌ها باید چهارتایی و بدون تکرار باشند", () => {
    expect(normalizeRow(row({ options: ["۱", "۲", "۳"] }))).toBeNull();
    expect(normalizeRow(row({ options: ["الف", "الف", "ب", "ج"] }))).toBeNull();
  });

  it("کلیدهای خارج از چهارگزینه حذف می‌شوند", () => {
    const q = normalizeRow(row({ keyPoints: ["نکتهٔ بسیار مهم بالینی", "کوتاه"] }));
    expect(q.keyPoints).toEqual(["نکتهٔ بسیار مهم بالینی"]);
  });
});
