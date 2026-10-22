// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, configure, fireEvent, render, screen, within } from "@testing-library/react";
import App from "../App";
import { addDays, todayKey } from "../lib/jalali";
import { STORAGE_KEY } from "../lib/persist";

configure({ asyncUtilTimeout: 10000 });
afterEach(cleanup);

const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!);
const today = todayKey();

function seedPlan() {
  localStorage.clear();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      subjects: [{ id: "s1", name: "قلب", color: "#f00", priority: "high", createdAt: 1 }],
      topics: [
        { id: "t1", subjectId: "s1", name: "آریتمی", volume: 10, estimatedMinutes: 120, priority: "medium", difficulty: 2, status: "learning", createdAt: 1 },
        { id: "t2", subjectId: "s1", name: "نارسایی قلبی", volume: 10, estimatedMinutes: 120, priority: "medium", difficulty: 2, status: "not_started", createdAt: 1 },
      ],
      plans: [
        {
          id: "p1",
          goal: "مرور قلب",
          startDate: addDays(today, -2),
          endDate: addDays(today, 6),
          topicIds: ["t1"],
          studyDays: [0, 1, 2, 3, 4, 5, 6],
          dailyMinutes: 120,
          createdAt: 1,
          archived: false,
        },
      ],
      tasks: [
        { id: "done1", planId: "p1", topicId: "t1", date: addDays(today, -1), kind: "learn", label: "یادگیری", plannedMinutes: 60, doneMinutes: 60, status: "done", order: 0, priority: "medium" },
        { id: "pend1", planId: "p1", topicId: "t1", date: today, kind: "review", label: "مرور", plannedMinutes: 30, doneMinutes: 0, status: "pending", order: 0, priority: "medium" },
      ],
      settings: { onboarded: true },
    }),
  );
}

async function openPlanEdit() {
  fireEvent.click(screen.getAllByText("برنامه")[0]);
  fireEvent.click(await screen.findByText("برنامه‌ها"));
  fireEvent.click(await screen.findByTitle("ویرایش برنامه — افزودن/حذف مبحث، بازه و زمان"));
  return screen.findByText("مباحث برنامه");
}

describe("ویرایش برنامهٔ موجود", () => {
  it("مبحث تازه اضافه می‌شود، کارِ انجام‌شده حفظ و کارِ باقی‌مانده بازچینش می‌شود", async () => {
    seedPlan();
    render(<App />);
    await openPlanEdit();

    // مبحث دوم را اضافه کن
    const addRow = screen.getByText("نارسایی قلبی").closest("div.flex") as HTMLElement;
    fireEvent.click(within(addRow).getByRole("button", { name: "افزودن" }));
    expect(screen.getByText(/۱ افزوده/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "ذخیره و بازچینش" }));

    await new Promise((r) => setTimeout(r, 50));
    const state = saved();
    expect(state.plans[0].topicIds).toContain("t2");
    // تسک انجام‌شدهٔ قبلی با همان شناسه و وضعیت می‌ماند
    const done = state.tasks.find((t: { id: string }) => t.id === "done1");
    expect(done?.status).toBe("done");
    // تسک‌های کارِ باقی‌مانده دوباره ساخته شده‌اند و مبحث تازه در برنامه هست
    const pending = state.tasks.filter((t: { status: string }) => t.status === "pending");
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.some((t: { topicId: string }) => t.topicId === "t2")).toBe(true);
  }, 30000);

  it("حذف مبحث، کارِ انجام‌شدهٔ آن را پاک نمی‌کند ولی کارِ آینده‌اش را برمی‌دارد", async () => {
    seedPlan();
    render(<App />);
    await openPlanEdit();

    const removeRow = screen.getByText("آریتمی").closest("div.flex") as HTMLElement;
    fireEvent.click(within(removeRow).getByRole("button", { name: "حذف" }));
    // هنوز مبحثی نمانده؟ مبحث دوم را اضافه کن تا برنامه معتبر بماند
    const addRow = screen.getByText("نارسایی قلبی").closest("div.flex") as HTMLElement;
    fireEvent.click(within(addRow).getByRole("button", { name: "افزودن" }));
    fireEvent.click(screen.getByRole("button", { name: "ذخیره و بازچینش" }));

    await new Promise((r) => setTimeout(r, 50));
    const state = saved();
    expect(state.plans[0].topicIds).not.toContain("t1");
    expect(state.tasks.find((t: { id: string }) => t.id === "done1")).toBeTruthy();
    expect(state.tasks.find((t: { id: string }) => t.id === "pend1")).toBeFalsy();
  }, 30000);

  it("تغییر اولویت مبحث در ویرایش، پس از ذخیره روی مبحث می‌ماند", async () => {
    seedPlan();
    render(<App />);
    await openPlanEdit();

    const row = screen.getByText("آریتمی").closest("div.flex") as HTMLElement;
    fireEvent.change(within(row).getByLabelText("اولویت آریتمی"), { target: { value: "high" } });
    // هنوز ذخیره نشده؛ ولی تغییر در فرم ثبت شده
    fireEvent.click(screen.getByRole("button", { name: "ذخیره و بازچینش" }));

    await new Promise((r) => setTimeout(r, 50));
    expect(saved().topics.find((t: { id: string }) => t.id === "t1").priority).toBe("high");
  }, 30000);

  it("بدون مبحث، دکمهٔ ذخیره غیرفعال است", async () => {
    seedPlan();
    render(<App />);
    await openPlanEdit();
    const removeRow = screen.getByText("آریتمی").closest("div.flex") as HTMLElement;
    fireEvent.click(within(removeRow).getByRole("button", { name: "حذف" }));
    expect((screen.getByRole("button", { name: "ذخیره و بازچینش" }) as HTMLButtonElement).disabled).toBe(true);
  }, 30000);
});
