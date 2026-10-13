// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "../App";
import AiAssistant, { AiAssistantTrigger } from "../components/AiAssistant";
import { AiAssistantCard } from "../components/SettingsExtras";
import { __resetSharedAiForTest, clearAiConfig, saveAiConfig } from "../lib/ai";
import { APP_VERSION } from "../lib/appVersion";
import { todayKey } from "../lib/jalali";
import { readUsage } from "../lib/usage";
import { NavContext, type NavApi, type NavState } from "../nav";
import { StoreProvider, ToastProvider } from "../store";

const CONFIG = { baseUrl: "https://ai.example/v1", apiKey: "private-key", model: "study-model" };
const SECRET = "private-note-and-account-marker";
const answer = (text = "یک قدم کوچک: بیست دقیقه مرور.") => new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 });

function seed(connected = true) {
  localStorage.clear();
  sessionStorage.clear();
  __resetSharedAiForTest();
  localStorage.setItem("study-planner-v1", JSON.stringify({
    subjects: [{ id: "s1", name: "قلب", color: "#f00", priority: "high", createdAt: 0 }],
    topics: [{ id: "t1", subjectId: "s1", name: "نوار قلب", description: SECRET, volume: 1, estimatedMinutes: 60, priority: "high", difficulty: 2, status: "learning", createdAt: 0 }],
    tasks: [{ id: "task", topicId: "t1", date: todayKey(), plannedMinutes: 60, doneMinutes: 15, status: "pending", order: 0, priority: "high" }],
    notes: [{ id: "note", text: SECRET, createdAt: 0 }],
    settings: { onboarded: true, tourSeen: true, lastSeenVersion: APP_VERSION, notifications: { enabled: false }, autoBackup: { enabled: false }, supabase: { email: SECRET } },
  }));
  if (connected) saveAiConfig(CONFIG);
}

function Harness({ settings = false }: { settings?: boolean }) {
  const [nav, setNav] = useState<NavState>({ tab: "home", planSub: "calendar", calendarDate: null });
  const go: NavApi["go"] = (tab, options) => setNav((current) => ({ tab, planSub: options?.planSub ?? current.planSub, calendarDate: options?.date ?? null }));
  return (
    <ToastProvider><StoreProvider><NavContext.Provider value={{ ...nav, go }}>
      <AiAssistantTrigger />
      <button type="button" onClick={() => go("stats")}>بخش آمار</button>
      <button type="button" onClick={() => go("home")}>بخش خانه</button>
      <span data-testid="current-section">{nav.tab}</span>
      {settings && <AiAssistantCard />}
      <AiAssistant />
    </NavContext.Provider></StoreProvider></ToastProvider>
  );
}

const dialog = () => screen.getByRole("dialog", { name: "🤖 دستیار هوشمند" });
async function openConnected() {
  fireEvent.click(screen.getByRole("button", { name: "دستیار هوشمند" }));
  return await screen.findByLabelText("سؤال از دستیار") as HTMLTextAreaElement;
}
const send = () => fireEvent.click(screen.getByRole("button", { name: "ارسال به دستیار" }));
const close = () => fireEvent.click(within(dialog()).getByRole("button", { name: "بستن" }));

