// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, configure, fireEvent, render, screen, within } from "@testing-library/react";
import App from "../App";
import { addDays, formatJalaliLong, keyToJalali, todayKey } from "../lib/jalali";
import { STORAGE_KEY } from "../lib/persist";

configure({ asyncUtilTimeout: 10000 });
afterEach(cleanup);

const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!);
const today = todayKey();
const tomorrow = addDays(today, 1);
const yesterday = addDays(today, -1);

/** dataTransfer ساده — jsdom پیاده‌سازی کامل drag ندارد */
function fakeDt() {
  const data: Record<string, string> = {};
  return {
    data,
    effectAllowed: "",
    setData: (k: string, v: string) => {
      data[k] = v;
    },
    getData: (k: string) => data[k] ?? "",
  };
}

function seedPlan(opts: { extraPending?: boolean } = {}) {
  localStorage.clear();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      subjects: [{ id: "s1", name: "قلب", color: "#f00", priority: "high", createdAt: 1 }],
      topics: [
        { id: "t1", subjectId: "s1", name: "آریتمی", volume: 10, estimatedMinutes: 120, priority: "medium", difficulty: 2, status: "learning", createdAt: 1 },
      ],
      plans: [
        {
          id: "p1",
          goal: "مرور قلب",
          startDate: addDays(today, -2),
          endDate: addDays(today, 6),
          topicIds: ["t1"],
          studyDays: [0, 1, 2, 3, 4, 5, 6],
          dailyMinutes: 60,
          createdAt: 1,
          archived: false,
        },
      ],
      tasks: [
        { id: "done1", planId: "p1", topicId: "t1", date: yesterday, kind: "learn", label: "یادگیری", plannedMinutes: 60, doneMinutes: 60, status: "done", order: 0, priority: "medium" },
        { id: "pend1", planId: "p1", topicId: "t1", date: today, kind: "review", label: "مرور", plannedMinutes: 30, doneMinutes: 0, status: "pending", order: 0, priority: "medium" },
        ...(opts.extraPending
          ? [{ id: "pend2", planId: "p1", topicId: "t1", date: addDays(today, 2), kind: "test", label: "تست", plannedMinutes: 45, doneMinutes: 0, status: "pending", order: 0, priority: "medium" }]
          : []),
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

const chip = (taskId: string) => document.querySelector(`[data-task-id="${taskId}"]`) as HTMLElement;
const dropZone = (date: string) => document.querySelector(`[data-drop-date="${date}"]`) as HTMLElement;

function drag(taskId: string, date: string) {
  const dt = fakeDt();
  fireEvent.dragStart(chip(taskId), { dataTransfer: dt });
  fireEvent.dragOver(dropZone(date), { dataTransfer: dt });
  fireEvent.drop(dropZone(date), { dataTransfer: dt });
}

describe("انتقال مبحث به روز دیگر در ویرایش برنامه", () => {
  it("کشیدن کارت به روز دیگر، تاریخِ تسک را عوض می‌کند و کارِ انجام‌شده را دست نمی‌زند", async () => {
    seedPlan();
    render(<App />);
    await openPlanEdit();

    expect(chip("pend1")).toBeTruthy();
    drag("pend1", tomorrow);
    // چیپ حالا داخل گروهِ فردا است و نشانهٔ جابه‌جایی دارد
    expect(dropZone(tomorrow).contains(chip("pend1"))).toBe(true);
    expect(screen.getByText(/بازگردانی همه \(۱\)/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "ذخیره و بازچینش" }));
    await new Promise((r) => setTimeout(r, 50));

    const state = saved();
    expect(state.tasks.find((t: { id: string }) => t.id === "pend1").date).toBe(tomorrow);
    // کارِ انجام‌شده سر جایش است
    const done = state.tasks.find((t: { id: string }) => t.id === "done1");
    expect(done.status).toBe("done");
    expect(done.date).toBe(yesterday);
  }, 30000);

  it("کشیدن به روزِ گذشته پذیرفته نمی‌شود", async () => {
    seedPlan({ extraPending: true });
    // یک کارِ عقب‌افتاده بساز تا گروه «گذشته» روی برد بیاید
    const state = saved();
    state.tasks.push({ id: "late1", planId: "p1", topicId: "t1", date: yesterday, kind: "learn", plannedMinutes: 15, doneMinutes: 0, status: "pending", order: 1, priority: "medium" });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    render(<App />);
    await openPlanEdit();
    expect(dropZone(yesterday)).toBeTruthy();
    drag("pend1", yesterday);

    expect(dropZone(today).contains(chip("pend1"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "ذخیره و بازچینش" }));
    await new Promise((r) => setTimeout(r, 50));
    expect(saved().tasks.find((t: { id: string }) => t.id === "pend1").date).toBe(today);
  }, 30000);

  it("✎ دکمهٔ ↔ برای موبایل: با انتخاب تاریخ، کار منتقل می‌شود و ↺ آن را برمی‌گرداند", async () => {
    seedPlan();
    render(<App />);
    await openPlanEdit();

    fireEvent.click(screen.getByRole("button", { name: "انتقال آریتمی به روز دیگر" }));
    expect(screen.getByText(/انتقال «آریتمی» به:/)).toBeTruthy();

    // انتخاب روز مقصد از تقویم شمسیِ همان پنل: سال/ماه/روز
    const panel = screen.getByText(/انتقال «آریتمی» به:/).closest("div")!.parentElement as HTMLElement;
    const selects = within(panel).getAllByRole("combobox");
    const target = keyToJalali(tomorrow);
    fireEvent.change(selects[1], { target: { value: String(target.jm) } });
    fireEvent.change(selects[0], { target: { value: String(target.jy) } });
    fireEvent.change(selects[2], { target: { value: String(target.jd) } });
    fireEvent.click(within(panel).getByRole("button", { name: "انتقال" }));

    expect(dropZone(tomorrow).contains(chip("pend1"))).toBe(true);
    // لغو جابه‌جایی → برمی‌گردد به امروز
    fireEvent.click(screen.getByRole("button", { name: "لغو جابه‌جایی آریتمی" }));
    expect(dropZone(today).contains(chip("pend1"))).toBe(true);
  }, 30000);

  it("اگر فقط جابه‌جایی تغییر کرده باشد، بدون بازچینشِ بقیهٔ برنامه اعمال می‌شود", async () => {
    seedPlan({ extraPending: true });
    render(<App />);
    await openPlanEdit();
    const before = saved().tasks.find((t: { id: string }) => t.id === "pend2").date;

    drag("pend1", addDays(today, 3));
    fireEvent.click(screen.getByRole("button", { name: "ذخیره و بازچینش" }));
    await new Promise((r) => setTimeout(r, 50));

    const state = saved();
    // تسک دیگر (pend2) با همان شناسه و همان تاریخ می‌ماند — یعنی بازچینش رخ نداده
    expect(state.tasks.find((t: { id: string }) => t.id === "pend2").date).toBe(before);
    expect(state.tasks.find((t: { id: string }) => t.id === "pend1").date).toBe(addDays(today, 3));
  }, 30000);

  it("جابه‌جایی همراه با تغییر زمان روزانه هم اعمال می‌شود (تطبیق با کارِ همان مبحث)", async () => {
    seedPlan();
    render(<App />);
    await openPlanEdit();

    drag("pend1", addDays(today, 4));
    fireEvent.change(screen.getByLabelText("زمان روزانه به دقیقه"), { target: { value: "180" } });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره و بازچینش" }));
    await new Promise((r) => setTimeout(r, 80));

    const state = saved();
    expect(state.plans[0].dailyMinutes).toBe(180);
    // کارِ باقی‌مانده با تاریخِ مقصد وجود دارد
    const moved = state.tasks.filter((t: { status: string; topicId: string; date: string }) => t.status === "pending" && t.topicId === "t1" && t.date === addDays(today, 4));
    expect(moved.length).toBeGreaterThan(0);
  }, 30000);

  it("برد، بارِ زیادِ یک روز را هشدار می‌دهد", async () => {
    seedPlan({ extraPending: true });
    render(<App />);
    await openPlanEdit();
    // هر دو کار را روی فردا جمع کن تا از ۱۲۰ دقیقهٔ روزانه بیشتر شود
    drag("pend1", tomorrow);
    drag("pend2", tomorrow);
    expect(within(dropZone(tomorrow)).getAllByText("⚠️").length).toBeGreaterThan(0);
    expect(within(dropZone(tomorrow)).getByText("۱ ساعت و ۱۵ دقیقه")).toBeTruthy();
  }, 30000);

  it("«بازگردانی همه» همهٔ جابه‌جایی‌های ذخیره‌نشده را پاک می‌کند", async () => {
    seedPlan({ extraPending: true });
    render(<App />);
    await openPlanEdit();
    drag("pend1", tomorrow);
    drag("pend2", addDays(today, 3));
    expect(screen.getByText(/بازگردانی همه \(۲\)/)).toBeTruthy();
    fireEvent.click(screen.getByText(/بازگردانی همه \(۲\)/));
    expect(screen.queryByText(/بازگردانی همه/)).toBeNull();
    expect(dropZone(today).contains(chip("pend1"))).toBe(true);
  }, 30000);

  it("روزِ خالیِ نزدیک به‌عنوان مقصدِ رهاکردن روی برد هست", async () => {
    seedPlan();
    render(<App />);
    await openPlanEdit();
    const empty = dropZone(addDays(today, 1));
    expect(empty).toBeTruthy();
    expect(within(empty).getByText("کارت را اینجا رها کن")).toBeTruthy();
    expect(within(empty).getByText(formatJalaliLong(tomorrow))).toBeTruthy();
  }, 30000);
});
