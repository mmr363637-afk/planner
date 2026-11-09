import { readdirSync, readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeBankQuestion, normalizeManifest } from "../examBank";
import { analysisForQuestion, optionAnalysisFor, parseQuestionAnalysis, teachingPoints } from "../examAnalysis";
import type { BankManifest, BankQuestion } from "../../types";

/**
 * نگهبانِ «محتوای واقعیِ بانکِ ساخته‌شده».
 *
 * تست‌های دیگر روی نمونهٔ کوچک کار می‌کنند؛ این تست همان فایلی را می‌خواند که کاربر
 * دانلود می‌کند (`public/qbank`) و با همان کدِ سمتِ اپ (`normalizeBankQuestion` +
 * `analysisForQuestion`) می‌سنجد. دو فاجعهٔ واقعی با همین‌جا گرفته شدند:
 *
 *   ۱) پاسخنامه‌ها یک‌خطی ذخیره شده بودند (همهٔ «\n»ها در ساخت از بین رفته بود)؛ در
 *      نتیجه تحلیلِ هیچ گزینه‌ای به گزینهٔ خودش وصل نمی‌شد و کلِ پاسخنامه یک تکهٔ
 *      به‌هم‌چسبیده نمایش داده می‌شد — ۰ از ۱۷٬۹۳۶ سؤال تحلیلِ گزینه داشت.
 *   ۲) ۸٬۱۵۳ «بولتِ گزینه‌محور» (• ۱ MIBG Scan: …) به‌عنوان نکتهٔ آموزشی ذخیره شده
 *      بودند؛ یعنی هم زیرِ گزینه تکرار می‌شدند و هم فلش‌کارتِ بی‌معنی می‌ساختند.
 */

const QBANK = "public/qbank";
const hasBank = existsSync(join(QBANK, "manifest.json"));

interface Shard {
  topicId: string;
  version: string;
  questions: unknown[];
}

function readShards(): { manifest: BankManifest; raw: unknown[]; questions: BankQuestion[] } {
  const manifestRaw = JSON.parse(readFileSync(join(QBANK, "manifest.json"), "utf8")) as BankManifest;
  const manifest = normalizeManifest(manifestRaw)!;
  const dir = join(QBANK, manifest.shardBase || "topics");
  const files = readdirSync(dir).filter((f) => f.endsWith(manifest.encoding === "gzip" ? ".json.gz" : ".json"));
  const raw: unknown[] = [];
  for (const file of files) {
    const buffer = readFileSync(join(dir, file));
    const text = manifest.encoding === "gzip" ? gunzipSync(buffer).toString("utf8") : buffer.toString("utf8");
    const shard = JSON.parse(text) as Shard;
    raw.push(...shard.questions);
  }
  const questions = raw.map((row) => normalizeBankQuestion(row)).filter((q): q is BankQuestion => q !== null);
  return { manifest, raw, questions };
}

const bank = hasBank ? readShards() : null;
const questions = bank?.questions ?? [];

