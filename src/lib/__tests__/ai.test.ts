// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { buildCardPrompt, buildNarrativePrompt, buildTutorPrompt, clearAiConfig, loadAiConfig, parseCardsResponse, saveAiConfig } from "../ai";

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
