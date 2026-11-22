// @vitest-environment jsdom
// 📱 نگهبانِ ریسپانسیو بودنِ صفحهٔ «دروس من» (هدر و ردیفِ مباحث).
// بعد از افزودنِ دکمهٔ «🎨 اسکچ‌نوت و آزمایشگاه»، ردیفِ دکمه‌ها با shrink-0 اجازهٔ شکستن
// نداشت و روی گوشی (~۳۶۰px) از پهنای صفحه بیرون می‌زد. این تست قرارداد را قفل می‌کند:
// ردیفِ دکمه‌ها در هدر باید w-full (در موبایل)، max-w-full، min-w-0 و flex-wrap داشته باشد
// و دیگر shrink-0 نباشد؛ هم در حالتِ خالی و هم پس از داشتنِ درس و مبحث.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "../App";

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function openSubjects() {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "برنامه" }));
  fireEvent.click(await screen.findByRole("button", { name: "دروس" }));
  return screen.findByRole("heading", { name: "دروس من" });
}

describe("📱 صفحهٔ «دروس من» روی گوشی", () => {
  it("ردیفِ دکمه‌های هدر می‌شکند و هرگز از پهنای صفحه بیرون نمی‌زند", async () => {
    const heading = await openSubjects();
    const row = heading.closest("div")?.parentElement as HTMLElement;
    expect(row).toBeTruthy();
    expect(row.className).toContain("flex-wrap");

    const actions = row.querySelector("div.flex") as HTMLElement;
    expect(actions).toBeTruthy();
    expect(actions.className).toContain("flex-wrap");
    expect(actions.className).toContain("min-w-0");
    expect(actions.className).toContain("max-w-full");
    expect(actions.className).toContain("w-full");
    expect(actions.className).not.toContain("shrink-0");

    // دکمهٔ تازه باید همان‌جا و درونِ همان ردیفِ قابل‌شکستن باشد
    const hubBtn = screen.getByRole("button", { name: /اسکچ‌نوت و آزمایشگاه/ });
    expect(hubBtn).toBeTruthy();
    expect(actions.contains(hubBtn)).toBe(true);
  });

  it("پس از افزودنِ درس و مبحث (۴ دکمه در هدر + ردیف مبحث) هم روی گوشی نمی‌ریزد بیرون", async () => {
    const heading = await openSubjects();
    fireEvent.click(await screen.findByRole("button", { name: "یا بارگذاری نمونه دروس پزشکی" }));

    // حالا هر ۴ دکمه در هدر هست — همچنان قابل‌شکستن و بدون shrink-0 روی ردیفِ دکمه‌ها
    const row = heading.closest("div")?.parentElement as HTMLElement;
    const actions = row.querySelector("div.flex") as HTMLElement;
    expect(actions.className).toContain("flex-wrap");
    expect(actions.className).toContain("w-full");
    expect(actions.className).not.toContain("shrink-0");
    expect(actions.contains(screen.getByRole("button", { name: /نقشه/ }))).toBe(true);
    expect(actions.contains(screen.getByRole("button", { name: /افزودن درس/ }))).toBe(true);

    // باز کردنِ اولین درس و بررسیِ اینکه ردیفِ مبحث هم روی گوشی قابل‌شکستن است
    const firstToggle = document.querySelector<HTMLButtonElement>('[aria-controls^="subject-topics-"]')!;
    fireEvent.click(firstToggle);
    const panelId = firstToggle.getAttribute("aria-controls")!;
    const panel = document.getElementById(panelId)!;
    const firstTopicRow = panel.querySelector("div.flex-wrap") as HTMLElement;
    expect(firstTopicRow).toBeTruthy();
    expect(firstTopicRow.className).toContain("flex-wrap");
  });
});