describe("بانکِ ساخته‌شده — مانیفست و پوشش", { timeout: 120_000 }, () => {
  it.skipIf(!bank)("مانیفست معتبر است و شمارشِ مبحث‌ها با سؤال‌های واقعی می‌خواند", () => {
    const m = bank!.manifest;
    expect(m.version).toMatch(/^c[0-9a-z]+-[0-9a-z]+$/);
    expect(m.sample).toBe(false);
    expect(m.topics.length).toBeGreaterThan(500);
    expect(m.topics.reduce((a, t) => a + t.count, 0)).toBe(questions.length);
    // هر مبحثِ مانیفست شاردِ خودش را دارد
    const dir = join(QBANK, m.shardBase || "topics");
    const files = new Set(readdirSync(dir));
    for (const topic of m.topics) {
      expect(files.has(`${topic.topicId}${m.encoding === "gzip" ? ".json.gz" : ".json"}`)).toBe(true);
    }
  });

  it.skipIf(!bank)("هیچ سؤالی در بارگذاری بی‌صدا حذف نمی‌شود", () => {
    // قاعدهٔ «سؤالِ با دادهٔ قابل‌نمایش حذف نشود»: تعدادِ خام = تعدادِ سالم
    expect(bank!.raw.length).toBe(questions.length);
    expect(questions.length).toBeGreaterThan(15_000);
    // شناسهٔ تکراری یعنی دو سؤال روی هم می‌افتند (نشانه/سابقهٔ پاسخ گم می‌شود)
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
  });

  it.skipIf(!bank)("سال، نوع آزمون و کلید هر سؤال در بازهٔ معتبر است", () => {
    for (const q of questions) {
      expect(q.year).toBeGreaterThanOrEqual(1390);
      expect(q.year).toBeLessThanOrEqual(1500);
      expect(["pre_internship", "residency"]).toContain(q.examType);
      expect([0, 1, 2, 3]).toContain(q.correctIndex);
      expect(q.options).toHaveLength(4);
      expect(q.options.every((o) => o.length > 0)).toBe(true);
      expect(q.stem.length).toBeGreaterThanOrEqual(8);
      expect(q.topicId).toMatch(/^tp-[0-9a-z]+$/);
    }
  });
});

describe("بانکِ ساخته‌شده — ساختارِ پاسخنامه", { timeout: 120_000 }, () => {
  it.skipIf(!bank)("پاسخنامه خط‌به‌خط نگه داشته می‌شود (نه یک تکهٔ ادغام‌شده)", () => {
    // پاسخنامهٔ بانک با نشان‌ها خط‌به‌خط نوشته شده؛ اگر ساختارِ خط برود، تحلیلِ گزینه‌ها
    // هرگز به گزینهٔ خودش نمی‌رسد. میانگینِ واقعیِ داده ~۷ خط است.
    const multiline = questions.filter((q) => q.explanation.includes("\n")).length;
    expect(multiline / questions.length).toBeGreaterThan(0.99);
    // نشانه‌های اصلی هم سرِ خط می‌آیند، نه وسطِ یک خطِ طولانی
    const markerAtLineStart = questions.filter((q) => /^(کلید:|⚠|💡|📌|✔|✖|•)/mu.test(q.explanation)).length;
    expect(markerAtLineStart / questions.length).toBeGreaterThan(0.99);
  });

  it.skipIf(!bank)("تحلیلِ گزینه‌ها به شمارهٔ همان گزینه وصل می‌شود", () => {
    let withOptionAnalysis = 0;
    let optionRows = 0;
    let keyMismatch = 0;
    for (const q of questions) {
      const analysis = analysisForQuestion(q);
      const attached = [0, 1, 2, 3].filter((i) => optionAnalysisFor(analysis, i));
      if (attached.length > 0) withOptionAnalysis += 1;
      optionRows += attached.length;
      // کلیدِ اعلام‌شده در پاسخنامه نباید با کلیدِ ذخیره‌شده بخورد (اگر خورد، UI هشدار می‌دهد)
      if (analysis.keyIndex != null && analysis.keyIndex !== q.correctIndex) keyMismatch += 1;
    }
    // تقریباً همهٔ سؤال‌ها تحلیلِ گزینه‌محور دارند؛ استثناهای انگشت‌شمار سؤالی‌اند که
    // برچسبِ تحلیلشان نه شماره دارد نه با متنِ گزینه می‌خواند («✖ واریاسیون نرمال» برای
    // گزینهٔ «یک واریاسیون نرمال است») — آن‌ها در بدنهٔ پاسخنامه دست‌نخورده می‌مانند.
    expect(withOptionAnalysis / questions.length).toBeGreaterThan(0.995);
    // میانگینِ ~۴ ردیف یعنی هر گزینه تحلیلِ خودش را دارد
    expect(optionRows / questions.length).toBeGreaterThan(3.9);
    expect(keyMismatch).toBe(0);
  });

  it.skipIf(!bank)("هیچ سؤالی بدونِ پاسخنامه نیست", () => {
    expect(questions.filter((q) => q.explanation.trim().length > 0).length).toBe(questions.length);
  });
});

