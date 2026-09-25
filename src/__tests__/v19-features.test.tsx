// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StoreProvider, ToastProvider, useStore, useToasts } from "../store";
import { NavContext, type NavApi } from "../nav";
import MemoryGardenCard from "../components/MemoryGardenCard";
import InsightsCard from "../components/InsightsCard";
import GhostCard from "../components/GhostCard";
import FirstUseTour from "../components/FirstUseTour";
import { encodeGhostShare } from "../lib/ghost";
import { addDays, todayKey } from "../lib/jalali";
import type { AppState, Flashcard, StudySession, TestLog } from "../types";

afterEach(cleanup);

const KEY = "study-planner-v1";
const DAY = 86_400_000;

function seed(patch: Partial<AppState>) {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(KEY, JSON.stringify(patch));
}

const fakeNav: NavApi = {
  tab: "home",
  planSub: "plans",
  calendarDate: null,
  go: () => undefined,
};

/** توست‌ها را هم رندر کن — در اپ واقعی Shell این کار را می‌کند */
function ToastView() {
  const { toasts } = useToasts();
  return <div>{toasts.map((t) => <span key={t.id}>{t.message}</span>)}</div>;
}

function withProviders(ui: ReactElement) {
  return (
    <ToastProvider>
      <StoreProvider>
        <NavContext.Provider value={fakeNav}>{ui}<ToastView /></NavContext.Provider>
      </StoreProvider>
    </ToastProvider>
  );
}

function card(id: string, patch: Partial<Flashcard> = {}): Flashcard {
  return {
    id, front: `سوال ${id}`, back: `جواب ${id}`, ef: 2.5, intervalDays: 0,
    repetitions: 0, dueDate: "2026-09-23", lapses: 0, createdAt: Date.now() - DAY,
    ...patch,
  };
}

const topics = [
  { id: "t1", subjectId: "s1", name: "نوار قلب", volume: 1, estimatedMinutes: 30, priority: "medium" as const, difficulty: 2 as const, status: "learning" as const, createdAt: 0 },
];
const subjects = [{ id: "s1", name: "قلب", color: "#f00", priority: "high" as const, createdAt: 0 }];

describe("FSRS در store", () => {
  it("با srsAlgorithm=fsrs، ارزیابی «خوب» روی کارت نو فاصله‌ی ۳ روز می‌دهد (نه ۱ روزِ SM-2)", () => {
    seed({
      subjects,
      topics,
      flashcards: [card("c1", { topicId: "t1" })],
      settings: { onboarded: true, srsAlgorithm: "fsrs" } as never,
    });

    function Probe() {
      const { reviewFlashcard } = useStore();
      return <button type="button" onClick={() => reviewFlashcard("c1", 4)}>review</button>;
    }
    render(withProviders(<Probe />));
    fireEvent.click(screen.getByText("review"));

    const saved = JSON.parse(localStorage.getItem(KEY)!) as AppState;
    const c = saved.flashcards.find((x) => x.id === "c1")!;
    expect(c.intervalDays).toBe(3); // FSRS goodِ اولین مرور: S=3
    expect(c.repetitions).toBe(1);
    expect(c.dueDate).toBe(addDays(todayKey(), 3));
  });

  it("بدون تنظیم (پیش‌فرض)، همان SM-2 کلاسیک کار می‌کند", () => {
    seed({
      subjects,
      topics,
      flashcards: [card("c2", { topicId: "t1" })],
      settings: { onboarded: true } as never,
    });
    function Probe() {
      const { reviewFlashcard } = useStore();
      return <button type="button" onClick={() => reviewFlashcard("c2", 4)}>review</button>;
    }
    render(withProviders(<Probe />));
    fireEvent.click(screen.getByText("review"));
    const saved = JSON.parse(localStorage.getItem(KEY)!) as AppState;
    const c = saved.flashcards.find((x) => x.id === "c2")!;
    expect(c.intervalDays).toBe(1); // SM-2 اولین مرور موفق
  });
});

describe("باغ حافظه 🧠", () => {
  it("مبحث مرورشده با درصد یادآوری نشان داده می‌شود", () => {
    seed({
      subjects,
      topics,
      flashcards: [
        card("c1", { topicId: "t1", intervalDays: 4, repetitions: 2, lastReviewedAt: Date.now() - 8 * DAY }),
        card("c2", { topicId: "t1", intervalDays: 2, repetitions: 2, lastReviewedAt: Date.now() - 8 * DAY }),
      ],
      settings: { onboarded: true } as never,
    });
    render(withProviders(<MemoryGardenCard />));
    expect(screen.getByText("باغ حافظه 🧠")).toBeTruthy();
    expect(screen.getAllByText(/نوار قلب/).length).toBeGreaterThanOrEqual(1);
    // میانگین ≈ ۰.۷۳ → زیر آستانه‌ی ۷۵٪ = «تشنه»
    expect(screen.getByText(/تشنه 💧/)).toBeTruthy();
    expect(screen.getByText(/باغچه در حال خشک شدن/)).toBeTruthy();
  });

  it("بدون کارتِ مرورشده، کارتی رندر نمی‌شود", () => {
    seed({ subjects, topics, flashcards: [card("c1", { topicId: "t1" })], settings: { onboarded: true } as never });
    render(withProviders(<MemoryGardenCard />));
    expect(screen.queryByText("باغ حافظه 🧠")).toBeNull();
  });
});

