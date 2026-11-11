// @vitest-environment jsdom
// 🔗 لینکِ مستقیم به یک پنجره — `?open=simulator`، `?open=exambank`، `?open=guide`
//
// چرا این تست؟ منوی ☰ و میان‌برهای بیرونی (اشتراک‌گذاری در تلگرام، آیکونِ PWA) باید
// بتوانند کاربر را مستقیم سرِ همان پنجره بگذارند. مدتی این لینک‌ها به صفحهٔ درست
// نمی‌رفتند (روی «خانه» می‌افتادند) و پنجره هم باز نمی‌شد؛ این تست همان را قفل می‌کند.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "../App";
import { STORAGE_KEY } from "../lib/persist";
import { APP_VERSION } from "../lib/appVersion";
import { clearLibraryCache } from "../lib/lessonLibrary";

function seed() {
  localStorage.clear();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      subjects: [{ id: "s1", name: "قلب", color: "#ef4444", priority: "high", createdAt: 1 }],
      topics: [{ id: "t1", subjectId: "s1", name: "آریتمی", volume: 1, estimatedMinutes: 60, priority: "medium", difficulty: 2, status: "learning", createdAt: 1 }],
      flashcards: [
        { id: "c1", topicId: "t1", front: "سؤالِ آزمایشی", back: "پاسخِ آزمایشی", ef: 2.5, intervalDays: 0, repetitions: 0, dueDate: "2020-01-01", lapses: 0, createdAt: 1 },
      ],
      settings: { onboarded: true, lastSeenVersion: APP_VERSION, lastSeenChangelogVersion: APP_VERSION },
    }),
  );
}

const LONG = { timeout: 25_000 };

beforeEach(() => {
  clearLibraryCache();
  globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

describe("🔗 باز شدنِ مستقیمِ پنجره از آدرس", () => {
  it("?open=simulator خودش صفحهٔ امتحانات را می‌آورد و شبیه‌ساز را باز می‌کند", async () => {
    seed();
    window.history.replaceState({}, "", "/?open=simulator");
    render(<App />);
    const dismiss = screen.queryByRole("button", { name: "بزن بریم! 🚀" });
    if (dismiss) fireEvent.click(dismiss);

    // صفحهٔ درست خودکار انتخاب می‌شود (نه خانه) و پنجره باز است
    expect(await screen.findByRole("dialog", { name: /شبیه‌ساز آزمون/ }, LONG)).toBeTruthy();
    expect(await screen.findByText(/از فلش‌کارت‌هایت سوال طرح می‌شود/)).toBeTruthy();
    // با وجودِ فلش‌کارت، دکمهٔ شروع فعال است
    const start = screen.getByRole("button", { name: /شروع آزمون/ }) as HTMLButtonElement;
    expect(start.disabled).toBe(false);
  });

  it("?open=guide فهرستِ ویدیوهای راهنما را باز می‌کند", async () => {
    seed();
    window.history.replaceState({}, "", "/?open=guide");
    render(<App />);
    const dismiss = screen.queryByRole("button", { name: "بزن بریم! 🚀" });
    if (dismiss) fireEvent.click(dismiss);
    expect(await screen.findByRole("dialog", { name: /ویدیوهای راهنمای اپ/ }, LONG)).toBeTruthy();
  });

  it("بدونِ open، مثلِ قبل روی خانه می‌ماند", async () => {
    seed();
    window.history.replaceState({}, "", "/");
    render(<App />);
    const dismiss = screen.queryByRole("button", { name: "بزن بریم! 🚀" });
    if (dismiss) fireEvent.click(dismiss);
    expect(await screen.findByTestId("home-content-library", undefined, LONG)).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: /شبیه‌ساز آزمون/ })).toBeNull();
  });
});