beforeEach(() => { vi.spyOn(window, "scrollTo").mockImplementation(() => undefined); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("دستیار سراسری: دسترسی و اتصال", () => {
  it("از سربرگ همهٔ صفحه‌ها و زیرتب‌های برنامه در App واقعی باز می‌شود، بدون درخواست خودکار", async () => {
    seed();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    for (const label of ["خانه", "برنامه", "مطالعه", "مرور", "آمار", "امتحانات"]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      await openConnected();
      expect(await screen.findByText(`همراهِ بخش ${label === "برنامه" ? "تقویم" : label}`)).toBeTruthy();
      close();
    }
    fireEvent.click(screen.getByRole("button", { name: "برنامه" }));
    for (const [label, section] of [["🌤️ روز من", "روز من"], ["برنامه‌ها", "برنامه‌ها"], ["دروس", "دروس"], ["⏰ هفتگی", "برنامهٔ ثابت هفته"]]) {
      fireEvent.click(await screen.findByRole("button", { name: label }));
      await openConnected();
      expect(screen.getByText(`همراهِ بخش ${section}`)).toBeTruthy();
      close();
    }
    fireEvent.click(screen.getByTitle("تنظیمات"));
    await openConnected();
    expect(screen.getByText("همراهِ بخش تنظیمات")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("از پالت فرمان هم در همان بخش باز می‌شود", async () => {
    seed();
    render(<App />);
    fireEvent.click(screen.getByTitle("جستجو (Ctrl+K)"));
    const query = screen.getByLabelText("جستجو");
    fireEvent.change(query, { target: { value: "دستیار" } });
    fireEvent.keyDown(query, { key: "Enter" });
    expect(await screen.findByLabelText("سؤال از دستیار")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "جستجوی سراسری" })).toBeNull();
    expect(screen.getByText("همراهِ بخش خانه")).toBeTruthy();
  });

  it("بدون اتصال راهنمای تنظیمات نشان می‌دهد و بخش‌های آفلاین را مسدود نمی‌کند", async () => {
    seed(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "دستیار هوشمند" }));
    fireEvent.click(await screen.findByRole("button", { name: "رفتن به تنظیمات دستیار" }));
    expect(screen.getByTestId("current-section").textContent).toBe("settings");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("اتصال در تنظیمات بلافاصله سربرگ را فعال می‌کند و همان کلید همه‌جا استفاده می‌شود", async () => {
    seed(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer("pong")));
    render(<Harness settings />);
    expect(screen.getByRole("button", { name: "دستیار هوشمند" }).dataset.connected).toBe("false");
    // این بیلد دستیار عمومی دارد؛ تب پیش‌فرض «عمومی» است و فرم کلید شخصی زیر تب «🔑 شخصی» است.
    fireEvent.click(screen.getByRole("button", { name: "🔑 شخصی" }));
    fireEvent.change(screen.getByPlaceholderText(/baseUrl —/), { target: { value: CONFIG.baseUrl } });
    fireEvent.change(screen.getByPlaceholderText(/API Key/), { target: { value: CONFIG.apiKey } });
    fireEvent.change(screen.getByPlaceholderText(/model —/), { target: { value: CONFIG.model } });
    fireEvent.click(screen.getByRole("button", { name: "اتصال" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "دستیار هوشمند" }).dataset.connected).toBe("true"));
    fireEvent.click(screen.getByRole("button", { name: "🤖 گفت‌وگو" }));
    expect(await screen.findByLabelText("سؤال از دستیار")).toBeTruthy();
    close();
    fireEvent.click(screen.getByRole("button", { name: "قطع کردن" }));
    expect(screen.getByRole("button", { name: "دستیار هوشمند" }).dataset.connected).toBe("false");
  });
});

describe("🌐 دستیار عمومی (سرور سازنده)", () => {
  const SUPABASE = "https://qylxqzzuzwwbhwglxhme.supabase.co";
  const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const session = { access_token: "anon-jwt", refresh_token: "anon-refresh", expires_in: 3600 };

  /** سرور ساختگی: ورود ناشناس GoTrue + تابع ai-chat با سهمیه */
  function fakeServer(options: { limit?: number; reply?: string } = {}) {
    const limit = options.limit ?? 30;
    let used = 0;
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchMock = vi.fn().mockImplementation((url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url === `${SUPABASE}/auth/v1/signup`) return Promise.resolve(jsonResponse(session));
      if (url === `${SUPABASE}/functions/v1/ai-chat`) {
        const body = JSON.parse(String(init.body)) as { action?: string; messages?: unknown[] };
        if (body.action === "status") return Promise.resolve(jsonResponse({ ok: true, model: "test-model", used, limit, resetAt: "2026-10-13T20:30:00.000Z", available: used < limit }));
        if (used >= limit) return Promise.resolve(jsonResponse({ error: "quota", reason: "user", used, limit, resetAt: "2026-10-13T20:30:00.000Z" }, 429));
        used += 1;
        return Promise.resolve(jsonResponse({ text: options.reply ?? "پاسخ دستیار عمومی", usage: { used, limit, resetAt: "2026-10-13T20:30:00.000Z" } }));
      }
      return Promise.resolve(new Response("not found", { status: 404 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    return { fetchMock, calls };
  }

  it("با یک تپ از خودِ پنل فعال می‌شود، بدون هیچ کلیدی در مرورگر، و پیام از سرور سازنده می‌رود", async () => {
    seed(false);
    const { calls } = fakeServer();
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "دستیار هوشمند" }));
    expect(await screen.findByText("هنوز متصل نیست")).toBeTruthy();
    expect(calls).toHaveLength(0); // باز شدن پنل هیچ درخواستی نمی‌زند
    fireEvent.click(screen.getByRole("button", { name: "🌐 استفاده از دستیار عمومی" }));
    const input = await screen.findByLabelText("سؤال از دستیار") as HTMLTextAreaElement;
    expect(screen.getByRole("button", { name: "دستیار هوشمند" }).dataset.connected).toBe("true");
    expect(screen.getByText(/آنلاین · دستیار عمومی · ۰\/۳۰ امروز/)).toBeTruthy();
    // فعال‌سازی = ورود ناشناس + وضعیت (بدون مصرف سهمیه)
    expect(calls.map((c) => c.url)).toEqual([`${SUPABASE}/auth/v1/signup`, `${SUPABASE}/functions/v1/ai-chat`]);
    expect(JSON.parse(String(calls[1].init.body)).action).toBe("status");
    expect(localStorage.getItem("sp_ai_config")).toBeNull(); // هیچ کلیدی ذخیره نشده
    expect(localStorage.getItem("sp_ai_mode")).toBe("shared");

    fireEvent.change(input, { target: { value: "امروز از کجا شروع کنم؟" } });
    send();
    await screen.findByText("پاسخ دستیار عمومی");
    const chatCall = calls[2];
    expect(chatCall.url).toBe(`${SUPABASE}/functions/v1/ai-chat`);
    const headers = chatCall.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer anon-jwt");
    expect(headers.apikey).toBeTruthy();
    const body = JSON.parse(String(chatCall.init.body));
    expect(body.messages.at(-1).content).toBe("امروز از کجا شروع کنم؟");
    expect(body.model).toBeUndefined(); // مدل را سرور تعیین می‌کند
    expect(JSON.stringify(body)).not.toContain(SECRET);
    expect(screen.getByText(/آنلاین · دستیار عمومی · ۱\/۳۰ امروز/)).toBeTruthy();
    expect(readUsage().ai_assistant.count).toBe(1);
  });

  it("پایان سهمیه پیام فارسی روشن می‌دهد و سؤال را نگه می‌دارد؛ کلید شخصی راه را باز می‌کند", async () => {
    seed(false);
    localStorage.setItem("sp_ai_mode", "shared");
    fakeServer({ limit: 1 });
    render(<Harness />);
    const input = await openConnected();
    fireEvent.change(input, { target: { value: "سؤال اول" } });
    send();
    await screen.findByText("پاسخ دستیار عمومی");
    fireEvent.change(screen.getByLabelText("سؤال از دستیار"), { target: { value: "سؤال دوم" } });
    send();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("سهمیهٔ امروزت در دستیار عمومی تمام شد");
    expect(alert.textContent).toContain("۱ از ۱");
    expect((screen.getByLabelText("سؤال از دستیار") as HTMLTextAreaElement).value).toBe("سؤال دوم");
    expect(readUsage().ai_assistant.count).toBe(1);
    // کلید شخصی را ذخیره می‌کنیم → حالت «شخصی» فعال می‌شود و گفت‌وگوی عمومی پاک می‌شود
    act(() => saveAiConfig(CONFIG));
    expect(screen.getByText("آنلاین · با اتصال خودت")).toBeTruthy();
    expect(screen.queryByText("پاسخ دستیار عمومی")).toBeNull();
  });

  it("در تنظیمات: فعال‌سازی، نمایش سهمیه و خاموش‌کردن؛ کلید شخصیِ ذخیره‌شده بعد از خاموشی فعال می‌شود", async () => {
    seed(false);
    fakeServer({ limit: 20 });
    render(<Harness settings />);
    expect(screen.getByRole("button", { name: "دستیار هوشمند" }).dataset.connected).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "فعال‌سازی دستیار عمومی" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "دستیار هوشمند" }).dataset.connected).toBe("true"));
    expect(screen.getByText(/۰ از ۲۰ پیام امروز \(۲۰ مانده\)/)).toBeTruthy();
    expect(screen.getByText("متصل · عمومی")).toBeTruthy();
    // کلید شخصی هم ذخیره می‌شود → حالت شخصی؛ برگشت به عمومی با یک تپ
    fireEvent.click(screen.getByRole("button", { name: "🔑 شخصی" }));
    act(() => saveAiConfig(CONFIG));
    expect(screen.getByText("متصل · شخصی")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /🌐 عمومی/ }));
    fireEvent.click(screen.getByRole("button", { name: "فعال‌سازی دستیار عمومی" }));
    await screen.findByText("متصل · عمومی");
    fireEvent.click(screen.getByRole("button", { name: "خاموش‌کردن عمومی" }));
    expect(screen.getByText("متصل · شخصی")).toBeTruthy();
    expect(localStorage.getItem("sp_ai_mode")).toBe("personal");
  });
});

