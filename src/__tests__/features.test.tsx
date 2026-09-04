// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "../App";
import { ACHIEVEMENTS, ACHIEVEMENT_GROUPS } from "../lib/gamification";
import { QUOTES, quoteOfTheDay } from "../lib/quotes";
import { todayKey } from "../lib/jalali";

afterEach(cleanup);

describe("Features: quotes, achievements, accent color", () => {
  it("shows a daily motivational quote on the home page and can switch to the next one", () => {
    localStorage.clear();
    render(<App />);
    const today = todayKey();
    expect(screen.getByText(quoteOfTheDay(today).text)).toBeTruthy();

    // جمله‌ی بعدی
    fireEvent.click(screen.getByTitle("نمایش جمله‌ی بعدی"));
    expect(screen.getByText(quoteOfTheDay(today, 1).text)).toBeTruthy();
  });

  it("has a large, non-repeating quote pool and many grouped achievements", () => {
    expect(QUOTES.length).toBeGreaterThanOrEqual(150);
    expect(new Set(QUOTES.map((q) => q.text)).size).toBe(QUOTES.length);

    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(50);
    const groupIds = new Set(ACHIEVEMENTS.map((a) => a.group));
    expect(groupIds.size).toBeGreaterThanOrEqual(5);
    ACHIEVEMENT_GROUPS.forEach((g) => expect(groupIds.has(g.id)).toBe(true));
  });

  it("lets the user change the app accent color from settings", () => {
    localStorage.clear();
    render(<App />);

    fireEvent.click(screen.getByTitle("تنظیمات"));
    fireEvent.click(screen.getByTitle("آبی"));

    const saved = JSON.parse(localStorage.getItem("study-planner-v1")!);
    expect(saved.settings.accentColor).toBe("#2563eb");
    expect(document.documentElement.style.getPropertyValue("--acc-600")).toBe("#2563eb");
  });
});
