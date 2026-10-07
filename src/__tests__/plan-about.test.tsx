// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { configure, fireEvent, render, screen } from "@testing-library/react";
configure({ asyncUtilTimeout: 10000 });
import App from "../App";
import { ABOUT_DEVELOPER_TEXT } from "../pages/Plan";

describe("Plan page › درباره سازنده", () => {
  it("shows the developer credit on every plan sub-tab", async () => {
    localStorage.clear();
    render(<App />);

    fireEvent.click(screen.getAllByText("برنامه")[0]);
    expect(await screen.findByText("درباره سازنده")).toBeTruthy();
    expect(screen.getByText(ABOUT_DEVELOPER_TEXT)).toBeTruthy();

    // «دروس»
    fireEvent.click(screen.getByText("دروس"));
    expect(screen.getByText(ABOUT_DEVELOPER_TEXT)).toBeTruthy();

    // «برنامه‌ها»
    fireEvent.click(screen.getByText("برنامه‌ها"));
    expect(screen.getByText(ABOUT_DEVELOPER_TEXT)).toBeTruthy();
  });

  // 🐛→✅ قبلاً ردیفِ زیرتب‌ها (روز من/تقویم/برنامه‌ها/…) و «دربارهٔ سازنده» بدون
  // no-print بودند؛ موقع چاپ «روز من» همین‌ها هم در فایل PDF ظاهر می‌شدند.
  it("sub-tab navigation and developer credit are hidden from print output", () => {
    localStorage.clear();
    const { container } = render(<App />);
    fireEvent.click(screen.getAllByText("برنامه")[0]);
    const subTabNav = screen.getByText("🌤️ روز من").closest(".no-print");
    expect(subTabNav).toBeTruthy();
    const creditSection = screen.getByText(ABOUT_DEVELOPER_TEXT).closest("section.no-print");
    expect(creditSection).toBeTruthy();
    expect(container).toBeTruthy();
  });
});