describe("بینش‌های محلی 💡", () => {
  it("دقتِ بیشتر در صبح → بینشِ «صبح بهتر می‌زنی»", () => {
    const logs: TestLog[] = [
      { id: "l1", subjectId: "s1", date: "2026-09-22", total: 40, correct: 36, createdAt: new Date("2026-09-22T08:00:00").getTime() },
      { id: "l2", subjectId: "s1", date: "2026-09-22", total: 40, correct: 20, createdAt: new Date("2026-09-22T23:00:00").getTime() },
    ];
    seed({ subjects, topics, testLogs: logs, settings: { onboarded: true } as never });
    render(withProviders(<InsightsCard />));
    expect(screen.getByText("بینش‌های تو 💡")).toBeTruthy();
    expect(screen.getByText(/تست‌ها را در صبح بهتر می‌زنی/)).toBeTruthy();
  });
});

describe("سایه‌ی دوستان 👻", () => {
  const sessions: StudySession[] = [
    { id: "s-1", topicId: null, startedAt: 0, endedAt: 0, durationMinutes: 120, rating: null, mode: "free", date: "2026-09-19" },
    { id: "s-2", topicId: null, startedAt: 0, endedAt: 0, durationMinutes: 90, rating: null, mode: "free", date: "2026-09-23" },
  ];

  it("کد دوست وارد می‌شود و رقابت نمایش داده می‌شود", () => {
    seed({ sessions, settings: { onboarded: true } as never });
    render(withProviders(<GhostCard />));
    expect(screen.getByText(/رقابت با سایه‌ات/)).toBeTruthy();

    fireEvent.click(screen.getByText("📥 سایه‌ی دوست"));
    const code = encodeGhostShare({ name: "سارا", days: [60, 60, 60, 60, 60, 60, 60], weekStart: "2026-09-19" });
    fireEvent.change(screen.getByPlaceholderText(/SPGHOST1/), { target: { value: code } });
    fireEvent.click(screen.getByText("وارد کن"));

    expect(screen.getAllByText(/سارا/).length).toBeGreaterThanOrEqual(1);
    const saved = JSON.parse(localStorage.getItem(KEY)!) as AppState;
    expect(saved.settings.friendGhosts?.length).toBe(1);
    expect(saved.settings.friendGhosts?.[0].total).toBe(420);
  });

  it("کد نامعتبر پیام خطا می‌دهد و چیزی ذخیره نمی‌شود", () => {
    seed({ sessions, settings: { onboarded: true } as never });
    render(withProviders(<GhostCard />));
    fireEvent.click(screen.getByText("📥 سایه‌ی دوست"));
    fireEvent.change(screen.getByPlaceholderText(/SPGHOST1/), { target: { value: "چرت و پرت" } });
    fireEvent.click(screen.getByText("وارد کن"));
    expect(screen.getByText(/کد معتبر نیست/)).toBeTruthy();
    const saved = JSON.parse(localStorage.getItem(KEY)!) as AppState;
    expect(saved.settings.friendGhosts ?? []).toHaveLength(0);
  });
});

describe("تور اولین استفاده 🧭", () => {
  it("فقط بلافاصله بعد از آنبوردینگِ همین نشست نشان داده می‌شود", () => {
    seed({ settings: { onboarded: true } as never });
    render(withProviders(<FirstUseTour />));
    // بدون پرچم sessionStorage → توری در کار نیست (کاربران قدیمی/تست‌ها اذیت نمی‌شوند)
    expect(screen.queryByText("🧭 تور دو دقیقه‌ای")).toBeNull();
  });

  it("با پرچمِ نشست نشان داده می‌شود و «رد کردن» دیگر برنمی‌گردد", () => {
    seed({ settings: { onboarded: true } as never });
    sessionStorage.setItem("sp_first_run_tour", "1");
    render(withProviders(<FirstUseTour />));
    expect(screen.getByText("🧭 تور دو دقیقه‌ای")).toBeTruthy();
    expect(screen.getByText(/مطالعه را با تایمر ثبت کن/)).toBeTruthy();

    fireEvent.click(screen.getByText(/رد کردن/));
    const saved = JSON.parse(localStorage.getItem(KEY)!) as AppState;
    expect(saved.settings.tourSeen).toBe(true);
    expect(sessionStorage.getItem("sp_first_run_tour")).toBeNull();
  });

  it("قدم‌ها جلو می‌روند و در قدم آخر تمام می‌شود", () => {
    seed({ settings: { onboarded: true } as never });
    sessionStorage.setItem("sp_first_run_tour", "1");
    render(withProviders(<FirstUseTour />));
    fireEvent.click(screen.getByText("بعدی"));
    expect(screen.getByText(/مرور، قلبِ این اپ است/)).toBeTruthy();
    fireEvent.click(screen.getByText("بعدی"));
    fireEvent.click(screen.getByText("بعدی"));
    fireEvent.click(screen.getByText("شروع کن! 🚀"));
    const saved = JSON.parse(localStorage.getItem(KEY)!) as AppState;
    expect(saved.settings.tourSeen).toBe(true);
  });
});
