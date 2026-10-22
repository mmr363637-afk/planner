// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "../App";
import { keyToJalali, toFa, todayKey } from "../lib/jalali";

const expectedAge = keyToJalali(todayKey()).jy - 1375;
import { STORAGE_KEY } from "../lib/persist";

afterEach(cleanup);

const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!);

function seed(extra: Record<string, unknown> = {}) {
  localStorage.clear();
  const { jm, jd } = keyToJalali(todayKey());
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      subjects: [],
      topics: [],
      settings: { onboarded: true, birthday: { month: jm, day: jd, year: 1375 }, ...extra },
    }),
  );
}

function renderHome() {
  render(<App />);
  const dismiss = screen.queryByRole("button", { name: "بزن بریم! 🚀" });
  if (dismiss) fireEvent.click(dismiss);
}

describe("تبریک تولد", () => {
  it("در روز تولد (تاریخ محلی شمسی) بنر تبریک با سن نشان می‌دهد", () => {
    seed();
    renderHome();
    expect(screen.getByText(new RegExp(`${toFa(expectedAge)} سالگی‌ات مبارک`))).toBeTruthy();
    expect(screen.getByRole("button", { name: "ممنون 🎉" })).toBeTruthy();
  });

  it("بعد از «ممنون» دیگر تکرار نمی‌شود و تاریخِ تبریک ذخیره می‌شود", () => {
    seed();
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "ممنون 🎉" }));
    expect(screen.queryByText(/سالگی‌ات مبارک/)).toBeNull();
    expect(saved().settings.lastBirthdayGreeted).toBe(todayKey());
  });

  it("اگر امروز تولد نباشد هیچ بنری نشان داده نمی‌شود", () => {
    const { jm, jd } = keyToJalali(todayKey());
    const otherDay = jd === 1 ? 2 : 1;
    seed({ birthday: { month: jm, day: otherDay } });
    renderHome();
    expect(screen.queryByText(/تولدت مبارک|سالگی‌ات مبارک/)).toBeNull();
  });

  it("تاریخ تولد نامعتبر (ماه ۱۳) نادیده گرفته می‌شود و اپ بدون کرش بالا می‌آید", () => {
    seed({ birthday: { month: 13, day: 1 } });
    renderHome();
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.queryByText(/تولدت مبارک|سالگی‌ات مبارک/)).toBeNull();
  });

  it("دکمهٔ «دیگر نشانم نده» تاریخ تولد را پاک می‌کند", () => {
    seed();
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "دیگر نشانم نده" }));
    expect(saved().settings.birthday).toBeUndefined();
    expect(screen.queryByText(/سالگی‌ات مبارک/)).toBeNull();
  });

  it("سال نبودنِ تاریخ تولد هم پشتیبانی می‌شود (بدون سن)", () => {
    const { jm, jd } = keyToJalali(todayKey());
    seed({ birthday: { month: jm, day: jd } });
    renderHome();
    expect(screen.getAllByText(/تولدت مبارک!/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/سالگی/)).toBeNull();
  });

  it("با روزِ تبریکِ ثبت‌شده برای امروز، بنر دوباره ظاهر نمی‌شود", () => {
    seed({ lastBirthdayGreeted: todayKey() });
    renderHome();
    expect(screen.queryByText(/سالگی‌ات مبارک/)).toBeNull();
    // داده دست‌نخورده می‌ماند
    expect(saved().settings.lastBirthdayGreeted).toBe(todayKey());
  });

  it("اعداد بنر با ارقام فارسی نمایش داده می‌شوند", () => {
    seed();
    renderHome();
    expect(screen.getAllByText(new RegExp(toFa(expectedAge))).length).toBeGreaterThan(0);
  });
});
