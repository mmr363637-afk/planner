// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { AI_CARD_COUNT_CHOICES, AI_CARD_COUNT_MAX, buildCardPrompt, normalizeCardCount } from "../ai";
import { AI_PROVIDER_PRESETS, aiProviderPreset } from "../aiProviders";

// ===== 🆓 سرویس‌های رایگان + 🃏 تعداد کارت =====
// پاسخ به دو سؤال کاربر: «آیا AI رایگان گیر می‌آید؟» و «چرا فقط ۱۲ کارت؟»

describe("قالب‌های آمادهٔ سرویس‌های رایگان", () => {
  it("همه با قراردادِ فعلیِ اپ جورند: baseUrl بدون اسلشِ آخر + مدل غیرخالی", () => {
    expect(AI_PROVIDER_PRESETS.length).toBeGreaterThanOrEqual(4);
    for (const p of AI_PROVIDER_PRESETS) {
      expect(p.baseUrl.endsWith("/"), `${p.id} اسلش آخر`).toBe(false);
      expect(p.baseUrl).toMatch(/^https?:\/\//);
      expect(p.model.trim().length, `${p.id} مدل`).toBeGreaterThan(0);
      expect(p.keyUrl).toMatch(/^https:\/\//);
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

  it("Groq/OpenRouter/Gemini همان آدرس‌های مستندشده را دارند (CORS-سازگار)", () => {
    expect(aiProviderPreset("groq")?.baseUrl).toBe("https://api.groq.com/openai/v1");
    expect(aiProviderPreset("openrouter")?.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(aiProviderPreset("gemini")?.baseUrl).toBe("https://generativelanguage.googleapis.com/v1beta/openai");
    // فقط Ollama قرار است http (لوکال) باشد
    const httpOnes = AI_PROVIDER_PRESETS.filter((p) => p.baseUrl.startsWith("http://")).map((p) => p.id);
    expect(httpOnes).toEqual(["ollama"]);
    expect(aiProviderPreset("nope")).toBeNull();
    expect(aiProviderPreset(undefined)).toBeNull();
  });

  it("مدلِ OpenRouter پیش‌فرض از مدل‌های :free است (هزینه‌ی ناخواسته نکند)", () => {
    expect(aiProviderPreset("openrouter")?.model).toContain(":free");
  });
});

describe("تعداد کارتِ ساخت هوشمند (سقف ۱۲ از خودِ اپ بود)", () => {
  it("گزینه‌های UI همه در بازهٔ مجاز و شاملِ ۱۲/۲۵/۵۰ هستند", () => {
    expect([...AI_CARD_COUNT_CHOICES]).toEqual([12, 25, 50]);
    for (const n of AI_CARD_COUNT_CHOICES) {
      expect(normalizeCardCount(n)).toBe(n);
      expect(n).toBeLessThanOrEqual(AI_CARD_COUNT_MAX);
    }
  });

  it("عددهای خراب مهار می‌شوند (بدون NaN، بدون منفی، بدون انفجار هزینه)", () => {
    expect(normalizeCardCount(undefined)).toBe(12);
    expect(normalizeCardCount(NaN)).toBe(12);
    expect(normalizeCardCount(0)).toBe(12);
    expect(normalizeCardCount(-5)).toBe(12);
    expect(normalizeCardCount("25")).toBe(25);
    expect(normalizeCardCount(3.9)).toBe(3);
    expect(normalizeCardCount(9999)).toBe(AI_CARD_COUNT_MAX);
  });

  it("عددِ درخواستی به مدل هم اعلام می‌شود (پرامپت با آن هم‌خوان است)", () => {
    expect(buildCardPrompt("متن", 50)[0].content).toContain("50");
    expect(buildCardPrompt("متن", 50)[0].content).toContain("کارتِ تکراری");
    // ورودی خراب ⇒ همان پیش‌فرض ۱۲ در پرامپت
    expect(buildCardPrompt("متن", Number.NaN)[0].content).toContain("12");
  });
});