describe("بانکِ ساخته‌شده — نکته‌های آموزشی (فلش‌کارت)", { timeout: 120_000 }, () => {
  it.skipIf(!bank)("هر سؤال دستِ‌کم یک نکتهٔ آموزشی دارد", () => {
    const empty = questions.filter((q) => teachingPoints(q).length === 0);
    expect(empty).toEqual([]);
    const total = questions.reduce((a, q) => a + teachingPoints(q).length, 0);
    expect(total).toBeGreaterThan(30_000);
    // سقفِ مرورپذیری: هیچ سؤالی بیش از ۱۲ نکته ندارد
    expect(Math.max(...questions.map((q) => teachingPoints(q).length))).toBeLessThanOrEqual(12);
  });

  it.skipIf(!bank)("بولتِ گزینه‌محور به‌عنوان نکتهٔ آموزشی ذخیره نشده باشد", () => {
    // «📌 ۱ MIBG Scan: …» بیرون از آن سؤال معنی ندارد و زیرِ گزینه هم تکرار می‌شود.
    // معیارِ مستقل از اسکریپتِ ساخت: نکته با شمارهٔ گزینه شروع شود و ادامهٔ متنش با
    // خودِ همان گزینه یکی باشد. (نکتهٔ شماره‌دارِ واقعی مثل «۲ نکته: طبیعیِ DLCO…»
    // این شرط را ندارد و باید بماند.)
    const norm = (v: string) =>
      v
        .toLowerCase()
        .replace(/[\uFE0F\uFEFF\u200E\u200F\u200c\u200d]/g, "")
        .replace(/[«»"'“”()\[\]{}؟?!.،,;:ـ\-–—•·\s]/g, "");
    const leaked: string[] = [];
    for (const q of questions) {
      for (const point of teachingPoints(q)) {
        const lead = point.trim()[0] ?? "";
        const n = /[0-9]/.test(lead) ? Number(lead) : "۰۱۲۳۴۵۶۷۸۹".indexOf(lead);
        if (n < 1 || n > 4) continue;
        const rest = point
          .trim()
          .replace(/^[0-9۰-۹٠-٩]\s*[).،,:ـ]?\s*/u, "")
          .replace(/^\([^)]*\)\s*/u, "");
        const option = q.options[n - 1];
        if (!option) continue;
        const head = norm(option).slice(0, Math.min(8, norm(option).length));
        if (head.length >= 4 && norm(rest).startsWith(head)) leaked.push(`${q.id}: ${point.slice(0, 80)}`);
      }
    }
    expect(leaked.slice(0, 10)).toEqual([]);
  });

  it.skipIf(!bank)("نکتهٔ آموزشی، کپیِ کاملِ متنِ گزینه یا صورتِ سؤال نیست", () => {
    const duplicates: string[] = [];
    for (const q of questions) {
      const stem = q.stem.replace(/\s+/g, " ").trim().toLowerCase();
      for (const point of teachingPoints(q)) {
        const p = point.replace(/\s+/g, " ").trim().toLowerCase();
        if (p === stem || q.options.some((o) => o.replace(/\s+/g, " ").trim().toLowerCase() === p)) {
          duplicates.push(`${q.id}: ${point.slice(0, 60)}`);
        }
      }
    }
    expect(duplicates.slice(0, 10)).toEqual([]);
  });

  it.skipIf(!bank)("نکته‌ها کوتاهِ قابل‌مرور می‌مانند و نیمهٔ ایموجی ندارند", () => {
    for (const q of questions) {
      for (const point of teachingPoints(q)) {
        expect(point.length).toBeGreaterThanOrEqual(8);
        expect(point.length).toBeLessThanOrEqual(400);
        expect(point.includes("\uFFFD")).toBe(false);
        // نکتهٔ چندخطی در فلش‌کارت خوانا نیست
        expect(point.includes("\n")).toBe(false);
      }
    }
  });
});

