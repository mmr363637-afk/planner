// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AI_CARD_COUNT_DEFAULT,
  AI_CARD_COUNT_MAX,
  AI_CARD_COUNT_MIN,
  buildCardPrompt,
  normalizeCardCount,
  parseCardCountInput,
} from "../ai";
import { AI_PROVIDER_PRESETS, aiProviderPreset, isKeylessBaseUrl } from "../aiProviders";

// ===== 🆓 «بدونِ کلید» + 🃏 تعداد کارتِ دستی =====
// درخواست کاربر: «کلید API را هم برای رایگان‌ها پیدا کن؛ اگر پیدا نمی‌شود حذفش کن»
// و «تعداد فلش‌کارت دستی وارد شود، بین سه گزینه نباشد».

describe("قالب‌های آمادهٔ سرویس‌های رایگان", () => {
  it("همه با قراردادِ فعلیِ اپ جورند: baseUrl معتبر + مدل غیرخالی", () => {
    expect(AI_PROVIDER_PRESETS.length).toBeGreaterThanOrEqual(3);
    for (const p of AI_PROVIDER_PRESETS) {
      expect(p.baseUrl.endsWith("/"), `${p.id} اسلش آخر`).toBe(false);
      expect(p.baseUrl).toMatch(/^https?:\/\//);
      expect(p.model.trim().length, `${p.id} مدل`).toBeGreaterThan(0);
      expect(p.label.trim()).not.toBe("");
      expect(p.quota.trim()).not.toBe("");
    }
  });

  it("شناسه‌ها یکتا و بدون تکرارند و آدرس‌ها تکراری نیستند", () => {
    const ids = AI_PROVIDER_PRESETS.map((p) => p.id);
    const urls = AI_PROVIDER_PRESETS.map((p) => p.baseUrl);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("همهٔ قالب‌ها «بدونِ کلید»اند — کاربر نباید برای کلید جایی برود", () => {
    expect(AI_PROVIDER_PRESETS.every((p) => p.keyless)).toBe(true);
    // و هیچ قالبِ کلیدداری نمانده که کاربر را دنبالِ کلید بفرستد
    expect(AI_PROVIDER_PRESETS.filter((p) => !p.keyless)).toEqual([]);
  });

  it("درگاه‌های بدونِ کلید همان آدرس‌های مستندشدهٔ سازگار با OpenAI‌اند", () => {
    expect(aiProviderPreset("pollinations")?.baseUrl).toBe("https://text.pollinations.ai/openai");
    // نامِ مدل باید همان باشد که درگاه در /v1/models اعلام می‌کند
    expect(aiProviderPreset("pollinations")?.model).toBe("openai-fast");
    expect(aiProviderPreset("ovh")?.baseUrl).toBe("https://oai.endpoints.kepler.ai.cloud.ovh.net/v1");
    expect(aiProviderPreset("ovh")?.model).toBe("gpt-oss-20b");
    // فقط Ollama قرار است http (لوکال) باشد
    const httpOnes = AI_PROVIDER_PRESETS.filter((p) => p.baseUrl.startsWith("http://")).map((p) => p.id);
    expect(httpOnes).toEqual(["ollama"]);
    expect(aiProviderPreset("nope")).toBeNull();
    expect(aiProviderPreset(undefined)).toBeNull();
  });

  it("isKeylessBaseUrl آدرس‌های قالب‌های بدونِ کلید را می‌شناسد (با اسلشِ اضافه هم)", () => {
    expect(isKeylessBaseUrl("https://text.pollinations.ai/openai")).toBe(true);
    expect(isKeylessBaseUrl("https://text.pollinations.ai/openai/")).toBe(true);
    expect(isKeylessBaseUrl("https://api.groq.com/openai/v1")).toBe(false);
    expect(isKeylessBaseUrl("")).toBe(false);
  });
});

describe("تعداد کارتِ ساخت هوشمند — دستی، بدونِ گزینه‌های آماده", () => {
  it("هر عددی در بازهٔ ۱..۶۰ پذیرفته می‌شود (نه فقط ۱۲/۲۵/۵۰)", () => {
    for (const n of [1, 3, 7, 18, 25, 33, 50, 59, AI_CARD_COUNT_MAX]) {
      expect(normalizeCardCount(n)).toBe(n);
      expect(parseCardCountInput(String(n))).toBe(n);
    }
  });

  it("عددهای خراب مهار می‌شوند (بدون NaN، بدون منفی، بدون انفجار هزینه)", () => {
    expect(normalizeCardCount(undefined)).toBe(AI_CARD_COUNT_DEFAULT);
    expect(normalizeCardCount(Number.NaN)).toBe(AI_CARD_COUNT_DEFAULT);
    expect(normalizeCardCount(0)).toBe(AI_CARD_COUNT_DEFAULT);
    expect(normalizeCardCount(-5)).toBe(AI_CARD_COUNT_DEFAULT);
    expect(normalizeCardCount("25")).toBe(25);
    expect(normalizeCardCount(3.9)).toBe(3);
    expect(normalizeCardCount(9999)).toBe(AI_CARD_COUNT_MAX);
    expect(AI_CARD_COUNT_MIN).toBe(1);
  });

  it("ورودیِ متنیِ کاربر (حتی با ارقامِ فارسی) درست خوانده می‌شود", () => {
    expect(parseCardCountInput("۳۰")).toBe(30);
    expect(parseCardCountInput(" 20 ")).toBe(20);
    expect(parseCardCountInput("")).toBe(AI_CARD_COUNT_DEFAULT); // خالی ⇒ پیش‌فرض
    expect(parseCardCountInput("abc")).toBe(AI_CARD_COUNT_DEFAULT);
    expect(parseCardCountInput("999")).toBe(AI_CARD_COUNT_MAX);
  });

  it("در UI هم فیلدِ عددیِ دستی هست (نگهبانِ رگرسیون: نه سه گزینهٔ آماده)", () => {
    const settings = readFileSync(resolve(process.cwd(), "src/components/SettingsExtras.tsx"), "utf8");
    const auto = readFileSync(resolve(process.cwd(), "src/components/AutoFlashcard.tsx"), "utf8");
    for (const [name, src] of [["SettingsExtras", settings], ["AutoFlashcard", auto]] as const) {
      expect(src, `${name}: ورودیِ عددیِ دستی`).toContain('type="number"');
      expect(src, `${name}: کیبوردِ عددی روی موبایل`).toContain('inputMode="numeric"');
      expect(src, `${name}: parse/commit دستی`).toMatch(/parseCardCountInput|normalizeCardCount/);
      // گزینه‌های از پیش تعیین‌شده نباید برگردند
      expect(src, `${name}: سه گزینهٔ آماده`).not.toContain("AI_CARD_COUNT_CHOICES");
    }
  });

  it("عددِ درخواستی به مدل هم اعلام می‌شود (پرامپت با آن هم‌خوان است)", () => {
    expect(buildCardPrompt("متن", 37)[0].content).toContain("37");
    expect(buildCardPrompt("متن", 37)[0].content).toContain("کارتِ تکراری");
    // ورودی خراب ⇒ همان پیش‌فرض در پرامپت
    expect(buildCardPrompt("متن", Number.NaN)[0].content).toContain(String(AI_CARD_COUNT_DEFAULT));
  });
});
