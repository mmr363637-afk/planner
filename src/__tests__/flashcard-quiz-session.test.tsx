// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "../App";
import { toFa, todayKey } from "../lib/jalali";
import { STORAGE_KEY } from "../lib/persist";

afterEach(cleanup);

function seed() {
  localStorage.clear();
  const due = todayKey();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      subjects: [{ id: "s1", name: "قلب", color: "#f00", priority: "high", approach: "mixed", createdAt: 1 }],
      topics: [{ id: "t1", subjectId: "s1", name: "فشار خون", volume: 10, estimatedMinutes: 60, priority: "medium", difficulty: 2, status: "learning", createdAt: 1 }],
      flashcards: [
        { id: "c1", topicId: "t1", front: "داروی خط اول فشار خون؟", back: "دیورتیک تیازیدی", ef: 2.5, intervalDays: 0, repetitions: 0, dueDate: due, lapses: 0, createdAt: 1, origin: "user" },
        { id: "c2", topicId: "t1", front: "داروی مهارکنندهٔ آنزیم مبدل؟", back: "مهارکننده آنزیم مبدل آنژیوتانسین", ef: 2.5, intervalDays: 0, repetitions: 0, dueDate: due, lapses: 0, createdAt: 1, origin: "user" },
        { id: "c3", topicId: "t1", front: "داروی کاهندهٔ ضربان؟", back: "مسدودکننده کانال کلسیم", ef: 2.5, intervalDays: 0, repetitions: 0, dueDate: due, lapses: 0, createdAt: 1, origin: "user" },
        { id: "c4", topicId: "t1", front: "داروی مسدودکنندهٔ گیرندهٔ بتا؟", back: "بتابلاکر", ef: 2.5, intervalDays: 0, repetitions: 0, dueDate: due, lapses: 0, createdAt: 1, origin: "user" },
      ],
      settings: { onboarded: true },
    }),
  );
}

const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!);

async function openDeck() {
  fireEvent.click(screen.getAllByText("مرور")[0]);
  fireEvent.click(await screen.findByRole("button", { name: "🃏 کارت‌ها" }));
  return screen.findByText("فشار خون");
}

