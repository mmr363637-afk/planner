// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AboutAppButton from "../components/AboutAppButton";
import { APP_VERSION, faVersion } from "../lib/appVersion";

afterEach(cleanup);

describe("About this app", () => {
  it("shows the developer, current version and a safe explicit Telegram link", () => {
    render(<AboutAppButton />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "دربارهٔ این اپ" }));
    expect(screen.getByRole("dialog", { name: "دربارهٔ این اپ" })).toBeTruthy();
    expect(screen.getByText("مهدی محمدرحیمی", { exact: true })).toBeTruthy();
    expect(
      screen.getByText(`نسخهٔ ${faVersion(APP_VERSION)} · فارسی و راست‌به‌چپ`),
    ).toBeTruthy();
    const link = screen.getByRole("link", {
      name: "ارتباط در تلگرام @Mahdimr3",
    });
    expect(link.getAttribute("href")).toBe("https://t.me/Mahdimr3");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
  it("reopens release notes and closes only the top dialog with Escape", () => {
    render(<AboutAppButton />);
    const entry = screen.getByRole("button", { name: "دربارهٔ این اپ" });
    entry.focus();
    fireEvent.click(entry);
    fireEvent.click(screen.getByRole("button", { name: "تغییرات نسخهٔ فعلی" }));
    expect(screen.getByRole("dialog", { name: "✨ چی جدیده؟" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "✨ چی جدیده؟" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "دربارهٔ این اپ" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(entry);
  });
});