describe("گفت‌وگو، رضایت و خطاها", () => {
  it("پیشنهاد فقط سؤال را پر می‌کند؛ خلاصه پیش‌فرض خاموش و فقط با انتخاب کاربر فرستاده می‌شود", async () => {
    seed();
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(answer()));
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness />);
    const input = await openConnected();
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /امروز از کجا شروع کنم/ }));
    expect(input.value).toBe("امروز از کجا شروع کنم؟");
    expect(fetchMock).not.toHaveBeenCalled();
    send();
    await screen.findByText("یک قدم کوچک: بیست دقیقه مرور.");
    const first = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(first.messages.at(-1).content).toBe("امروز از کجا شروع کنم؟");
    expect(JSON.stringify(first.messages)).not.toContain("نوار قلب");
    expect(JSON.stringify(first.messages)).not.toContain(SECRET);
    expect(JSON.stringify(first.messages)).not.toContain(CONFIG.apiKey);

    fireEvent.click(checkbox);
    const preview = JSON.parse(screen.getByLabelText("خلاصهٔ ارسالی").textContent!);
    expect(preview.day.pendingTaskExamples[0].topic).toBe("نوار قلب");
    expect(JSON.stringify(preview)).not.toContain(SECRET);
    fireEvent.change(input, { target: { value: "با این برنامه کمک کن" } });
    send();
    await waitFor(() => expect(readUsage().ai_assistant.count).toBe(2));
    const second = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(second.messages.at(-1).content).toContain(JSON.stringify(preview));
    expect(second.messages).toHaveLength(4);
    expect(second.messages[1].content).toBe("امروز از کجا شروع کنم؟");
    expect(JSON.stringify(second.messages)).not.toContain(SECRET);
    expect(localStorage.getItem("study-planner-v1")).not.toContain("یک قدم کوچک: بیست دقیقه مرور.");
    close();
    await openConnected();
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    expect(screen.getAllByText("یک قدم کوچک: بیست دقیقه مرور.")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "پاک‌کردن گفت‌وگو" }));
    expect(screen.queryByText("یک قدم کوچک: بیست دقیقه مرور.")).toBeNull();
  });

  it("گفت‌وگوی هر بخش جدا می‌ماند و با تغییر بخش دادهٔ قبلی ارسال نمی‌شود", async () => {
    seed();
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(answer("پاسخ خصوصی بخش خانه")));
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness />);
    const input = await openConnected();
    fireEvent.change(input, { target: { value: "سؤال خانه" } });
    send();
    await screen.findByText("پاسخ خصوصی بخش خانه");
    fireEvent.click(screen.getByRole("button", { name: "بخش آمار" }));
    expect(screen.getByText("همراهِ بخش آمار")).toBeTruthy();
    expect(screen.queryByText("پاسخ خصوصی بخش خانه")).toBeNull();
    fireEvent.change(screen.getByLabelText("سؤال از دستیار"), { target: { value: "سؤال آمار" } });
    send();
    await waitFor(() => expect(readUsage().ai_assistant.count).toBe(2));
    const stats = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(stats.messages).toHaveLength(2);
    expect(JSON.stringify(stats.messages)).not.toContain("سؤال خانه");
    fireEvent.click(screen.getByRole("button", { name: "بخش خانه" }));
    expect(screen.getByText("سؤال خانه")).toBeTruthy();
  });

  it("خطای شبکه سؤال را حفظ می‌کند؛ ارسال دوباره بدون پیام تکراری ممکن است", async () => {
    seed();
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(answer("پاسخ پس از تلاش دوباره"));
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness />);
    const input = await openConnected();
    fireEvent.change(input, { target: { value: "سؤال حفظ‌شده" } });
    send();
    expect((await screen.findByRole("alert")).textContent).toContain("به سرویس نرسیدیم");
    expect(input.value).toBe("سؤال حفظ‌شده");
    expect(readUsage().ai_assistant).toBeUndefined();
    send();
    await screen.findByText("پاسخ پس از تلاش دوباره");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getAllByText("سؤال حفظ‌شده")).toHaveLength(1);
    expect(readUsage().ai_assistant.count).toBe(1);
  });

  it("درخواست تکراری را مسدود می‌کند و بستن، پاسخ دیررس را لغو/نادیده می‌گیرد", async () => {
    seed();
    let resolve!: (response: Response) => void;
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>((done) => { resolve = done; }));
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness />);
    const input = await openConnected();
    fireEvent.change(input, { target: { value: "سؤال در انتظار" } });
    const submit = screen.getByRole("button", { name: "ارسال به دستیار" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(input.disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    close();
    expect(signal.aborted).toBe(true);
    await act(async () => { resolve(answer("پاسخ دیررس نباید برگردد")); });
    await openConnected();
    expect(screen.queryByText("پاسخ دیررس نباید برگردد")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(readUsage().ai_assistant).toBeUndefined();
  });

  it("قطع یا تعویض اتصال، درخواست و گفت‌وگوهای قبلی را پاک می‌کند", async () => {
    seed();
    let resolve!: (response: Response) => void;
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>((done) => { resolve = done; }));
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness />);
    const input = await openConnected();
    fireEvent.change(input, { target: { value: "پیام سرویس قبلی" } });
    send();
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    act(() => clearAiConfig());
    expect(signal.aborted).toBe(true);
    expect(screen.getByRole("button", { name: "رفتن به تنظیمات دستیار" })).toBeTruthy();
    await act(async () => { resolve(answer("پاسخ سرویس قبلی")); });
    act(() => saveAiConfig({ ...CONFIG, apiKey: "replacement-key" }));
    expect(screen.queryByText("پاسخ سرویس قبلی")).toBeNull();
    expect(screen.queryByText("پیام سرویس قبلی")).toBeNull();
    expect((screen.getByLabelText("سؤال از دستیار") as HTMLTextAreaElement).value).toBe("");
  });

  it("Enter می‌فرستد، Shift+Enter نمی‌فرستد و HTML مدل فقط متن می‌ماند", async () => {
    seed();
    const html = '<img src="x" onerror="alert(1)">';
    const fetchMock = vi.fn().mockResolvedValue(answer(html));
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness />);
    const input = await openConnected();
    fireEvent.change(input, { target: { value: "سؤال با کیبورد" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByText(html)).toBeTruthy();
    expect(dialog().querySelector("img")).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
