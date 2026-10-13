// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetSharedAiForTest, activeAiProvider, aiConfigured, buildCardPrompt, buildNarrativePrompt, buildTutorPrompt, checkSharedAi, clearAiConfig, disableSharedAi, enableSharedAi, getAiQuota, loadAiConfig, loadAiMode, parseCardsResponse, requestAiChat, saveAiConfig, sharedAiEndpoint } from "../ai";

const CONFIG = { baseUrl: "https://ai.example/v1", apiKey: "sk-personal", model: "m" };
const SUPABASE = "https://qylxqzzuzwwbhwglxhme.supabase.co";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const session = (token = "jwt-1") => ({ access_token: token, refresh_token: `refresh-${token}`, expires_in: 3600 });

describe("🌐 دستیار عمومی — انتخاب اتصال", () => {
  beforeEach(() => { localStorage.clear(); __resetSharedAiForTest(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("endpoint عمومی همان پروژهٔ پیش‌فرض بیلد است", () => {
    expect(sharedAiEndpoint()).toEqual({ url: SUPABASE, anonKey: expect.any(String) });
  });

  it("بدون انتخاب: کلید شخصی اگر باشد فعال است؛ وگرنه هیچ", () => {
    expect(activeAiProvider()).toBeNull();
    expect(aiConfigured()).toBe(false);
    saveAiConfig(CONFIG);
    expect(activeAiProvider()).toEqual({ kind: "personal", config: CONFIG });
    expect(loadAiMode()).toBe("personal");
  });

  it("فعال‌سازی عمومی اول وضعیت سرور را می‌سنجد و فقط در موفقیت حالت را ذخیره می‌کند", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(session()))
      .mockResolvedValueOnce(new Response("not found", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const failed = await enableSharedAi();
    expect(failed.ok).toBe(false);
    expect(failed.error).toContain("راه‌اندازی نشده");
    expect(loadAiMode()).toBeNull();
    expect(activeAiProvider()).toBeNull();

    fetchMock.mockResolvedValueOnce(json({ ok: true, model: "m-public", used: 3, limit: 30, resetAt: "2026-10-13T20:30:00.000Z" }));
    const ok = await enableSharedAi();
    expect(ok.ok).toBe(true);
    expect(ok.quota).toEqual({ used: 3, limit: 30, resetAt: "2026-10-13T20:30:00.000Z", model: "m-public" });
    expect(getAiQuota()?.used).toBe(3);
    expect(activeAiProvider()?.kind).toBe("shared");
    // نشست ناشناس یک‌بار گرفته و دوباره استفاده شد (دو بار signup نزدیم)
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/auth/v1/signup"))).toHaveLength(1);
    expect(localStorage.getItem("sp_ai_auth")).toContain("jwt-1");
  });

  it("خاموش‌کردن عمومی به کلید شخصیِ ذخیره‌شده برمی‌گردد؛ پاک‌کردن کلید شخصی، عمومی را خاموش نمی‌کند", async () => {
    saveAiConfig(CONFIG);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(session())).mockResolvedValueOnce(json({ ok: true, used: 0, limit: 30 })));
    await enableSharedAi();
    expect(activeAiProvider()?.kind).toBe("shared");
    clearAiConfig();
    expect(activeAiProvider()?.kind).toBe("shared");
    saveAiConfig(CONFIG);
    expect(activeAiProvider()?.kind).toBe("personal"); // واردکردن کلید = انتخاب آگاهانهٔ شخصی
    localStorage.setItem("sp_ai_mode", "shared");
    disableSharedAi();
    expect(activeAiProvider()).toEqual({ kind: "personal", config: CONFIG });
    disableSharedAi(); // بی‌اثر وقتی عمومی فعال نیست
    expect(activeAiProvider()?.kind).toBe("personal");
  });

  it("با VITE_SHARED_AI=off گزینهٔ عمومی وجود ندارد و حالت ذخیره‌شدهٔ قدیمی به شخصی برمی‌گردد", () => {
    vi.stubEnv("VITE_SHARED_AI", "off");
    try {
      expect(sharedAiEndpoint()).toBeNull();
      localStorage.setItem("sp_ai_mode", "shared");
      expect(activeAiProvider()).toBeNull();
      saveAiConfig(CONFIG);
      localStorage.setItem("sp_ai_mode", "shared");
      expect(activeAiProvider()?.kind).toBe("personal");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("🌐 دستیار عمومی — حمل‌ونقل", () => {
  beforeEach(() => { localStorage.clear(); __resetSharedAiForTest(); localStorage.setItem("sp_ai_mode", "shared"); });
  afterEach(() => { vi.unstubAllGlobals(); });

  const messages = [{ role: "user" as const, content: "سلام" }];

  it("ورود ناشناس → ai-chat با JWT و apikey؛ متن برمی‌گردد و سهمیه به‌روز می‌شود", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(session("jwt-a")))
      .mockResolvedValueOnce(json({ text: "پاسخ", usage: { used: 5, limit: 30, resetAt: "2026-10-13T20:30:00.000Z" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await requestAiChat(messages)).toBe("پاسخ");
    const [signupUrl, signupInit] = fetchMock.mock.calls[0];
    expect(signupUrl).toBe(`${SUPABASE}/auth/v1/signup`);
    expect(JSON.parse(signupInit.body)).toEqual({ data: {} });
    expect(signupInit.headers.apikey).toBeTruthy();
    const [chatUrl, chatInit] = fetchMock.mock.calls[1];
    expect(chatUrl).toBe(`${SUPABASE}/functions/v1/ai-chat`);
    expect(chatInit.headers.Authorization).toBe("Bearer jwt-a");
    expect(chatInit.headers.apikey).toBe(signupInit.headers.apikey);
    const body = JSON.parse(chatInit.body);
    expect(body).toEqual({ messages, temperature: 0.4 });
    expect(JSON.stringify(chatInit)).not.toContain("sk-");
    expect(getAiQuota()).toEqual({ used: 5, limit: 30, resetAt: "2026-10-13T20:30:00.000Z", model: undefined });

    // درخواست بعدی: نشست کش‌شده، بدون signup دوباره
    fetchMock.mockResolvedValueOnce(json({ text: "پاسخ ۲", usage: { used: 6, limit: 30 } }));
    expect(await requestAiChat(messages)).toBe("پاسخ ۲");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(getAiQuota()?.used).toBe(6);
    expect(getAiQuota()?.resetAt).toBe("2026-10-13T20:30:00.000Z"); // مقدار قبلی حفظ شد
  });

  it("نشست منقضی با refresh_token تازه می‌شود؛ اگر refresh رد شد هویت ناشناس تازه می‌گیرد", async () => {
    localStorage.setItem("sp_ai_auth", JSON.stringify({ accessToken: "old", refreshToken: "old-refresh", expiresAt: Date.now() - 1000 }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(session("jwt-fresh")))
      .mockResolvedValueOnce(json({ text: "ok" }));
    vi.stubGlobal("fetch", fetchMock);
    await requestAiChat(messages);
    expect(fetchMock.mock.calls[0][0]).toBe(`${SUPABASE}/auth/v1/token?grant_type=refresh_token`);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ refresh_token: "old-refresh" });
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer jwt-fresh");

    localStorage.setItem("sp_ai_auth", JSON.stringify({ accessToken: "old", refreshToken: "revoked", expiresAt: Date.now() - 1000 }));
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(json({ error: "invalid_grant", error_code: "refresh_token_not_found" }, 400))
      .mockResolvedValueOnce(json(session("jwt-new")))
      .mockResolvedValueOnce(json({ text: "ok2" }));
    expect(await requestAiChat(messages)).toBe("ok2");
    expect(fetchMock.mock.calls[1][0]).toBe(`${SUPABASE}/auth/v1/signup`);
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe("Bearer jwt-new");
  });

  it("۴۰۱ از تابع → یک بار نشست تازه و تلاش دوباره؛ ۴۲۹ سهمیه → پیام فارسی با عدد", async () => {
    localStorage.setItem("sp_ai_auth", JSON.stringify({ accessToken: "stale", refreshToken: "r", expiresAt: Date.now() + 3_600_000 }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ error: "unauthorized" }, 401))
      .mockResolvedValueOnce(json(session("jwt-retry")))
      .mockResolvedValueOnce(json({ text: "بعد از تازه‌سازی" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await requestAiChat(messages)).toBe("بعد از تازه‌سازی");
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe("Bearer jwt-retry");

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(json({ error: "quota", reason: "user", used: 30, limit: 30, resetAt: "2026-10-13T20:30:00.000Z" }, 429));
    await expect(requestAiChat(messages)).rejects.toThrow(/سهمیهٔ امروزت در دستیار عمومی تمام شد \(۳۰ از ۳۰\)/);
    expect(getAiQuota()).toEqual({ used: 30, limit: 30, resetAt: "2026-10-13T20:30:00.000Z", model: undefined });

    fetchMock.mockResolvedValueOnce(json({ error: "quota", reason: "global", used: 2, limit: 30 }, 429));
    await expect(requestAiChat(messages)).rejects.toThrow(/برای همهٔ کاربران پر شده/);
  });

  it("خطاهای سرور و شبکه پیام قابل‌فهم می‌دهند و وضعیت بدون مصرف سهمیه است", async () => {
    localStorage.setItem("sp_ai_auth", JSON.stringify({ accessToken: "t", refreshToken: "r", expiresAt: Date.now() + 3_600_000 }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(json({ error: "not_configured" }, 503));
    await expect(requestAiChat(messages)).rejects.toThrow(/پیکربندی نشده/);
    fetchMock.mockResolvedValueOnce(json({ error: "upstream_busy" }, 503));
    await expect(requestAiChat(messages)).rejects.toThrow(/شلوغ/);
    fetchMock.mockResolvedValueOnce(json({ error: "too_long", maxInputChars: 100 }, 413));
    await expect(requestAiChat(messages)).rejects.toThrow(/خیلی بلند/);
    fetchMock.mockResolvedValueOnce(json({ error: "upstream_error", status: 500 }, 502));
    await expect(requestAiChat(messages)).rejects.toThrow(/پاسخ نداد/);
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(requestAiChat(messages)).rejects.toThrow(/نرسیدیم/);
    expect(fetchMock.mock.calls.every(([url]) => String(url).endsWith("/functions/v1/ai-chat"))).toBe(true);

    fetchMock.mockResolvedValueOnce(json({ ok: true, used: 7, limit: 30, model: "x" }));
    const status = await checkSharedAi();
    expect(status.ok).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body)).toEqual({ action: "status" });
    expect(getAiQuota()?.model).toBe("x");
  });

  it("لغو کاربر، AbortError می‌دهد نه خطای سرویس", async () => {
    localStorage.setItem("sp_ai_auth", JSON.stringify({ accessToken: "t", refreshToken: "r", expiresAt: Date.now() + 3_600_000 }));
    const controller = new AbortController();
    // مثل fetch واقعی: سیگنالِ از قبل لغوشده فوراً رد می‌شود، وگرنه تا لغو منتظر می‌ماند
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      if (init.signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })));
    const pending = requestAiChat(messages, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

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
