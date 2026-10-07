// @vitest-environment jsdom
// تست رندرِ «روز من»: تایم‌لاین، پنجره‌های خالی، نمای هفته و دکمه‌های خروجی.
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

/** matcher انعطاف‌پذیر: متنی که داخل یک عنصر (با ایموجی/پیشوند) آمده را پیدا می‌کند */
function hasText(text: string) {
  return (document.body.textContent ?? "").replace(/\s+/g, " ").includes(text);
}

/** بلوک‌های روی تایم‌لاین با نوع و عنوانشان */
function blocks() {
  return [...document.querySelectorAll("[data-item]")].map((el) => ({ kind: el.getAttribute("data-item"), title: el.getAttribute("data-title") }));
}
import { StoreProvider } from "../store";
import { NavContext, type NavApi } from "../nav";
import DaySheetPage from "../pages/DaySheet";
import { daySheetCardSummary, renderDaySheetCard } from "../lib/daySheetCard";
import { buildDaySheet } from "../lib/daySheet";
import { formatJalaliLong, todayKey, weekdayOf } from "../lib/jalali";

const START = new Date("2026-10-02T12:00:00").getTime(); // جمعه

function seededState() {
  const today = todayKey();
  return {
    subjects: [
      { id: "subA", name: "فیزیولوژی", color: "#0ea5a4", priority: "high", createdAt: 1 },
      { id: "subB", name: "آناتومی", color: "#8b5cf6", priority: "medium", createdAt: 2 },
    ],
    topics: [
      { id: "topicA", subjectId: "subA", name: "قلب", volume: 10, estimatedMinutes: 120, priority: "high", difficulty: 2, status: "learning", createdAt: 1 },
      { id: "topicB", subjectId: "subB", name: "استخوان‌ها", volume: 10, estimatedMinutes: 60, priority: "medium", difficulty: 2, status: "not_started", createdAt: 2 },
    ],
    tasks: [
      { id: "taskToday", planId: "p1", topicId: "topicB", date: today, plannedMinutes: 60, doneMinutes: 0, status: "pending", order: 0, priority: "medium", kind: "learn" },
      { id: "taskLate", planId: "p1", topicId: "topicA", date: "2026-09-28", plannedMinutes: 45, doneMinutes: 0, status: "pending", order: 0, priority: "high", kind: "test" },
    ],
    sessions: [
      { id: "se1", topicId: "topicA", startedAt: new Date("2026-10-02T09:00:00").getTime(), endedAt: new Date("2026-10-02T10:00:00").getTime(), durationMinutes: 60, rating: 2, mode: "free", date: today, kind: "learn" },
    ],
    reviews: [{ id: "rev1", topicId: "topicA", dueDate: today, reviewNumber: 1, stage: 0, intervalDays: 1, status: "pending" }],
    exams: [{ id: "ex1", title: "امتحان میان‌ترم", date: today, time: "16:00", subjectId: "subA", createdAt: 1 }],
    classBlocks: [
      { id: "c1", title: "کلاس فارماکولوژی", weekday: weekdayOf(today), startMin: 8 * 60, endMin: 10 * 60, color: "#0ea5a4", createdAt: 1 },
    ],
    plans: [{ id: "p1", goal: "برنامه", startDate: today, endDate: today, topicIds: ["topicA", "topicB"], studyDays: [0, 1, 2, 3, 4, 5, 6], dailyMinutes: 300, createdAt: 1, archived: false }],
  };
}

const nav: NavApi = { tab: "plan", planSub: "day", calendarDate: null, go: vi.fn() };
const wrapper = ({ children }: { children: ReactNode }) => (
  <StrictMode>
    <StoreProvider>
      <NavContext.Provider value={nav}>{children}</NavContext.Provider>
    </StoreProvider>
  </StrictMode>
);

