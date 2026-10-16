// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AI_CARD_GENERATION_TIMEOUT_MS, aiGenerateCards, buildCardPrompt, buildNarrativePrompt, buildTutorPrompt, clearAiConfig, loadAiConfig, parseCardsResponse, saveAiConfig } from "../ai";

describe("دستیار هوشمند (BYO-Key)", () => {
  beforeEach(() => {
    localStorage.clear();
    clearAiConfig();
  });

  it("پیکربندی فقط با هر سه فیلد معتبر ذخیره/خوانده می‌شود", () => {
    expect(loadAiConfig()).toBeNull();
    saveAiConfig({ baseUrl: "https://openrouter.ai/api/v1/", apiKey: "sk-x", model: "m" });
    const c = loadAiConfig();
    expect(c).not.toBeNull();
    expect(c!.baseUrl).toBe("https://openrouter.ai/api/v1"); // اسلش اضافه پاک شد
    clearAiConfig();
    expect(loadAiConfig()).toBeNull();
    saveAiConfig({ baseUrl: "", apiKey: "sk-x", model: "m" });
    expect(loadAiConfig()).toBeNull();
  });

  it("پارسِ پاسخ کارت‌ها — JSON خالص، fenced و با متن اضافه", () => {
    const pure = '[{"front":"سوال؟","back":"جواب"},{"front":"q2","back":"a2"}]';
    expect(parseCardsResponse(pure).length).toBe(2);

    const fenced = 'بله حتماً!\n```json\n[{"front":"س","back":"ج"}]\n```\nامیدوارم مفید باشد';
    const cards = parseCardsResponse(fenced);
    expect(cards.length).toBe(1);
    expect(cards[0]).toEqual({ front: "س", back: "ج" });
  });

  it("پارسِ ورودیِ خراب → آرایه‌ی خالی (نه crash)", () => {
    expect(parseCardsResponse("")).toEqual([]);
    expect(parseCardsResponse("متن بدون json")).toEqual([]);
    expect(parseCardsResponse('[{"front":"بدون back"}]')).toEqual([]);
    expect(parseCardsResponse('[{"front":"  ","back":"x"}]')).toEqual([]);
    expect(parseCardsResponse("{broken")).toEqual([]);
  });

  it("🆓 بدونِ کلید هم کار می‌کند: هدرِ Authorization فرستاده نمی‌شود", async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string> });
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "سلام!" } }] }),
      } as unknown as Response;
    }) as typeof fetch;
    try {
      // قالبِ «بدونِ کلید»: کلید خالی ذخیره می‌شود و باید معتبر بماند
      saveAiConfig({ baseUrl: "https://text.pollinations.ai/openai", apiKey: "", model: "openai-fast" });
      expect(loadAiConfig()).not.toBeNull();
      const { requestAiChat } = await import("../ai");
      const answer = await requestAiChat([{ role: "user", content: "سلام" }]);
      expect(answer).toBe("سلام!");
      expect(calls.length).toBe(1);
      expect(calls[0].url).toBe("https://text.pollinations.ai/openai/chat/completions");
      expect(calls[0].headers.Authorization).toBeUndefined();
      expect(calls[0].headers["Content-Type"]).toBe("application/json");
    } finally {
      globalThis.fetch = original;
      clearAiConfig();
    }
  });

  it("با کلید، همان هدرِ Bearer مثل قبل می‌رود (بدونِ رگرسیون)", async () => {
    const headers: Record<string, string>[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      headers.push((init?.headers ?? {}) as Record<string, string>);
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "ok" } }] }),
      } as unknown as Response;
    }) as typeof fetch;
    try {
      saveAiConfig({ baseUrl: "https://api.groq.com/openai/v1", apiKey: "gsk-test", model: "llama-3.3-70b-versatile" });
      const { requestAiChat } = await import("../ai");
      await requestAiChat([{ role: "user", content: "سلام" }]);
      expect(headers[0].Authorization).toBe("Bearer gsk-test");
    } finally {
      globalThis.fetch = original;
      clearAiConfig();
    }
  });

  it("برای مدل‌های استدلالی، تولید فلش‌کارت قبل از پنج دقیقه قطع نمی‌شود", async () => {
    const original = globalThis.fetch;
    let requestSignal: AbortSignal | null = null;
    vi.useFakeTimers();
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      requestSignal = init?.signal ?? null;
      return new Promise((_resolve, reject) => {
        requestSignal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    }) as typeof fetch;
    try {
      saveAiConfig({ baseUrl: "https://api.example.com/v1", apiKey: "test", model: "reasoning-model" });
      const result = aiGenerateCards("متن برای ساخت کارت", 1);
      const check = expect(result).rejects.toThrow("زمان درخواست تمام شد");

      await vi.advanceTimersByTimeAsync(45_000);
      expect((requestSignal as AbortSignal | null)?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(AI_CARD_GENERATION_TIMEOUT_MS - 45_000);
      await check;
      expect((requestSignal as AbortSignal | null)?.aborted).toBe(true);
    } finally {
      globalThis.fetch = original;
      vi.useRealTimers();
    }
  });

  it("پرامپت‌ها فارسی و ساختارمندند و متن کاربر را محدود می‌کنند", () => {
    const msgs = buildCardPrompt("ن".repeat(20_000), 8);
    expect(msgs.length).toBe(2);
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toContain("JSON");
    expect(msgs[1].content.length).toBeLessThanOrEqual(12_000);

    const tutor = buildTutorPrompt({ question: "سوال تست", answer: "گزینه ۳", cause: "بی‌دقتی" });
    expect(tutor[1].content).toContain("بی‌دقتی");
    expect(tutor[0].content).toContain("سه سوال تمرینی");

    const narr = buildNarrativePrompt({ weekMinutes: 100 });
    expect(narr[0].content).toContain("فقط از داده‌های همان JSON");
    expect(narr[1].content).toBe(JSON.stringify({ weekMinutes: 100 }));
  });
});
