// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "../App";

afterEach(cleanup);

describe("برنامه هوشمند (سرتاسری)", () => {
  it("با ویزارد هوشمند برنامه می‌سازد و تسک‌ها نوع‌دار می‌شوند", () => {
    localStorage.clear();
    render(<App />);

    // آنبوردینگ: قالب کنکور، کتابخانه می‌سازد
    fireEvent.click(screen.getByText("بعدی"));
    fireEvent.click(screen.getByText("بعدی"));
    fireEvent.click(screen.getByText("🚀 بساز و شروع کن"));
    fireEvent.click(screen.getByText("فعلاً خودم می‌گردم"));

    // رفتن به برنامه‌ها و باز کردن ویزارد هوشمند
    fireEvent.click(screen.getAllByText("برنامه")[0]);
    fireEvent.click(screen.getByText("برنامه‌ها"));
    fireEvent.click(screen.getByText("✨ ساخت برنامه هوشمند"));

    // قدم ۱: هدف
    fireEvent.change(screen.getByPlaceholderText("مثلاً جمع‌بندی قلب برای امتحان ارتقا"), { target: { value: "تست هوشمند" } });
    fireEvent.click(screen.getByText("بعدی"));

    // قدم ۲: انتخاب درس
    fireEvent.click(screen.getByText("زیست‌شناسی"));
    expect(screen.getByText(/مجموع:/)).toBeTruthy();
    fireEvent.click(screen.getByText("بعدی"));

    // قدم ۳: پیش‌نمایش هوشمند با توضیح «چرا»
    expect(screen.getByText("🧠 چرا این‌طور چیده شد؟")).toBeTruthy();
    // دکمه‌ی فوتر مودال (دکمه‌ی هم‌نامِ پس‌زمینه هم در DOM هست)
    const smartBtns = screen.getAllByText("✨ ساخت برنامه هوشمند");
    fireEvent.click(smartBtns[smartBtns.length - 1]);

    // بررسی ذخیره‌سازی
    const saved = JSON.parse(localStorage.getItem("study-planner-v1")!);
    expect(saved.plans.length).toBe(1);
    expect(saved.plans[0].goal).toBe("تست هوشمند");
    expect(saved.plans[0].smart).toBeTruthy();
    expect(saved.plans[0].smartNotes.length).toBeGreaterThan(0);
    const tasks = saved.tasks.filter((t: { planId: string }) => t.planId === saved.plans[0].id);
    expect(tasks.length).toBeGreaterThan(5);
    // همه‌ی تسک‌ها نوع و برچسب دارند
    expect(tasks.every((t: { kind: string; label: string }) => t.kind && t.label)).toBe(true);
    const kinds = new Set(tasks.map((t: { kind: string }) => t.kind));
    expect(kinds.has("learn")).toBe(true);
    expect(kinds.has("test")).toBe(true); // زیست تست‌محور است
    expect(kinds.has("review")).toBe(true); // مرور خودکار
    // مدل درس روی خودِ درس هم ذخیره شده
    expect(saved.subjects.find((s: { name: string }) => s.name === "زیست‌شناسی").approach).toBe("qbank");
  });
});