beforeEach(() => {
  // اول زمان را قفل کن، بعد بذر بریز — وگرنه تاریخِ بذر با «امروزِ» صفحه یکی نمی‌شود
  vi.useFakeTimers();
  vi.setSystemTime(START);
  localStorage.clear();
  localStorage.setItem("study-planner-v1", JSON.stringify(seededState()));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("صفحه‌ی «روز من»", () => {
  it("تایم‌لاین روز را با کلاس، مطالعه‌ی ثبت‌شده، امتحان و مباحث پیشنهادی نشان می‌دهد", () => {
    render(<DaySheetPage />, { wrapper });
    const today = todayKey();

    // سربرگ
    expect(screen.getByText("🌤️ روز من")).toBeTruthy();
    expect(hasText(`جمعه ${formatJalaliLong(today, false)}`)).toBe(true);

    // بلوک‌های تایم‌لاین
    // چهار نوع بلوک روی تایم‌لاین: کلاس، امتحان، مطالعهٔ ثبت‌شده و پیشنهادی
    const kinds = blocks().map((b) => b.kind);
    expect(kinds).toContain("class");
    expect(kinds).toContain("exam");
    expect(kinds).toContain("recorded");
    expect(kinds).toContain("suggested");
    expect(blocks().map((b) => b.title)).toContain("کلاس فارماکولوژی");
    expect(blocks().map((b) => b.title)).toContain("امتحان میان‌ترم");
    expect(hasText("کلاس فارماکولوژی")).toBe(true);
    expect(screen.getAllByText("۰۸:۰۰–۱۰:۰۰").length).toBeGreaterThan(0);
    expect(hasText("قلب")).toBe(true); // مطالعهٔ ثبت‌شده و/یا تسک بازمانده
    expect(hasText("استخوان‌ها")).toBe(true); // تسک امروز

    // کارت‌های آمار و پنجره‌های خالی
    expect(screen.getByText("🕊 پنجره‌های خالی")).toBeTruthy();
    expect(screen.getByText("📦 جا نشد…")).toBeTruthy();
    expect(screen.getAllByText(/ساعت طلایی/).length).toBeGreaterThan(0);

    // خروجی‌ها
    expect(screen.getByText("🖼️ تصویر PNG")).toBeTruthy();
    expect(screen.getByText("📋 کپی متن")).toBeTruthy();
    expect(screen.getByText("🖨️ چاپ / PDF")).toBeTruthy();
  });

  // 🐛→✅ قبلاً سربرگِ تاریخ‌دار و کارت‌های آمار «no-print» بودند و در خروجیِ
  // چاپ/PDF اصلاً دیده نمی‌شدند (فایل بدون تاریخ/روز و بدون آمار چاپ می‌شد).
  it("یک سربرگِ مخصوصِ چاپ با تاریخِ روز دارد و کارت‌های آمار دیگر no-print نیستند", () => {
    const { container } = render(<DaySheetPage />, { wrapper });
    const today = todayKey();
    const printHeader = container.querySelector(".print-only");
    expect(printHeader).toBeTruthy();
    expect(printHeader!.textContent).toContain(formatJalaliLong(today, false));
    expect(container.querySelector(".day-sheet-tiles.no-print")).toBeNull();
    expect(container.querySelector(".day-sheet-tiles")).toBeTruthy();
  });

  it("با زدن «هفته» نمای هفتگی با هر ۷ روز و زمان‌های خالی می‌آید", async () => {
    render(<DaySheetPage />, { wrapper });
    fireEvent.click(screen.getByText("📆 هفته"));
    expect(hasText("هفتهٔ من")).toBe(true);
    for (const day of ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"]) {
      expect(screen.getAllByText(day).length).toBeGreaterThan(0);
    }
    expect(screen.getByText("🕊 زمان‌های خالی هفته")).toBeTruthy();
    expect(screen.getByText("📚 سهم درس‌ها در هفته")).toBeTruthy();
  });

  // 🐛→✅ جدولِ نمای هفته قبلاً فقط با اسکرولِ افقیِ تثبیت‌شده (۶۴۰px) دیده می‌شد؛
  // روی کاغذ، نیمهٔ دومِ هفته به‌سادگی قطع می‌شد. الان باید کلاس اختصاصی برای
  // جمع‌شدنِ عرض در چاپ را داشته باشد و سربرگِ چاپیِ بازهٔ هفته را نشان دهد.
  it("نمای هفته هم سربرگ چاپی و هم کلاسِ جمع‌شوندهٔ عرض برای PDF دارد", () => {
    const { container } = render(<DaySheetPage />, { wrapper });
    fireEvent.click(screen.getByText("📆 هفته"));
    const printHeader = container.querySelector(".print-only");
    expect(printHeader).toBeTruthy();
    expect(printHeader!.textContent).toContain("هفتهٔ من");
    expect(container.querySelector(".week-overview-card")).toBeTruthy();
    expect(container.querySelector(".week-overview")).toBeTruthy();
  });

  it("روزهای دیگر هفته هم بدون کلاس/امتحان درست نشان داده می‌شوند", () => {
    render(<DaySheetPage />, { wrapper });
    fireEvent.click(screen.getByLabelText("روز بعد"));
    fireEvent.click(screen.getByLabelText("روز بعد"));
    // کلاس و امتحان فقط برای امروز تعریف شده‌اند
    expect(hasText("کلاس فارماکولوژی")).toBe(false);
    expect(hasText("امتحان میان‌ترم")).toBe(false);
    // پنجره‌های خالی همان روز و کارهای بازمانده سرجایشان هستند
    expect(screen.getByText("🕊 پنجره‌های خالی")).toBeTruthy();
    expect(hasText("بازمانده")).toBe(true);
    // خطِ «الان» فقط روی روز جاری می‌آید (عنوان راهنما دقیقاً «الان» است، پس فاصله لازم است)
    expect(screen.queryByText(/^الان /)).toBeNull();
  });
});

describe("جمع‌بندیِ کارت تصویری", () => {
  it("پنجره‌های خالی، کارهای جا نشده و سهم درس‌ها را خط‌به‌خط می‌نویسد", () => {
    const sheet = buildDaySheet({
      date: "2026-10-02",
      weekday: 5,
      dayStartMin: 7 * 60,
      dayEndMin: 12 * 60,
      classBlocks: [{ id: "c1", title: "کلاس", weekday: 5, startMin: 8 * 60, endMin: 11 * 60, createdAt: 1 }],
      tasks: [{ id: "t1", topicId: "topicA", date: "2026-10-02", plannedMinutes: 120, doneMinutes: 0, status: "pending", order: 0, priority: "high", kind: "learn" }],
      sessions: [],
      topics: [{ id: "topicA", subjectId: "subA", name: "قلب", volume: 10, estimatedMinutes: 90, priority: "high", difficulty: 2, status: "learning", createdAt: 1 }],
      subjects: [{ id: "subA", name: "فیزیولوژی", color: "#0ea5a4", priority: "high", createdAt: 1 }],
      exams: [],
      reviews: [{ topicId: "topicA", status: "pending", dueDate: "2026-10-02" }],
    });
    const lines = daySheetCardSummary(sheet);
    expect(sheet.windows.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.includes("خالی") && l.includes("۰۷:۰۰"))).toBe(true);
    expect(lines.some((l) => l.includes("جا نشد"))).toBe(true);
    expect(lines.some((l) => l.includes("سهم فیزیولوژی"))).toBe(true);
    expect(lines.some((l) => l.includes("مرور سررسیدشده"))).toBe(true);
  });
});

describe("کارت تصویریِ روز (Canvas)", () => {
  /** کانواس جعلی: همه‌ی متدهای 2D را می‌پذیرد تا مسیر رسم کامل اجرا شود */
  function stubCanvas() {
    const drawn: string[] = [];
    const gradient = { addColorStop: () => undefined };
    const store: Record<string, unknown> = {};
    const ctx = new Proxy(store, {
      has: () => true,
      get: (_t, prop: string) => {
        if (prop === "measureText") return (text: string) => ({ width: String(text).length * 10 });
        if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
        if (prop in store) return store[prop];
        return () => undefined;
      },
      set: (_t, prop: string, value) => {
        store[prop] = value;
        if (prop === "fillStyle" || prop === "font") drawn.push(prop);
        return true;
      },
    });
    const canvas = { width: 0, height: 0, getContext: () => ctx, toDataURL: () => "data:image/png;base64,STUB" };
    const original = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
      tag === "canvas" ? canvas : original(tag)) as typeof document.createElement);
    return { canvas, drawn };
  }

  function sampleSheet() {
    return buildDaySheet({
      date: "2026-10-02",
      weekday: 5,
      dayStartMin: 7 * 60,
      dayEndMin: 23 * 60,
      classBlocks: [{ id: "c1", title: "کلاس فارماکولوژی", weekday: 5, startMin: 8 * 60, endMin: 10 * 60, color: "#0ea5a4", createdAt: 1 }],
      tasks: [{ id: "t1", topicId: "topicA", date: "2026-10-02", plannedMinutes: 120, doneMinutes: 0, status: "pending", order: 0, priority: "high", kind: "learn" }],
      sessions: [],
      topics: [{ id: "topicA", subjectId: "subA", name: "قلب", volume: 10, estimatedMinutes: 120, priority: "high", difficulty: 2, status: "learning", createdAt: 1 }],
      subjects: [{ id: "subA", name: "فیزیولوژی", color: "#0ea5a4", priority: "high", createdAt: 1 }],
      exams: [{ id: "e1", title: "امتحان میان‌ترم", date: "2026-10-02", time: "16:00", createdAt: 1 }],
      reviews: [],
      nowMin: 12 * 60,
    });
  }

  it("کل مسیر رسم را بدون خطا اجرا می‌کند و ارتفاع کارت با محتوا بزرگ می‌شود", () => {
    const { canvas, drawn } = stubCanvas();
    const card = renderDaySheetCard(sampleSheet(), "جمعه ۱۰ مهر ۱۴۰۵");
    expect(card).toBeTruthy();
    expect(canvas.width).toBe(1080);
    const fullHeight = canvas.height;
    expect(fullHeight).toBeGreaterThan(900);
    expect(drawn.length).toBeGreaterThan(10); // فونت/رنگ‌ها واقعاً ست شده‌اند

    // کارت بدون بلوک هم باید ساخته شود و کوچک‌تر باشد
    const empty = renderDaySheetCard({ ...sampleSheet(), items: [], windows: [], unplaced: [], bySubject: [], totals: { items: 0, done: 0, classMinutes: 0, examMinutes: 0, recordedMinutes: 0, suggestedMinutes: 0, plannedMinutes: 0, freeMinutes: 0, reviewsDue: 0 } }, "جمعه ۱۰ مهر ۱۴۰۵");
    expect(empty).toBeTruthy();
    expect(canvas.height).toBeLessThan(fullHeight); // روزِ خالی، کارتِ کوتاه‌تر
  });

  it("دکمهٔ «تصویر PNG» پیش‌نمایش کارت را باز می‌کند", () => {
    stubCanvas();
    render(<DaySheetPage />, { wrapper });
    fireEvent.click(screen.getByText("🖼️ تصویر PNG"));
    const img = document.querySelector("img") as HTMLImageElement | null;
    expect(img?.getAttribute("src")).toBe("data:image/png;base64,STUB");
    expect(screen.getByText("اشتراک / دانلود")).toBeTruthy();
  });
});