describe("جلسهٔ چهارگزینه‌ای از فلش‌کارت‌ها", () => {
  it("از کارت‌ها سؤال می‌سازد، پاسخ را ثبت می‌کند و در رفت‌وبرگشت دوباره ثبت نمی‌کند", async () => {
    seed();
    render(<App />);
    const dismiss = screen.queryByRole("button", { name: "بزن بریم! 🚀" });
    if (dismiss) fireEvent.click(dismiss);
    await openDeck();

    // «🎯 آزمون» → تنظیم جلسه → شروع
    fireEvent.click(screen.getByRole("button", { name: "🎯 آزمون" }));
    expect(await screen.findByText(/حالت جلسه/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^شروع ${toFa(4)} کارت$`) }));

    // سؤال + چهار گزینه
    expect(await screen.findByText("داروی خط اول فشار خون؟")).toBeTruthy();
    expect(screen.getByText("کارت ۱ از ۴")).toBeTruthy();
    expect(screen.getByText("دیورتیک تیازیدی")).toBeTruthy();
    expect(screen.getByText("بتابلاکر")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /دیورتیک تیازیدی/ }));
    expect(await screen.findByText("✅ درست")).toBeTruthy();
    expect(saved().cardAttempts?.length ?? 0).toBe(1);

    // رفتن به کارت بعد و برگشت: پاسخ و بازخورد حفظ می‌شوند و ثبت دوباره نمی‌شود
    fireEvent.click(screen.getByRole("button", { name: /بعدی/ }));
    expect(screen.getByText("کارت ۲ از ۴")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /قبلی/ }));
    expect(screen.getByText("کارت ۱ از ۴")).toBeTruthy();
    expect(screen.getByText("✅ درست")).toBeTruthy();
    expect(saved().cardAttempts?.length ?? 0).toBe(1);
    // کارتِ پاسخ‌داده‌شده در SM-2 جلو رفته و از امروز خارج شده
    const card = saved().flashcards.find((c: { id: string }) => c.id === "c1");
    expect(card.dueDate > todayKey()).toBe(true);
  }, 30000);

  it("بعد از جلسه، مرورِ سررسیدشدهٔ همان مبحث با یک تپ «انجام دادم» ثبت می‌شود", async () => {
    localStorage.clear();
    const due = todayKey();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        subjects: [{ id: "s1", name: "قلب", color: "#f00", priority: "high", approach: "mixed", createdAt: 1 }],
        topics: [{ id: "t1", subjectId: "s1", name: "فشار خون", volume: 10, estimatedMinutes: 60, priority: "medium", difficulty: 2, status: "learning", createdAt: 1 }],
        reviews: [{ id: "r1", topicId: "t1", dueDate: due, reviewNumber: 1, stage: 0, intervalDays: 1, status: "pending" }],
        flashcards: [
          { id: "c1", topicId: "t1", front: "داروی خط اول فشار خون؟", back: "دیورتیک تیازیدی", ef: 2.5, intervalDays: 0, repetitions: 0, dueDate: due, lapses: 0, createdAt: 1, origin: "user" },
        ],
        settings: { onboarded: true },
      }),
    );
    render(<App />);
    const dismiss = screen.queryByRole("button", { name: "بزن بریم! 🚀" });
    if (dismiss) fireEvent.click(dismiss);
    fireEvent.click(screen.getAllByText("مرور")[0]);
    fireEvent.click(await screen.findByRole("button", { name: "🃏 کارت‌ها" }));
    await screen.findByText("فشار خون");
    fireEvent.click(screen.getByRole("button", { name: /مرور این مبحث/ }));

    fireEvent.click(screen.getByRole("button", { name: "نمایش پاسخ" }));
    fireEvent.click(screen.getByRole("button", { name: /خوب/ }));
    fireEvent.click(screen.getByRole("button", { name: /پایان و نتیجه/ }));

    expect(await screen.findByText(/مرورِ «فشار خون» را هم ثبت کن/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "🙂 خوب بود" }));
    expect(await screen.findByText(/مرور ثبت شد/)).toBeTruthy();

    const state = saved();
    expect(state.reviews.find((r: { id: string }) => r.id === "r1").status).toBe("done");
    expect(state.reviews.some((r: { status: string }) => r.status === "pending")).toBe(true);
  }, 30000);

  it("آزمون زمان‌دار شمارش معکوس و نتیجهٔ پایانی با تفکیک درست/غلط نشان می‌دهد", async () => {
    seed();
    render(<App />);
    const dismiss = screen.queryByRole("button", { name: "بزن بریم! 🚀" });
    if (dismiss) fireEvent.click(dismiss);
    await openDeck();

    fireEvent.click(screen.getByRole("button", { name: "🎯 آزمون" }));
    fireEvent.click(await screen.findByRole("button", { name: /آزمون زمان‌دار/ }));
    fireEvent.click(screen.getAllByRole("button", { name: /۵ دقیقه/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^شروع ${toFa(4)} کارت$`) }));

    expect(await screen.findByText(/⏳/)).toBeTruthy();
    // یک پاسخ غلط عمدی: گزینهٔ «بتابلاکر» برای کارت اول درست نیست
    fireEvent.click(screen.getByRole("button", { name: /بتابلاکر/ }));
    expect(await screen.findByText("❌ اشتباه")).toBeTruthy();
    expect(screen.getByText(/پاسخ درست: دیورتیک تیازیدی/)).toBeTruthy();

    // پایان زودهنگام آزمون: نتیجه باید «بی‌پاسخ» را جدا نشان دهد
    fireEvent.click(screen.getByRole("button", { name: /پایان آزمون و دیدن نتیجه/ }));
    expect(await screen.findByText("آزمون زمان‌دار تمام شد")).toBeTruthy();
    // ۳ کارت بی‌پاسخ مانده
    expect(screen.getByText("بی‌پاسخ").closest("div")?.parentElement?.textContent).toContain(toFa(3));
    expect(saved().flashSessions?.length ?? 0).toBe(1);
    expect(saved().cardAttempts?.length ?? 0).toBe(1);
    expect(screen.getByText(/مرور اشتباه/)).toBeTruthy();
    expect(screen.getByText(/✅ دیورتیک تیازیدی/)).toBeTruthy();
  }, 30000);
});
