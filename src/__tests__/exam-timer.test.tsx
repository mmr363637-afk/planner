// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../App";
import { addDays, todayKey } from "../lib/jalali";

afterEach(cleanup);

const EXAM_DATE = addDays(todayKey(), 3);

/** وضعیت اولیه‌ی ذخیره‌شده با یک امتحانِ دارای ساعت، سه روز بعد */
function seedExam(settings: Record<string, unknown> = {}) {
  localStorage.setItem(
    "study-planner-v1",
    JSON.stringify({
      exams: [{ id: "x1", title: "فیزیولوژی", date: EXAM_DATE, time: "08:30", color: "#ef4444", createdAt: 1 }],
      settings,
    }),
  );
}

function savedState() {
  return JSON.parse(localStorage.getItem("study-planner-v1")!);
}

/** مقدارِ خانه‌ی تایمر با عنوان داده‌شده (مثلاً «ثانیه») */
function tileValue(label: string): string {
  const el = screen.getByText(label);
  return el.parentElement?.firstElementChild?.textContent ?? "";
}

describe("ساعت امتحان", () => {
  it("از فرمِ افزودن امتحان می‌شود ساعت ثبت کرد و ذخیره می‌شود", () => {
    localStorage.clear();
    render(<App />);

    fireEvent.click(screen.getAllByText("امتحانات")[0]);
    fireEvent.click(screen.getByText(/افزودن امتحان در/));
    fireEvent.change(screen.getByPlaceholderText("مثلاً فیزیولوژی"), { target: { value: "ریاضی" } });
    // ساعت‌های آماده برای انتخاب سریع
    fireEvent.click(screen.getByRole("button", { name: "۰۸:۰۰" }));
    fireEvent.click(screen.getByRole("button", { name: "افزودن" }));

    const saved = savedState();
    expect(saved.exams).toHaveLength(1);
    expect(saved.exams[0].title).toBe("ریاضی");
    expect(saved.exams[0].time).toBe("08:00");
    // ساعت روی همان ردیف هم نمایش داده می‌شود
    expect(screen.getAllByText(/۰۸:۰۰/).length).toBeGreaterThan(0);
  });

  it("ساعت اختیاری است و با «حذف ساعت» پاک می‌شود", () => {
    seedExam();
    render(<App />);

    fireEvent.click(screen.getAllByText("امتحانات")[0]);
    fireEvent.click(screen.getAllByText("فیزیولوژی")[0]);
    expect(screen.getByDisplayValue("08:30")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "حذف ساعت" }));
    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));

    expect(savedState().exams[0].time).toBeUndefined();
  });

  it("هنگام ویرایش، ساعت را می‌شود عوض کرد", () => {
    seedExam();
    render(<App />);

    fireEvent.click(screen.getAllByText("امتحانات")[0]);
    fireEvent.click(screen.getAllByText("فیزیولوژی")[0]);
    fireEvent.change(screen.getByDisplayValue("08:30"), { target: { value: "10:15" } });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));

    expect(savedState().exams[0].time).toBe("10:15");
    expect(screen.getAllByText(/۱۰:۱۵/).length).toBeGreaterThan(0);
  });
});

describe("تایمر شمارش معکوس در صفحه اصلی", () => {
  it("کارت تایمر با روز/ساعت/دقیقه/ثانیه نمایش داده می‌شود و زنده می‌شمارد", async () => {
    seedExam();
    render(<App />);

    expect(screen.getByText("تا امتحان «فیزیولوژی»")).toBeTruthy();
    for (const label of ["روز", "ساعت", "دقیقه", "ثانیه"]) expect(screen.getByText(label)).toBeTruthy();

    const before = tileValue("ثانیه");
    await waitFor(() => expect(tileValue("ثانیه")).not.toBe(before), { timeout: 3000 });
  });

  it("با خاموش‌کردن کلیدِ تنظیمات، تایمر از صفحه اصلی ناپدید می‌شود", () => {
    seedExam();
    render(<App />);
    expect(screen.getByText("تا امتحان «فیزیولوژی»")).toBeTruthy();

    fireEvent.click(screen.getByTitle("تنظیمات"));
    const toggle = screen.getByRole("switch", { name: "تایمر شمارش معکوس امتحان" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(savedState().settings.examTimer.enabled).toBe(false);

    fireEvent.click(screen.getAllByText("خانه")[0]);
    expect(screen.queryByText("تا امتحان «فیزیولوژی»")).toBeNull();
    // ولی خودِ امتحان سر جایش می‌ماند
    expect(screen.getByText("امتحانات پیش‌رو")).toBeTruthy();
  });

  it("کلید «نمایش ساعت امتحان» ساعت را از فهرست‌ها برمی‌دارد", () => {
    seedExam();
    render(<App />);
    expect(screen.getAllByText(/۰۸:۳۰/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTitle("تنظیمات"));
    fireEvent.click(screen.getByRole("switch", { name: "نمایش ساعت امتحان" }));
    expect(savedState().settings.examTimer.showTime).toBe(false);

    fireEvent.click(screen.getAllByText("خانه")[0]);
    expect(screen.queryAllByText(/۰۸:۳۰/)).toHaveLength(0);
  });

  it("تنظیمات تایمر امتحان در پشتیبان/بازیابی هم می‌ماند", () => {
    seedExam({ examTimer: { enabled: false, showTime: false, oneHourAlert: false } });
    render(<App />);
    // کلید خاموش است ⇒ کارت تایمر نمایش داده نمی‌شود
    expect(screen.queryByText("تا امتحان «فیزیولوژی»")).toBeNull();
    expect(savedState().settings.examTimer.enabled).toBe(false);
  });

  it("برای امتحان بدون ساعت، تایمر «روز» محور می‌شود و راهنما نشان می‌دهد", () => {
    localStorage.setItem(
      "study-planner-v1",
      JSON.stringify({ exams: [{ id: "x2", title: "زیست", date: EXAM_DATE, createdAt: 1 }] }),
    );
    render(<App />);

    expect(screen.getByText("تا امتحان «زیست»")).toBeTruthy();
    expect(screen.getByText(/ساعت امتحان ثبت نشده/)).toBeTruthy();
  });
});
