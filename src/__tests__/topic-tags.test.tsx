// @vitest-environment jsdom
import { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StoreProvider } from "../store";
import NotesPanel from "../components/NotesPanel";
import { todayKey } from "../lib/jalali";

/**
 * برچسب‌های مبحث («فوری / امتحان / مرور / ضعیفم / بلدم»).
 *
 * این قابلیت یک بار فقط «نمایش» و «فیلتر» داشت: چیپ‌ها خوانده می‌شدند ولی هیچ‌جا
 * `toggleTopicTag` صدا زده نمی‌شد، پس کاربر هیچ‌وقت نمی‌توانست برچسبی ثبت کند و
 * همه‌ی شمارنده‌ها صفر می‌ماندند. این تست همان رگرس است.
 */

const wrapper = ({ children }: { children: ReactNode }) => <StoreProvider>{children}</StoreProvider>;

const seed = () => {
  localStorage.setItem(
    "study-planner-v1",
    JSON.stringify({
      subjects: [{ id: "subject", name: "فارماکو", color: "#0d9488", priority: "medium", createdAt: 1 }],
      topics: [
        { id: "topic", subjectId: "subject", name: "استاتین‌ها", volume: 5, estimatedMinutes: 40, priority: "medium", difficulty: 2, status: "not_started", createdAt: 1 },
        { id: "topic-2", subjectId: "subject", name: "دیگوکسین", volume: 3, estimatedMinutes: 20, priority: "low", difficulty: 1, status: "not_started", createdAt: 1 },
      ],
      notes: [{ id: "note-1", topicId: "topic", text: "نکتهٔ قدیمی", createdAt: Date.now() }],
      tasks: [],
      reviews: [],
      sessions: [],
      flashcards: [],
      exams: [],
      plans: [],
    }),
  );
};

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  seed();
});
afterEach(cleanup);

const savedTags = (): string[] => {
  const s = JSON.parse(localStorage.getItem("study-planner-v1")!);
  return s.topics.find((t: { id: string }) => t.id === "topic").tags ?? [];
};

describe("برچسب‌های مبحث", () => {
  it("با لمس چیپ، برچسب روی مبحث ذخیره می‌شود", () => {
    render(<NotesPanel topicId="topic" />, { wrapper });

    const chip = screen.getAllByRole("button", { name: /ضعیفم/ })[0];
    fireEvent.click(chip);

    expect(savedTags()).toContain("weak");
    expect(screen.getByText("۱ برچسب")).toBeTruthy();
  });

  it("لمس دوباره همان برچسب را برمی‌دارد", () => {
    render(<NotesPanel topicId="topic" />, { wrapper });

    const chip = screen.getAllByRole("button", { name: /ضعیفم/ })[0];
    fireEvent.click(chip);
    fireEvent.click(screen.getAllByRole("button", { name: /ضعیفم/ })[0]);

    expect(savedTags()).not.toContain("weak");
    expect(screen.getByText("بدون برچسب")).toBeTruthy();
  });

  it("چیپ فیلتر، شمارش مباحثِ برچسب‌خورده را به‌روز می‌کند", () => {
    render(<NotesPanel topicId="topic" />, { wrapper });
    fireEvent.click(screen.getAllByRole("button", { name: /ضعیفم/ })[0]);

    const counter = screen.getByRole("button", { name: `⚠️ ضعیفم (۱)` });
    expect(counter).toBeTruthy();
  });

  it("بدون مبحثِ انتخاب‌شده، راهنمای برچسب‌گذاری نشان داده می‌شود", () => {
    render(<NotesPanel topicId={undefined} />, { wrapper });
    expect(screen.getByText(/برای برچسب زدن مبحث/)).toBeTruthy();
  });

  it("یادداشت روی همان مبحث ذخیره می‌شود", () => {
    render(<NotesPanel topicId="topic" />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText(/یادداشت سریع/), { target: { value: "HF: شروع ۲۰mg" } });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));

    const s = JSON.parse(localStorage.getItem("study-planner-v1")!);
    expect(s.notes.some((n: { text: string }) => n.text === "HF: شروع ۲۰mg")).toBe(true);
    expect(todayKey()).toBeTruthy();
  });
});
