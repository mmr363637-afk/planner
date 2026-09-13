// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, configure, render, screen, fireEvent } from "@testing-library/react";
import App from "../App";

afterEach(cleanup);
// صفحات lazy زیر بارِ موازیِ سوئیت ممکن است دیرتر از ۱ ثانیه بیایند
configure({ asyncUtilTimeout: 10000 });

describe("App smoke", () => {
  // آنبوردینگ اولین نصب را مثل یک کاربر واقعی کامل می‌کند (خودش lazy است)
  async function completeOnboarding() {
    fireEvent.click(await screen.findByText("بعدی")); // قدم ۱: انتخاب هدف
    fireEvent.click(screen.getByText("بعدی")); // قدم ۲: ساعت و امتحان
    fireEvent.click(screen.getByText("🚀 بساز و شروع کن"));
    fireEvent.click(screen.getByText("فعلاً خودم می‌گردم"));
  }

  it("renders dashboard, navigates, adds a subject/topic, starts and ends a session", async () => {
    localStorage.clear();
    render(<App />);
    expect(screen.getByText("کارهای امروز")).toBeTruthy();
    await completeOnboarding();

    fireEvent.click(screen.getAllByText("برنامه")[0]);
    fireEvent.click(await screen.findByText("دروس"));
    fireEvent.click(await screen.findByText("📚 افزودن / به‌روزرسانی نمونه‌های پزشکی"));
    expect(screen.getByText("عفونی")).toBeTruthy();
    fireEvent.click(screen.getByText("عفونی")); // long subject outlines start collapsed
    expect(screen.getAllByText("اندوکاردیت عفونی").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("برنامه‌ها"));
    fireEvent.click(await screen.findByText("برنامه دستی"));
    fireEvent.change(screen.getByPlaceholderText("مثلاً آمادگی امتحان عفونی"), { target: { value: "امتحان عفونی" } });
    fireEvent.click(screen.getByText("بعدی"));
    fireEvent.click(screen.getAllByText("عفونی")[0]);
    fireEvent.click(screen.getByText("بعدی"));
    fireEvent.click(screen.getByText("بعدی"));
    fireEvent.click(screen.getByText("ساخت برنامه"));
    const saved = JSON.parse(localStorage.getItem("study-planner-v1")!);
    expect(saved.plans.length).toBe(1);
    expect(saved.tasks.length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByText("مطالعه")[0]);
    fireEvent.click(await screen.findByText("اندوکاردیت عفونی"));
    fireEvent.click(await screen.findByRole("button", { name: /شروع مطالعه/ }));
    expect(await screen.findByText("در حال مطالعه")).toBeTruthy();
    fireEvent.click(screen.getByTitle("پایان"));
    await act(async () => {
      fireEvent.click(screen.getByText("کامل یاد گرفتم"));
    });
    const after = JSON.parse(localStorage.getItem("study-planner-v1")!);
    expect(after.sessions.length).toBe(1);
    expect(after.reviews.length).toBe(1);
    expect(after.activeSession).toBeNull();
    expect(after.achievements.some((a: { id: string }) => a.id === "first_session")).toBe(true);

    fireEvent.click(screen.getByText("بازگشت به خانه"));
    fireEvent.click(screen.getAllByText("مرور")[0]);
    expect(await screen.findByText("🟢 آینده")).toBeTruthy();

    fireEvent.click(screen.getAllByText("آمار")[0]);
    expect(await screen.findByText("مطالعه در ۷ روز اخیر")).toBeTruthy();
    fireEvent.click(screen.getByTitle("تنظیمات"));
    expect(await screen.findByText("پومودورو")).toBeTruthy();
  }, 30000);

  it("exams: mark an exam on the calendar and see its countdown on home", async () => {
    localStorage.clear();
    render(<App />);
    await completeOnboarding();

    // Navigate to the exams tab via the bottom navigation.
    fireEvent.click(screen.getAllByText("امتحانات")[0]);
    expect(await screen.findByText(/افزودن امتحان در/)).toBeTruthy();

    // Open the add-exam modal and create an exam.
    fireEvent.click(screen.getByText(/افزودن امتحان در/));
    fireEvent.change(screen.getByPlaceholderText("مثلاً فیزیولوژی"), { target: { value: "ریاضی" } });
    fireEvent.click(screen.getByRole("button", { name: "افزودن" }));

    const saved = JSON.parse(localStorage.getItem("study-planner-v1")!);
    expect(saved.exams.length).toBe(1);
    expect(saved.exams[0].title).toBe("ریاضی");
    expect(screen.getAllByText("ریاضی").length).toBeGreaterThan(0);

    // Back on the home page the upcoming-exam countdown is shown.
    fireEvent.click(screen.getAllByText("خانه")[0]);
    expect(screen.getByText("امتحانات پیش‌رو")).toBeTruthy();
    expect(screen.getByText("ریاضی")).toBeTruthy();
  });
});
