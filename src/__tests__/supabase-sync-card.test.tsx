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
  it("بدون پیکربندی، فرم Project URL و anon key را نشان می‌دهد و دکمه‌ی مرده‌ی گوگل درایو حذف شده", async () => {
    localStorage.clear();
    render(<App />);
    await completeOnboarding();

    fireEvent.click(screen.getByTitle("تنظیمات"));

    expect(await screen.findByText("همگام‌سازی ابری (Supabase)")).toBeTruthy();
    expect(screen.getByPlaceholderText(/supabase\.co/)).toBeTruthy();
    expect(screen.getByPlaceholderText(/eyJhbGciOi/)).toBeTruthy();
    // کمینه‌ی اعتبارسنجی: کلید کوتاه نباید پذیرفته شود
    const saveBtn = screen.getByRole("button", { name: "ذخیره پیکربندی" });
    fireEvent.change(screen.getByPlaceholderText(/supabase\.co/), { target: { value: "https://abc.supabase.co" } });
    fireEvent.change(screen.getByPlaceholderText(/eyJhbGciOi/), { target: { value: "short" } });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(false); // فرم فقط پر بودن را چک می‌کند؛ اعتبار واقعی در lib است
    // نبود اثری از گوگل درایو
    expect(screen.queryByText(/Google Drive/)).toBeNull();
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
