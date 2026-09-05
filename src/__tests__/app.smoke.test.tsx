// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen, fireEvent } from "@testing-library/react";
import App from "../App";

afterEach(cleanup);

describe("App smoke", () => {
  it("renders dashboard, navigates, adds a subject/topic, starts and ends a session", async () => {
    localStorage.clear();
    render(<App />);
    expect(screen.getByText("کارهای امروز")).toBeTruthy();

    fireEvent.click(screen.getAllByText("برنامه")[0]);
    fireEvent.click(screen.getByText("دروس"));
    fireEvent.click(screen.getByText("یا بارگذاری نمونه دروس پزشکی"));
    expect(screen.getByText("عفونی")).toBeTruthy();
    fireEvent.click(screen.getByText("عفونی")); // long subject outlines start collapsed
    expect(screen.getAllByText("اندوکاردیت عفونی").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("برنامه‌ها"));
    fireEvent.click(screen.getByText("ساخت اولین برنامه"));
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
    fireEvent.click(screen.getAllByText("اندوکاردیت عفونی")[0]);
    fireEvent.click(screen.getByRole("button", { name: /شروع مطالعه/ }));
    expect(screen.getByText("در حال مطالعه")).toBeTruthy();
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
    expect(screen.getByText("🟢 آینده")).toBeTruthy();

    fireEvent.click(screen.getAllByText("آمار")[0]);
    expect(screen.getByText("مطالعه در ۷ روز اخیر")).toBeTruthy();
    fireEvent.click(screen.getByTitle("تنظیمات"));
    expect(screen.getByText("پومودورو")).toBeTruthy();
  });

  it("exams: mark an exam on the calendar and see its countdown on home", async () => {
    localStorage.clear();
    render(<App />);

    // Navigate to the exams tab via the bottom navigation.
    fireEvent.click(screen.getAllByText("امتحانات")[0]);
    expect(screen.getByText(/افزودن امتحان در/)).toBeTruthy();

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
