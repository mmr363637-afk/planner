// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StoreProvider, ToastProvider } from "../store";
import TimetablePage from "../pages/Timetable";

afterEach(cleanup);

describe("چیدمان روزهای جدول هفتگی", () => {
  it("کلاس شنبه را زیر ستون شنبه نشان می‌دهد (نه ستون جمعه)", () => {
    localStorage.clear();
    localStorage.setItem("study-planner-v1", JSON.stringify({
      classBlocks: [{ id: "sat", title: "کلاس شنبه", weekday: 6, startMin: 480, endMin: 600, createdAt: 1 }],
      settings: { onboarded: true },
    }));

    render(
      <ToastProvider>
        <StoreProvider><TimetablePage /></StoreProvider>
      </ToastProvider>,
    );

    const columns = screen.getByRole("group", { name: "ستون‌های روزهای هفته" });
    expect(columns.getAttribute("dir")).toBe("rtl");
    expect(columns.firstElementChild?.getAttribute("aria-label")).toContain("شنبه");
    expect(columns.firstElementChild?.textContent).toContain("کلاس شنبه");
    expect(screen.getByRole("button", { name: "شنبه" })).toBeTruthy();
  });
});
