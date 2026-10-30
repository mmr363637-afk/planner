// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "../App";
import { STORAGE_KEY } from "../lib/persist";

afterEach(cleanup);

function seed() {
  localStorage.clear();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      subjects: [],
      topics: [],
      flashcards: [],
      settings: { onboarded: true },
    }),
  );
}

const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!);

async function openBank() {
  fireEvent.click(screen.getAllByText("امتحانات")[0]);
  fireEvent.click(await screen.findByRole("button", { name: /بانک سؤال پره‌انترنی/ }));
  return screen.findByText(/قلب و عروق/);
}

describe("بانک سؤال پره‌انترنی/دستیاری", () => {
  it("بدون تنظیم آدرس، نمونهٔ داخلی را نشان می‌دهد، مبحث را می‌گیرد و پاسخ را ذخیره می‌کند", async () => {
    seed();
    render(<App />);
    const dismiss = screen.queryByRole("button", { name: "بزن بریم! 🚀" });
    if (dismiss) fireEvent.click(dismiss);

    await openBank();
    expect(screen.getByText(/نمونهٔ داخلی/)).toBeTruthy();

    // انتخاب مبحث «قلب و عروق» و شروع آزمون
    fireEvent.click(screen.getAllByText(/قلب و عروق/)[0]);
    fireEvent.click(screen.getByRole("button", { name: /^شروع آزمون/ }));

    // سؤال اول و انتخاب یکی از گزینه‌ها
    const option = await screen.findByRole("button", { name: /^۱\)/ });
    fireEvent.click(option);
    expect(await screen.findByText(/✅ درست|❌ غلط/)).toBeTruthy();

    const state = saved();
    expect(state.examBankAttempts?.length).toBe(1);
    expect(state.examBankAttempts[0].topicId).toBe("internal-cardio");
    // فقط متادیتای کوچک ذخیره می‌شود — نه متن سؤال/گزینه/پاسخنامه
    expect(Object.keys(state.examBankAttempts[0]).sort()).toEqual(
      ["at", "correct", "examType", "id", "ms", "questionId", "selectedIndex", "topicId", "topicTitle", "year"].sort(),
    );
  });

  it("نکات پاسخنامه را به فلش‌کارت با ارجاع به سؤال تبدیل می‌کند", async () => {
    seed();
    render(<App />);
    const dismiss = screen.queryByRole("button", { name: "بزن بریم! 🚀" });
    if (dismiss) fireEvent.click(dismiss);

    await openBank();
    fireEvent.click(screen.getAllByText(/قلب و عروق/)[0]);
    // حالت آزمونی: بدون بازخورد فوری، با امکان پایان زودهنگام و مرور
    fireEvent.click(screen.getByRole("button", { name: /📝 آزمونی/ }));
    fireEvent.click(screen.getByRole("button", { name: /^شروع آزمون/ }));
    const option = await screen.findByRole("button", { name: /^۱\)/ });
    fireEvent.click(option);

    // پایان آزمون → مرور پاسخ‌ها → تیکِ یک نکته → ساخت فلش‌کارت
    fireEvent.click(screen.getByRole("button", { name: /پایان زودهنگام آزمون/ }));
    const point = (await screen.findAllByRole("button", { name: /^☐/ }))[0];
    const pointLabel = point.textContent ?? "";
    fireEvent.click(point);
    fireEvent.click(screen.getAllByRole("button", { name: /افزودن نکته‌های انتخابی به فلش‌کارت/ })[0]);

    const state = saved();
    expect(state.flashcards?.length).toBe(1);
    expect(state.flashcards[0].sourceQuestion.year).toBeGreaterThanOrEqual(1390);
    expect(state.flashcards[0].sourceQuestion.year).toBeLessThanOrEqual(1500);
    expect(state.flashcards[0].sourceQuestion.questionId).toMatch(/^seed-/);
    expect(state.topics?.some((t: { name: string }) => t.name === "قلب و عروق")).toBe(true);
    expect(pointLabel.length).toBeGreaterThan(10);
  });
});
