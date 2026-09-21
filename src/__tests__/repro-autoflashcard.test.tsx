// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, configure, fireEvent, render, screen } from "@testing-library/react";
import App from "../App";

afterEach(cleanup);
configure({ asyncUtilTimeout: 10000 });

async function completeOnboarding() {
  fireEvent.click(await screen.findByText("بعدی"));
  fireEvent.click(screen.getByText("بعدی"));
  fireEvent.click(screen.getByText("🚀 بساز و شروع کن"));
  fireEvent.click(screen.getByText("فعلاً خودم می‌گردم"));
}

describe("repro: دکمه‌ی ساخت خودکار فلش‌کارت", () => {
  it("کلیک روی ساخت خودکار فلش‌کارت نباید ErrorBoundary تب را بشکند", async () => {
    localStorage.clear();
    render(<App />);
    await completeOnboarding();
    fireEvent.click(screen.getAllByText("مرور")[0]);
    fireEvent.click(await screen.findByRole("button", { name: "🃏 کارت‌ها" }));

    fireEvent.click(await screen.findByRole("button", { name: /ساخت خودکار فلش‌کارت از متن/ }));

    // اگر کرش کند، مرز خطای تب «مرور» نمایان می‌شود
    const crashed = screen.queryByText(/یه چیزی توی صفحه‌ی «مرور» خراب شد/);
    if (crashed) {
      const details = document.querySelector("pre");
      throw new Error(`CRASHED: ${details?.textContent ?? "?"}`);
    }
    // مودال باید آماده‌ی دریافت متن باشد
    expect(await screen.findByRole("button", { name: /🪄 تولید فلش‌کارت/ })).toBeTruthy();
  });
});