describe("بانکِ ساخته‌شده — سؤال‌های ساختاراً متفاوت (نمونه‌گیریِ هدفمند)", { timeout: 120_000 }, () => {
  it.skipIf(!bank)("سؤالِ کلیدِ مشکوک/نامعتبر برچسب و یادداشتِ بازبینی دارد", () => {
    const doubtful = questions.filter((q) => q.keyStatus === "doubtful");
    const incorrect = questions.filter((q) => q.keyStatus === "incorrect");
    expect(doubtful.length).toBeGreaterThan(1000);
    expect(incorrect.length).toBeGreaterThan(300);
    // کلیدِ ذخیره‌شده دست‌نخورده می‌ماند و دلیلِ هشدار در پاسخنامه هست
    for (const q of [...doubtful.slice(0, 200), ...incorrect.slice(0, 200)]) {
      expect([0, 1, 2, 3]).toContain(q.correctIndex);
      expect(q.explanation.length).toBeGreaterThan(20);
    }
    const withReviewNote = incorrect.filter((q) => q.explanation.includes("🚩")).length;
    expect(withReviewNote).toBeGreaterThan(0);
  });

  it.skipIf(!bank)("سؤالِ گزینهٔ تکراری حذف نشده و در تحلیل هم می‌شود دید", () => {
    const dup = questions.filter((q) => new Set(q.options.map((o) => o.trim().toLowerCase())).size !== q.options.length);
    expect(dup.length).toBeGreaterThan(0);
    for (const q of dup) {
      expect(q.options).toHaveLength(4);
      expect(teachingPoints(q).length).toBeGreaterThan(0);
    }
  });

  it.skipIf(!bank)("طولانی‌ترین سؤال‌ها (متن/گزینه/پاسخنامهٔ بلند) سالم رندر می‌شوند", () => {
    const longestStem = [...questions].sort((a, b) => b.stem.length - a.stem.length)[0];
    const longestOption = [...questions].sort((a, b) => Math.max(...b.options.map((o) => o.length)) - Math.max(...a.options.map((o) => o.length)))[0];
    const longestExplanation = [...questions].sort((a, b) => b.explanation.length - a.explanation.length)[0];
    expect(longestStem.stem.length).toBeGreaterThan(400);
    expect(longestStem.stem.length).toBeLessThanOrEqual(1600);
    expect(longestOption.options.every((o) => o.length > 0 && o.length <= 400)).toBe(true);
    expect(longestExplanation.explanation.length).toBeLessThanOrEqual(12_000);
    // حتی طولانی‌ترین‌ها هم نکتهٔ آموزشی و تحلیلِ گزینه دارند
    for (const q of [longestStem, longestOption, longestExplanation]) {
      expect(teachingPoints(q).length).toBeGreaterThan(0);
      expect(parseQuestionAnalysis(q.explanation, { options: q.options, correctIndex: q.correctIndex }).keyLine).toBeTruthy();
    }
  });

  it.skipIf(!bank)("سؤال با اصطلاحِ لاتین/عدد، شمارهٔ گزینهٔ تحلیلش گم نمی‌شود", () => {
    const latin = questions.filter((q) => /[A-Za-z]{4,}/.test(q.explanation) && /\d/.test(q.explanation));
    expect(latin.length).toBeGreaterThan(1000);
    let attached = 0;
    for (const q of latin.slice(0, 2000)) {
      const analysis = analysisForQuestion(q);
      if ([0, 1, 2, 3].some((i) => optionAnalysisFor(analysis, i))) attached += 1;
    }
    expect(attached / Math.min(2000, latin.length)).toBeGreaterThan(0.95);
  });
});
