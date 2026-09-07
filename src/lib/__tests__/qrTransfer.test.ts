import { describe, expect, it } from "vitest";
import { CHUNK_SIZE, decodeTransfer, encodeTransfer, scopeState, summarize, type TransferScope } from "../qrTransfer";
import { EMPTY_STATE } from "../stateIO";
import type { AppState } from "../../types";

function bigState(): AppState {
  const subjects = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, name: `درس شماره ${i} با نام نسبتاً بلند`, color: "#0ea5a4", priority: "medium" as const, createdAt: i }));
  const topics = Array.from({ length: 250 }, (_, i) => ({
    id: `t${i}`,
    subjectId: `s${i % 12}`,
    name: `مبحث ${i} — عنوان طولانی برای تست فشرده‌سازی متن فارسی`,
    volume: 10 + i,
    estimatedMinutes: 60 + i,
    priority: "medium" as const,
    difficulty: (2 as const),
    status: "learning" as const,
    createdAt: i,
    description: "توضیح نمونه برای پرکردن حجم داده و تست واقعی فشرده‌سازی deflate-raw در انتقال QR",
  }));
  const settings = { ...EMPTY_STATE.settings, dailyGoalMinutes: 120, streakFreezes: 1 };
  return { ...EMPTY_STATE, subjects, topics, settings, sessions: Array.from({ length: 80 }, (_, i) => ({ id: `x${i}`, topicId: `t${i}`, startedAt: i, endedAt: i + 1, durationMinutes: 25, rating: 2 as const, mode: "pomodoro" as const, date: "2026-01-01", cycles: 2 })) };
}

describe("scopeState", () => {
  it("دامنه‌ی تنظیمات فقط settings برمی‌گرداند", () => {
    const scoped = scopeState(bigState(), "settings");
    expect(scoped.settings!.dailyGoalMinutes).toBe(120);
    expect(scoped.subjects).toBeUndefined();
    expect(scoped.sessions).toBeUndefined();
  });

  it("دامنه‌ی برنامه شامل درس‌ها هست ولی تاریخچه‌ی جلسات نه", () => {
    const scoped = scopeState(bigState(), "plan");
    expect(scoped.subjects?.length).toBe(12);
    expect(scoped.exams).toEqual([]);
    expect(scoped.sessions).toBeUndefined();
  });

  it("دامنه‌ی کامل شامل جلسات هم هست", () => {
    expect(scopeState(bigState(), "full").sessions?.length).toBe(80);
  });
});

describe("چرخه‌ی کامل انتقال QR", () => {
  const scopes: TransferScope[] = ["settings", "plan", "full"];

  for (const scope of scopes) {
    it(`encode → تکه‌تکه → decode برای دامنه‌ی ${scope}`, async () => {
      const state = bigState();
      const { chunks, compressed } = await encodeTransfer(state, scope);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      for (const c of chunks) expect(c.length).toBeLessThanOrEqual(CHUNK_SIZE + 30);
      // تکه‌ها را به هم ریخته می‌خوانیم — ترتیب نباید مهم باشد
      const shuffled = [...chunks].reverse();
      const decoded = await decodeTransfer(shuffled);
      expect(decoded.scope).toBe(scope);
      expect(decoded.data).toEqual(scopeState(state, scope));
      // برای داده‌های بزرگ فشرده‌سازی باید واقعاً فعال شده باشد
      if (scope !== "settings") expect(compressed).toBe(true);
    });
  }

  it("اسکن تکراری همان QR نتیجه را خراب نمی‌کند", async () => {
    const { chunks } = await encodeTransfer(bigState(), "settings");
    const decoded = await decodeTransfer([...chunks, chunks[0], chunks[0]]);
    expect(decoded.data.settings).toBeDefined();
  });

  it("با تکه‌ی جامانده خطای گویا می‌دهد", async () => {
    const { chunks } = await encodeTransfer(bigState(), "plan");
    await expect(decodeTransfer(chunks.slice(1))).rejects.toThrow(/missing-chunks/);
  });

  it("متن نامعتبر پذیرفته نمی‌شود", async () => {
    await expect(decodeTransfer(["hello"])).rejects.toThrow("invalid-chunk");
  });

  it("تکه‌های دو انتقال متفاوت قاطی نمی‌شوند", async () => {
    const a = await encodeTransfer(bigState(), "settings");
    const b = await encodeTransfer({ ...bigState(), settings: { ...EMPTY_STATE.settings, xp: 999 } }, "settings");
    await expect(decodeTransfer([a.chunks[0], b.chunks[0]])).rejects.toThrow();
  });
});

describe("summarize", () => {
  it("خلاصه‌ی فارسی از داده می‌سازد", () => {
    const rows = summarize(scopeState(bigState(), "full"));
    expect(rows.some((r) => r.includes("۱۲") || r.includes("12"))).toBe(true);
    expect(rows.some((r) => r.includes("جلسه"))).toBe(true);
  });
});
