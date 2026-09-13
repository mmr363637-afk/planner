// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ErrorBoundary } from "../components/ErrorBoundary";

let boom = true;
function Boom() {
  if (boom) throw new Error("kaboom-test");
  return <div>recovered-ok</div>;
}

describe("ErrorBoundary (مرز خطای تب)", () => {
  it("کرش را می‌گیرد، بکاپ/خانه/تلاش‌مجدد کار می‌کنند", () => {
    const orig = console.error;
    console.error = () => {}; // سکوت لاگ کرشِ عمدی تست
    try {
      const onHome = vi.fn();
      const onBackup = vi.fn();
      boom = true;
      render(
        <ErrorBoundary tabName="آزمایشی" onHome={onHome} onBackup={onBackup}>
          <Boom />
        </ErrorBoundary>,
      );
      expect(screen.getByText(/خراب شد/)).toBeTruthy();
      expect(screen.getByText(/آزمایشی/)).toBeTruthy();
      fireEvent.click(screen.getByText(/بکاپ اضطراری/));
      expect(onBackup).toHaveBeenCalledOnce();
      fireEvent.click(screen.getByText(/رفتن به خانه/));
      expect(onHome).toHaveBeenCalledOnce();
      // تلاش دوباره بعد از رفع مشکل → صفحه برمی‌گردد
      boom = false;
      fireEvent.click(screen.getByText(/تلاش دوباره/));
      expect(screen.getByText("recovered-ok")).toBeTruthy();
    } finally {
      console.error = orig;
    }
  });
});
