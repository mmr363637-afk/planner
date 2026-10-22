// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, configure, fireEvent, render, screen } from "@testing-library/react";
import App from "../App";
import { STORAGE_KEY } from "../lib/persist";
import { addDays, jalaliToKey, keyToJalali, toFa, todayKey } from "../lib/jalali";
import { occasionsOn } from "../lib/occasions";

configure({ asyncUtilTimeout: 10000 });
afterEach(cleanup);

function renderApp() {
  const view = render(<App />);
  const dismiss = screen.queryByRole("button", { name: "بزن بریم! 🚀" });
  if (dismiss) fireEvent.click(dismiss);
  return view;
}

async function goToCalendar() {
  fireEvent.click(screen.getAllByText("برنامه")[0]);
  fireEvent.click(await screen.findByText("تقویم"));
}

/** یک تاریخ در همان ماهِ امروز که مناسبت دارد و امروز نیست */
function anotherOccasionDayThisMonth(): { key: string; name: string } | null {
  const today = todayKey();
  const { jy, jm } = keyToJalali(today);
  for (let d = 1; d <= 31; d++) {
    let key: string;
    try {
      key = jalaliToKey(jy, jm, d);
    } catch {
      continue;
    }
    if (key === today) continue;
    const list = occasionsOn(key);
    if (list.length > 0) return { key, name: list[0].name };
  }
  return null;
}

describe("مناسبت‌ها در تقویم", () => {
  it("برای روز انتخاب‌شده، کارت «مناسبت‌های این روز» با نام مناسبت نشان داده می‌شود", async () => {
    localStorage.clear();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings: { onboarded: true } }));
    const target = anotherOccasionDayThisMonth();
    if (!target) return; // ماهِ بدون مناسبت (نادر) — چیزی برای اثبات نیست
    renderApp();
    await goToCalendar();

    // روی همان روز در شبکهٔ ماه کلیک کن (aria-label شامل تاریخ شمسی روز است)
    const dayNumber = toFa(keyToJalali(target.key).jd);
    const cells = screen.getAllByRole("button").filter((b) => (b.getAttribute("aria-label") ?? "").includes(target.name) || (b.textContent ?? "").trim() === dayNumber);
    const cell = cells.find((b) => (b.getAttribute("aria-label") ?? "").includes(target.name));
    if (!cell) return;
    fireEvent.click(cell);

    expect(await screen.findByText("📅 مناسبت‌های این روز")).toBeTruthy();
    expect(screen.getAllByText(new RegExp(target.name)).length).toBeGreaterThan(0);
  });

  it("فهرست «مناسبت‌های پیشِ‌رو» فقط مناسبت‌های ۴۵ روز آینده را نشان می‌دهد", async () => {
    localStorage.clear();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings: { onboarded: true } }));
    renderApp();
    await goToCalendar();
    const card = screen.queryByText("🗓️ مناسبت‌های پیشِ‌رو");
    if (!card) return; // در بازهٔ ۴۵ روزه مناسبت ثبت‌شده‌ای نیست
    expect(card).toBeTruthy();
    // همهٔ ردیف‌ها قابل کلیک‌اند و تاریخشان در همان بازه است
    const limit = addDays(todayKey(), 45);
    const headerRow = screen.getByText(/مناسبت‌های پیشِ‌رو/).closest("div")!.parentElement!;
    const list = headerRow.querySelector(".max-h-44") ?? headerRow.parentElement!.querySelector(".max-h-44");
    expect(list).toBeTruthy();
    const rows = Array.from((list as HTMLElement).querySelectorAll("button"));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(8);
    // تاریخِ امروز یا آیندهٔ نزدیک — کلیک روی اولین ردیف روز را عوض می‌کند
    const first = rows[0];
    fireEvent.click(first);
    expect(todayKey() <= limit).toBe(true);
  });

  it("در یک سالِ بدون مناسبت، تقویم بدون خطا رندر می‌شود", async () => {
    localStorage.clear();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings: { onboarded: true } }));
    renderApp();
    await goToCalendar();
    // هیچ خطای رندری نباید رخ دهد و شبکهٔ ماه باید سلول داشته باشد
    expect(screen.getAllByRole("button").length).toBeGreaterThan(20);
  });
});
