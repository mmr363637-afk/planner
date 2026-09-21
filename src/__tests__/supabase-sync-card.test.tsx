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
  it("با پیکربندیِ پیش‌فرضِ بیلد، کارت اتصال نمایان است و به پروژه‌ی واقعی درخواست نمی‌زند (گارد تست)", async () => {
    localStorage.clear();
    render(<App />);
    await completeOnboarding();

    fireEvent.click(screen.getByTitle("تنظیمات"));

    expect(await screen.findByText("همگام‌سازی ابری (Supabase)")).toBeTruthy();
    // معرفی ورود ناشناس خودکار — کاربر هیچ فرمی لازم ندارد
    expect(screen.getByText(/شناسه‌ی ناشناس خودکار/)).toBeTruthy();
    // دکمه‌های سینک تا اتصال غیرفعال‌اند (در محیط تست اتصال خودکار انجام نمی‌شود)
    expect((screen.getByRole("button", { name: /همگام‌سازی حالا/ }) as HTMLButtonElement).disabled).toBe(true);
    // نبود اثری از گوگل درایو
    expect(screen.queryByText(/Google Drive/)).toBeNull();
  });

  it("با تنظیماتِ نامعتبر، فرم Project URL و anon key دیده می‌شود", async () => {
    localStorage.clear();
    localStorage.setItem(
      "study-planner-v1",
      JSON.stringify({ settings: { onboarded: true, supabase: { url: "http://bad", anonKey: "short" } } }),
    );
    render(<App />);
    fireEvent.click(await screen.findByTitle("تنظیمات"));
    expect(await screen.findByText("همگام‌سازی ابری (Supabase)")).toBeTruthy();
    expect(screen.getByPlaceholderText(/supabase\.co/)).toBeTruthy();
    expect(screen.getByPlaceholderText(/eyJhbGciOi/)).toBeTruthy();
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
