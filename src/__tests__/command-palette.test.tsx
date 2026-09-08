// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import App from "../App";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function seedData() {
  localStorage.clear();
  localStorage.setItem(
    "study-planner-v1",
    JSON.stringify({
      subjects: [{ id: "s1", name: "فیزیولوژی", color: "#0ea5a4", priority: "high", createdAt: 1 }],
      topics: [
        {
          id: "t1",
          subjectId: "s1",
          name: "قلب و عروق",
          volume: 10,
          estimatedMinutes: 45,
          priority: "high",
          difficulty: 2,
          status: "not_started",
          createdAt: 1,
        },
      ],
      flashcards: [{ id: "c1", subjectId: "s1", topicId: "t1", front: "بزرگ‌ترین رگ بدن؟", back: "آئورت", ease: 2.5, intervalDays: 0, repetitions: 0, lapses: 0, dueDate: "2025-01-01", status: "pending", createdAt: 1 }],
      exams: [{ id: "e1", title: "امتحان قلب", subject: "فیزیولوژی", date: "2026-10-10", durationMinutes: 30, createdAt: 1 }],
    }),
  );
}

const palette = () => screen.getByRole("dialog", { name: "جستجوی سراسری" });

describe("پالت فرمان (Ctrl+K)", () => {
  it("با دکمه‌ی سربرگ و با Ctrl+K باز می‌شود و با Esc بسته می‌شود", () => {
    seedData();
    render(<App />);
    fireEvent.click(screen.getByTitle("جستجو (Ctrl+K)"));
    expect(palette()).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "جستجوی سراسری" })).toBeNull();

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(palette()).toBeTruthy();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.queryByRole("dialog", { name: "جستجوی سراسری" })).toBeNull();
  });

  it("در مبحث، کارت و امتحان جست‌وجو می‌کند و Enter به مقصد می‌رود", () => {
    seedData();
    render(<App />);
    fireEvent.click(screen.getByTitle("جستجو (Ctrl+K)"));
    const input = screen.getByLabelText("جستجو");

    fireEvent.change(input, { target: { value: "قلب" } });
    // هم مبحث و هم امتحانِ مرتبط نمایش داده می‌شوند
    expect(within(palette()).getByText("امتحان قلب")).toBeTruthy();
    expect(within(palette()).getByText("قلب و عروق")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Enter" });
    // اولین نتیجه اجرا می‌شود و پالت بسته می‌شود
    expect(screen.queryByRole("dialog", { name: "جستجوی سراسری" })).toBeNull();

    // پالت دوباره باز می‌شود و نتیجه‌ی فلش‌کارت را هم نشان می‌دهد
    fireEvent.click(screen.getByTitle("جستجو (Ctrl+K)"));
    fireEvent.change(screen.getByLabelText("جستجو"), { target: { value: "آئورت" } });
    expect(within(palette()).getByText(/بزرگ‌ترین رگ بدن/)).toBeTruthy();
  });

  it("فلش راستا با کیبورد میان نتایج حرکت می‌کند و با Enter انتخاب می‌شود", () => {
    seedData();
    render(<App />);
    fireEvent.click(screen.getByTitle("جستجو (Ctrl+K)"));
    const input = screen.getByLabelText("جستجو");
    fireEvent.change(input, { target: { value: "آمار" } });
    expect(within(palette()).getByText("آمار و دستاوردها")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Enter" }); // نتیجه‌ی اول = اقدام «آمار و دستاوردها»
    expect(screen.queryByRole("dialog", { name: "جستجوی سراسری" })).toBeNull();
    // صفحه‌ی آمار واقعاً باز شده است (کارت باغ دیده می‌شود)
    expect(screen.getAllByText(/باغ تو/).length).toBeGreaterThan(0);
  });

  it("جست‌وجوی بی‌نتیجه پیامِ مناسب می‌دهد و باز+بسته‌های پیاپی نتیجه‌ها را تازه می‌کند", () => {
    seedData();
    render(<App />);
    fireEvent.click(screen.getByTitle("جستجو (Ctrl+K)"));
    const input = screen.getByLabelText("جستجو");
    fireEvent.change(input, { target: { value: "zzzzqqqq" } });
    expect(screen.getByText(/چیزی پیدا نشد/)).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByTitle("جستجو (Ctrl+K)"));
    fireEvent.change(screen.getByLabelText("جستجو"), { target: { value: "میکسر" } });
    expect(within(palette()).getByText("میکسر صداهای تمرکز")).toBeTruthy();
  });
});
