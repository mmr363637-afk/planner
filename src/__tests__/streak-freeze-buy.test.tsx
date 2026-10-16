// @vitest-environment jsdom
/**
 * 🐛 گزارش کاربر: «در بخش Streak Freeze اگر یکی بخری، روزهای قبلی را حساب می‌کند».
 *
 * این تست تمام زنجیره را از دید کاربر می‌سنجد: خرید یخ‌زدگی از دکمهٔ صفحهٔ آمار،
 * ذخیره‌شدن تاریخِ خرید، و اینکه هیچ روز جاماندهٔ *قبل از خرید* به‌صورت خودکار
 * یخ‌زده/مصرف نشود.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../App";
import { addDays, todayKey } from "../lib/jalali";

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-16T12:00:00").getTime());
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function savedState() {
  return JSON.parse(localStorage.getItem("study-planner-v1")!);
}

/** حالتِ کاربر: XP کافی، دو روز مطالعه، دو روز جامانده، بدون یخ‌زدگی */
function seedWithGap() {
  const today = todayKey();
  const session = (date: string, id: string) => ({
    id,
    topicId: null,
    startedAt: 1,
    endedAt: 2,
    durationMinutes: 30,
    rating: 3,
    mode: "free",
    date,
  });
  localStorage.setItem(
    "study-planner-v1",
    JSON.stringify({
      sessions: [session(addDays(today, -4), "s1"), session(addDays(today, -3), "s2")],
      settings: { xp: 500, onboarded: true, tourSeen: true, streakFreezes: 0, streakFreezeDates: [] },
    }),
  );
  return today;
}

describe("خرید یخ‌زدگی Streak (گزارش کاربر)", () => {
  it("خرید، گذشته را جبران نمی‌کند: هیچ روزی عقب‌گرد یخ‌زده نمی‌شود", async () => {
    const today = seedWithGap();
    render(<App />);

    fireEvent.click(screen.getAllByText("آمار")[0]);
    const buy = await screen.findByRole("button", { name: /خرید \(۱۰۰ XP\)/ });
    const xpBefore = savedState().settings.xp;
    fireEvent.click(buy);

    await waitFor(() => expect(savedState().settings.streakFreezes).toBe(1));
    const saved = savedState().settings;
    // تاریخِ خرید ثبت می‌شود و فقط از امروز به بعد پوشش می‌دهد
    expect(saved.streakFreezeBoughtOn).toEqual([today]);
    // 🐛 گزارش‌شده: قبلاً همین لحظه یکی از یخ‌زدگی‌ها روزهای جاماندهٔ قبل را می‌گرفت
    expect(saved.streakFreezeDates).toEqual([]);
    expect(saved.xp).toBe(xpBefore - 100);
  });

  it("روزِ جاماندهٔ *بعد* از خرید، فردا با همان یخ‌زدگی پوشش می‌یابد", async () => {
    // همین تست با «فردا» اجرا می‌شود: کاربر امروز یخ‌زدگی خریده و امروز را از دست داده
    const today = seedWithGap();
    const tomorrow = addDays(today, 1);
    render(<App />);

    fireEvent.click(screen.getAllByText("آمار")[0]);
    fireEvent.click(await screen.findByRole("button", { name: /خرید \(۱۰۰ XP\)/ }));
    await waitFor(() => expect(savedState().settings.streakFreezes).toBe(1));

    // روز عوض می‌شود: اپ دوباره بالا می‌آید (همان داده، فردا)
    vi.setSystemTime(new Date(`${tomorrow}T09:00:00`).getTime());
    cleanup();
    render(<App />);
    await waitFor(() => expect(savedState().settings.streakFreezes).toBe(0));
    const saved = savedState().settings;
    expect(saved.streakFreezeDates).toEqual([today]); // روزِ خریده‌شده پوشش یافت
    expect(saved.streakFreezeBoughtOn).toEqual([]); // و از موجودی کم شد
  });
});
