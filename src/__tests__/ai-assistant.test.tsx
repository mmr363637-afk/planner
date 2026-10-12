// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "../App";
import AiAssistant, { AiAssistantTrigger } from "../components/AiAssistant";
import { AiAssistantCard } from "../components/SettingsExtras";
import { clearAiConfig, saveAiConfig } from "../lib/ai";
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
