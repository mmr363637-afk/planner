// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import App from "../App";
import { STORAGE_KEY } from "../lib/persist";
import { todayKey } from "../lib/jalali";

afterEach(cleanup);
beforeEach(() => localStorage.clear());

function seed(questions: unknown[]) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      subjects: [{ id: "s1", name: "قلب", color: "#f00", priority: "high", createdAt: 1 }],
      topics: [{ id: "t1", subjectId: "s1", name: "فشار خون", volume: 10, estimatedMinutes: 60, priority: "medium", difficulty: 2, status: "learning", createdAt: 1 }],
      flashcards: [
        { id: "c1", topicId: "t1", front: "داروی خط اول؟", back: "دیورتیک تیازیدی", ef: 2.5, intervalDays: 0, repetitions: 0, dueDate: todayKey(), lapses: 0, createdAt: 1, origin: "user" },
      ],
      cardQuestions: questions,
      settings: { onboarded: true },
    }),
  );
}

const q = (over: Record<string, unknown> = {}) => ({
  id: "q1",
  cardId: "c1",
  topicId: "t1",
  kind: "mcq",
  prompt: "داروی خط اول؟",
  options: ["دیورتیک تیازیدی", "بتابلاکر", "مهارکننده ACE", "مسدودکننده کانال کلسیم"],
  correctIndex: 0,
  explanation: "پاسخ آفلاین",
  source: "offline",
  cardHash: "h",
  createdAt: 1,
  status: "ok",
  ...over,
});

async function openBank() {
  fireEvent.click(screen.getAllByText("مرور")[0]);
  fireEvent.click(await screen.findByRole("button", { name: "🃏 کارت‌ها" }));
  fireEvent.click(await screen.findByRole("button", { name: "🗂 همه‌ی کارت‌ها" }));
  fireEvent.click(await screen.findByRole("button", { name: "🧠 سؤال‌ها" }));
  return screen.findByText("🧠 بانک سؤال");
}

describe("بانک سؤال — پنجرهٔ AI و خروجی Anki", () => {
  it("وقتی دستیار وصل نیست، راهنمای اتصال نشان می‌دهد و دکمهٔ ساخت را نمی‌آورد", async () => {
    seed([q()]);
    render(<App />);
    await openBank();
    expect(screen.getByText(/پاسخنامه و گزینه‌های بهتر با AI/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /نوشتن پاسخنامه/ })).toBeNull();
    expect(screen.getByText(/تنظیمات ← دستیار هوشمند/)).toBeTruthy();
  });

  it("وقتی دستیار وصل است، تعداد سؤال‌های هدف را نشان می‌دهد", async () => {
    localStorage.setItem("sp_ai_config", JSON.stringify({ baseUrl: "https://example.test/v1", apiKey: "", model: "m" }));
    seed([q(), q({ id: "q2", cardId: "c1" })]);
    render(<App />);
    await openBank();
    expect(await screen.findByRole("button", { name: /نوشتن پاسخنامه \(۲\)/ })).toBeTruthy();
    expect(screen.getByText("وصل است")).toBeTruthy();
  });

  it("سؤال علامت‌خورده از فهرست AI کنار گذاشته می‌شود", async () => {
    localStorage.setItem("sp_ai_config", JSON.stringify({ baseUrl: "https://example.test/v1", apiKey: "", model: "m" }));
    seed([q({ status: "flagged" }), q({ id: "q2", cardId: "c1" })]);
    render(<App />);
    await openBank();
    expect(await screen.findByRole("button", { name: /نوشتن پاسخنامه \(۱\)/ })).toBeTruthy();
  });

  it("دکمهٔ Anki با سؤال موجود فعال است و با بانکِ خالی پیام می‌دهد", async () => {
    seed([]);
    render(<App />);
    await openBank();
    expect(screen.getByText(/سؤالی با این فیلتر نیست/)).toBeTruthy();
    const ankiButtons = screen.getAllByRole("button", { name: /Anki/ });
    fireEvent.click(ankiButtons[ankiButtons.length - 1]);
    expect(await screen.findByText("سؤال قابل خروجی پیدا نشد")).toBeTruthy();
  });

  it("سؤال‌های AI برچسب شفاف «غیرقطعی» و نام مدل دارند", async () => {
    seed([q({ source: "ai", aiModel: "gpt-test", explanation: "توضیح بلندِ AI برای این سؤال که غیرقطعی است." })]);
    render(<App />);
    await openBank();
    const card = (await screen.findByText(/توضیح بلندِ AI/)).closest(".rounded-2xl, .rounded-3xl") as HTMLElement | null;
    const root = (card ?? document.body) as HTMLElement;
    expect(screen.getAllByText("🤖 AI").length).toBeGreaterThan(0);
    expect(within(root).getAllByText(/غیرقطعی/).length).toBeGreaterThan(0);
    expect(within(root).getAllByText(/gpt-test/).length).toBeGreaterThan(0);
  });

  it("فیلتر «کهنه» سؤالی را که کارتش عوض شده نشان می‌دهد", async () => {
    seed([q({ cardHash: "hash-قدیمی" })]);
    render(<App />);
    await openBank();
    fireEvent.click(screen.getByRole("button", { name: /کهنه/ }));
    expect(await screen.findByText(/نیاز به بازسازی/)).toBeTruthy();
  });
});
