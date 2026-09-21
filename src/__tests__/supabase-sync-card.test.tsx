// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, configure, fireEvent, render, screen } from "@testing-library/react";
import App, { needsPush } from "../App";
import { EMPTY_STATE } from "../lib/stateIO";

afterEach(cleanup);
configure({ asyncUtilTimeout: 10000 });

async function completeOnboarding() {
  fireEvent.click(await screen.findByText("بعدی"));
  fireEvent.click(screen.getByText("بعدی"));
  fireEvent.click(screen.getByText("🚀 بساز و شروع کن"));
  fireEvent.click(screen.getByText("فعلاً خودم می‌گردم"));
}

describe("کارت سینک Supabase در تنظیمات", () => {
  async function openSupabaseProvider() {
    fireEvent.click(screen.getByTitle("تنظیمات"));
    // سرویس پیش‌فرض گوگل درایو است — با سوییچ به Supabase می‌رویم
    fireEvent.click(await screen.findByRole("button", { name: /⚡ Supabase/ }));
  }

  it("با پیکربندیِ پیش‌فرضِ بیلد، کارت اتصال نمایان است و به پروژه‌ی واقعی درخواست نمی‌زند (گارد تست)", async () => {
    localStorage.clear();
    render(<App />);
    await completeOnboarding();
    await openSupabaseProvider();

    expect(await screen.findByText("همگام‌سازی ابری (Supabase)")).toBeTruthy();
    // معرفی ورود ناشناس خودکار — کاربر هیچ فرمی لازم ندارد
    expect(screen.getByText(/شناسه‌ی ناشناس خودکار/)).toBeTruthy();
    // دکمه‌های سینک تا اتصال غیرفعال‌اند (در محیط تست اتصال خودکار انجام نمی‌شود)
    expect((screen.getByRole("button", { name: /همگام‌سازی حالا/ }) as HTMLButtonElement).disabled).toBe(true);
    // با انتخاب Supabase، کارتِ خودِ درایو رندر نمی‌شود (سوییچ سرویس کار می‌کند)
    expect(screen.queryByText("همگام‌سازی با Google Drive")).toBeNull();
  });

  it("با تنظیماتِ نامعتبر، فرم Project URL و anon key دیده می‌شود", async () => {
    localStorage.clear();
    localStorage.setItem(
      "study-planner-v1",
      JSON.stringify({ settings: { onboarded: true, supabase: { url: "http://bad", anonKey: "short" } } }),
    );
    render(<App />);
    fireEvent.click(await screen.findByTitle("تنظیمات"));
    fireEvent.click(await screen.findByRole("button", { name: /⚡ Supabase/ }));
    expect(await screen.findByText("همگام‌سازی ابری (Supabase)")).toBeTruthy();
    expect(screen.getByPlaceholderText(/supabase\.co/)).toBeTruthy();
    expect(screen.getByPlaceholderText(/eyJhbGciOi/)).toBeTruthy();
  });

  it("سرویس پیش‌فرض گوگل درایو است و با Client ID کارگذاشته‌شده، دکمه‌ی اتصال آماده است", async () => {
    localStorage.clear();
    render(<App />);
    await completeOnboarding();
    fireEvent.click(screen.getByTitle("تنظیمات"));

    expect(await screen.findByText("همگام‌سازی با Google Drive")).toBeTruthy();
    // کاربران عادی فقط این دکمه را می‌بینند — هیچ راه‌اندازی دستی لازم نیست
    expect(screen.getByRole("button", { name: /اتصال به Google Drive/ })).toBeTruthy();
    // Client ID نامعتبر در تنظیمات پیشرفته ذخیره نمی‌شود
    fireEvent.click(screen.getByRole("button", { name: /تنظیمات پیشرفته/ }));
    fireEvent.change(screen.getByPlaceholderText(/پروژه‌ی شخصی خودت/), { target: { value: "not-a-client-id" } });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));
    expect(await screen.findByText(/قالب Client ID درست نیست/)).toBeTruthy();
  });
});

describe("needsPush — حلقه‌شکنِ سینک خودکار", () => {
  it("وضعیت تغییرنکرده push نمی‌خواهد", () => {
    expect(needsPush(EMPTY_STATE, EMPTY_STATE)).toBe(false);
    expect(needsPush(EMPTY_STATE, { ...EMPTY_STATE })).toBe(false);
  });

  it("تغییر داده‌ی واقعی (درس) push می‌خواهد", () => {
    const b = { ...EMPTY_STATE, subjects: [{ id: "s1", name: "زیست", color: "#f00", priority: "high" as const, createdAt: 1 }] };
    expect(needsPush(EMPTY_STATE, b)).toBe(true);
  });

  it("فقط به‌روزشدنِ زمان‌نگارِ سینک push نمی‌خواهد (بدون حلقه‌ی بی‌نهایت)", () => {
    const a = { ...EMPTY_STATE, settings: { ...EMPTY_STATE.settings, supabase: { lastSyncAt: 100, lastRemoteSeenAt: 100 } } };
    const b = { ...EMPTY_STATE, settings: { ...EMPTY_STATE.settings, supabase: { lastSyncAt: 200, lastRemoteSeenAt: 200, email: "a@b.c" } } };
    expect(needsPush(a, b)).toBe(false);
  });

  it("تغییر تم (تنظیمات واقعی) push می‌خواهد", () => {
    const b = { ...EMPTY_STATE, settings: { ...EMPTY_STATE.settings, theme: "dark" as const } };
    expect(needsPush(EMPTY_STATE, b)).toBe(true);
  });

  it("تغییر activeSession به‌تنهایی push نمی‌خواهد (تایمر لحظه‌ای سینک نمی‌شود)", () => {
    const b: typeof EMPTY_STATE = {
      ...EMPTY_STATE,
      activeSession: { topicId: null, mode: "free", phase: "work", cycle: 0, running: true, startedAt: 1, accumulatedMs: 0, totalStudyMs: 0, sessionStartedAt: 1 },
    };
    expect(needsPush(EMPTY_STATE, b)).toBe(false);
  });
});
