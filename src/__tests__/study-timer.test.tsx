// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { StoreProvider, useStore } from "../store";
import { useStudyTimer } from "../components/useStudyTimer";
import { STORAGE_KEY } from "../lib/persist";

function TimerProbe() {
  const timer = useStudyTimer({ trackId: "lesson:timer-test" });
  const { state } = useStore();
  const creditedMinutes = state.sessions
    .filter((session) => session.lessonId === "lesson:timer-test")
    .reduce((sum, session) => sum + session.durationMinutes, 0);
  return (
    <div>
      <span data-testid="active-seconds">{timer.totalSeconds}</span>
      <span data-testid="daily-minutes">{creditedMinutes}</span>
    </div>
  );
}

let monotonicTime = 0;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ subjects: [], topics: [], flashcards: [], settings: { onboarded: true } }));
  monotonicTime = 0;
  vi.useFakeTimers();
  vi.spyOn(performance, "now").mockImplementation(() => monotonicTime);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("تایمرِ زمانِ واقعیِ درسنامه", () => {
  it("با تیکِ مرورگرِ به‌تعویق‌افتاده، کلِ زمانِ فعال را بر اساسِ ساعتِ یکنواخت حساب می‌کند", () => {
    render(
      <StoreProvider>
        <TimerProbe />
      </StoreProvider>,
    );

    // یک گوشی/تب می‌تواند setInterval را مدت‌ها عقب بیندازد؛ مرورگر فقط یک تیک
    // می‌فرستد، اما performance.now نشان می‌دهد ۹۰ دقیقهٔ فعال گذشته است.
    monotonicTime = 90 * 60 * 1000;
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByTestId("active-seconds").textContent).toBe("5400");
    expect(screen.getByTestId("daily-minutes").textContent).toBe("90");
  });
});
