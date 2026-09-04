// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import App from "../App";
import { ABOUT_DEVELOPER_TEXT } from "../pages/Plan";

describe("Plan page › درباره سازنده", () => {
  it("shows the developer credit on every plan sub-tab", () => {
    localStorage.clear();
    render(<App />);

    fireEvent.click(screen.getAllByText("برنامه")[0]);
    expect(screen.getByText("درباره سازنده")).toBeTruthy();
    expect(screen.getByText(ABOUT_DEVELOPER_TEXT)).toBeTruthy();

    // «دروس»
    fireEvent.click(screen.getByText("دروس"));
    expect(screen.getByText(ABOUT_DEVELOPER_TEXT)).toBeTruthy();

    // «برنامه‌ها»
    fireEvent.click(screen.getByText("برنامه‌ها"));
    expect(screen.getByText(ABOUT_DEVELOPER_TEXT)).toBeTruthy();
  });
});
