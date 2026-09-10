// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import App from "../App";
import { buildDecks, shuffleSeededId } from "../components/Flashcards";
import { curatedCardKey, CURATED_PACKS } from "../lib/curatedPacks";
import type { Flashcard, Topic } from "../types";

afterEach(cleanup);

// آنبوردینگ اولین نصب را مثل یک کاربر واقعی کامل می‌کند
function completeOnboarding() {
  fireEvent.click(screen.getByText("بعدی"));
  fireEvent.click(screen.getByText("بعدی"));
  fireEvent.click(screen.getByText("🚀 بساز و شروع کن"));
  fireEvent.click(screen.getByText("فعلاً خودم می‌گردم"));
}

function goToCardsTab() {
  fireEvent.click(screen.getAllByText("مرور")[0]);
  fireEvent.click(screen.getByRole("button", { name: "🃏 کارت‌ها" }));
}

describe("Curated flashcard packs (منتخب) — مبحث‌محور", () => {
  it("نمایش بانک منتخب‌ها و افزودنِ انتخابیِ فقط چند کارتِ دلخواه", () => {
    localStorage.clear();
    render(<App />);
    completeOnboarding();
    goToCardsTab();

    // بانک منتخب‌ها با نامِ ذخیره‌شده در پک (حتی بدون موضوعات نمونه) دیده می‌شود
    expect(screen.getByText("⭐ بانک فلش‌کارت‌های منتخب")).toBeTruthy();
    const deckEl = screen.getByText("آناتومی و فیزیولوژی قلب").closest("[data-deck]") as HTMLElement;
    fireEvent.click(within(deckEl).getByRole("button", { name: "افزودن از منتخب‌ها" }));

    // داخل جزئیات مبحث: فقط دو کارتِ اول را تیک می‌زنیم — نه همه را
    const modalTitle = screen.getByText("🃏 آناتومی و فیزیولوژی قلب");
    expect(modalTitle).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /لایه‌ی داخلی قلب/ })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /شریان اصلی تغذیه/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: /افزودن ۲ کارت انتخابی به کارت‌های من/ }));

    // فقط ۲ کارت اضافه شد و ردیف‌های اضافه‌شده علامت ✓ دارند
    expect(screen.getByText("کارت‌های من (۲)")).toBeTruthy();
    expect(screen.getAllByText("به کارت‌های تو اضافه شده").length).toBe(2);
    const saved = JSON.parse(localStorage.getItem("study-planner-v1")!);
    expect(saved.flashcards.length).toBe(2);
    expect(saved.flashcards[0].origin).toBe("curated");
    expect(saved.flashcards[0].packId).toBe("cardiology-nematpour-001");
  });

  it("import دوباره‌ی همان کارت تکراری اضافه نمی‌کند (idempotent)", () => {
    localStorage.clear();
    render(<App />);
    completeOnboarding();
    goToCardsTab();

    const deckEl = screen.getByText("رضایت آگاهانه بیمار").closest("[data-deck]") as HTMLElement;
    fireEvent.click(within(deckEl).getByRole("button", { name: "افزودن از منتخب‌ها" }));
    fireEvent.click(screen.getByRole("button", { name: "انتخاب همه" }));
    fireEvent.click(screen.getByRole("button", { name: /افزودن ۳ کارت انتخابی/ }));
    expect(screen.getByText("کارت‌های من (۳)")).toBeTruthy();

    // انتخاب همه‌ی باقی‌مانده دیگر در دسترس نیست (باقی‌مانده = ۰)
    expect(screen.queryByRole("button", { name: "انتخاب همه" })).toBeNull();
    const saved = JSON.parse(localStorage.getItem("study-planner-v1")!);
    expect(saved.flashcards.length).toBe(3);
  });

  it("از جلسه‌ی مرور می‌شود کارت را «بررسی سوال» علامت زد و بعداً ویرایش کرد", async () => {
    localStorage.clear();
    localStorage.setItem(
      "study-planner-v1",
      JSON.stringify({
        subjects: [{ id: "s1", name: "قلب", color: "#f00", priority: "high", createdAt: 1 }],
        topics: [{ id: "t1", subjectId: "s1", name: "آریتمی", volume: 10, estimatedMinutes: 60, priority: "medium", difficulty: 2, status: "learning", createdAt: 1 }],
        flashcards: [{ id: "c1", topicId: "t1", front: "سوال آزمایشی؟", back: "جواب آزمایشی", ef: 2.5, intervalDays: 0, repetitions: 0, dueDate: "2020-01-01", lapses: 0, createdAt: 1, origin: "user" }],
        settings: { onboarded: true },
      }),
    );
    render(<App />);
    goToCardsTab();

    // مبحث‌محور: مجموعه‌ی «آریتمی» با کارت سررسیددار
    expect(screen.getByText("آریتمی")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /مرور این مبحث/ }));

    // جواب را نشان بده و کارت را «بررسی سوال» بزن
    fireEvent.click(screen.getByRole("button", { name: "نمایش پاسخ" }));
    expect(screen.getByText("جواب آزمایشی")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /بررسی سوال — ممکنه جواب اشتباه باشه/ }));
    const mid = JSON.parse(localStorage.getItem("study-planner-v1")!);
    expect(mid.flashcards[0].needsCheck).toBe(true);

    // ارزیابی عادی هم همچنان کار می‌کند
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /خوب/ }));
    });
    expect(screen.getByText("جلسه تمام شد")).toBeTruthy();

    // بازگشت: تایل «نیاز به بررسی» + بنر + فیلتر فقط-بررسی‌دار
    fireEvent.click(screen.getByRole("button", { name: "بازگشت" }));
    expect(screen.getByText("نیاز به بررسی")).toBeTruthy();
    expect(screen.getByText(/کارت علامت «بررسی سوال» دارد/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "فقط این‌ها" }));
    // فقط مجموعه‌ی دارای کارتِ علامت‌خورده می‌ماند و بانک پنهان می‌شود
    expect(screen.getByText("آریتمی")).toBeTruthy();
    expect(screen.queryByText("⭐ بانک فلش‌کارت‌های منتخب")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "نمایش همه" }));
    expect(screen.getByText("⭐ بانک فلش‌کارت‌های منتخب")).toBeTruthy();
  });

  it("ویرایش کارت علامت‌خورده از «همه‌ی کارت‌ها» ممکن است و علامت با کلیک برداشته می‌شود", () => {
    localStorage.clear();
    localStorage.setItem(
      "study-planner-v1",
      JSON.stringify({
        subjects: [{ id: "s1", name: "قلب", color: "#f00", priority: "high", createdAt: 1 }],
        topics: [{ id: "t1", subjectId: "s1", name: "آریتمی", volume: 10, estimatedMinutes: 60, priority: "medium", difficulty: 2, status: "learning", createdAt: 1 }],
        flashcards: [{ id: "c1", topicId: "t1", front: "سوال آزمایشی؟", back: "جوابِ اشتباه", ef: 2.5, intervalDays: 0, repetitions: 0, dueDate: "2020-01-01", lapses: 0, createdAt: 1, origin: "curated", packId: "cardiology-nematpour-001", needsCheck: true, needsCheckAt: 1 }],
        settings: { onboarded: true },
      }),
    );
    render(<App />);
    goToCardsTab();

    fireEvent.click(screen.getByRole("button", { name: "🗂 همه‌ی کارت‌ها" }));
    fireEvent.click(screen.getByText("سوال آزمایشی؟")); // باز شدن ویرایشگر
    const input = screen.getByPlaceholderText("پاسخ کوتاه و دقیق بهتر یاد می‌ماند") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "جوابِ اصلاح‌شده" } });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));

    const saved = JSON.parse(localStorage.getItem("study-planner-v1")!);
    expect(saved.flashcards[0].back).toBe("جوابِ اصلاح‌شده");
    expect(saved.flashcards[0].needsCheck).toBe(true); // تا وقتی خودش علامت را برندارد می‌ماند

    // برداشتن علامت با دکمه‌ی 🚩
    fireEvent.click(screen.getByTitle("جواب ممکن است اشتباه باشد — علامت بزن تا بعداً ویرایش کنی"));
    const after = JSON.parse(localStorage.getItem("study-planner-v1")!);
    expect(after.flashcards[0].needsCheck).toBe(false);
  });
});

describe("buildDecks — گروه‌بندی مبحث‌محور", () => {
  const topics: Topic[] = [
    { id: "t1", subjectId: "s1", name: "مبحث یک", volume: 1, estimatedMinutes: 10, priority: "medium", difficulty: 1, status: "learning", sampleId: "cardiology-nematpour-001", createdAt: 1 },
    { id: "t2", subjectId: "s1", name: "مبحث دو", volume: 1, estimatedMinutes: 10, priority: "medium", difficulty: 1, status: "learning", createdAt: 1 },
  ];
  const card = (over: Partial<Flashcard>): Flashcard => ({
    id: over.id ?? "x", front: "ف", back: "ب", ef: 2.5, intervalDays: 0, repetitions: 0, dueDate: "2020-01-01", lapses: 0, createdAt: 1, ...over,
  });

  it("کارت‌ها بر اساس مبحث گروه می‌شوند و پکِ همان مبحث شناخته می‌شود", () => {
    const decks = buildDecks([card({ id: "a", topicId: "t1" }), card({ id: "b", topicId: "t1" }), card({ id: "c", topicId: "t2" })], topics, "2026-01-01");
    const d1 = decks.find((d) => d.key === "t:t1")!;
    expect(d1.myCards.length).toBe(2);
    expect(d1.pack?.id).toBe("cardiology-nematpour-001"); // مبحث نمونه → پک منتخب همان
    expect(d1.dueCount).toBe(2);
    const d2 = decks.find((d) => d.key === "t:t2")!;
    expect(d2.myCards.length).toBe(1);
    expect(d2.pack).toBeUndefined();
  });

  it("کارت منتخبِ بدون مبحث در فهرست کاربر، با کلید پک گروه می‌شود", () => {
    const decks = buildDecks([card({ id: "a", packId: "stats-002", origin: "curated" })], topics, "2026-01-01");
    const orphan = decks.find((d) => d.key === "p:stats-002")!;
    expect(orphan).toBeTruthy();
    expect(orphan.title).toBe("توزیع نرمال و شاخص‌های مرکزی"); // نامِ ذخیره‌شده در پک
    expect(orphan.myCards.length).toBe(1);
  });

  it("کارتِ بدون مبحث در هیچ مجموعه‌ای نمی‌آید ولی کلید تکراریِ منتخب یکتاست", () => {
    const decks = buildDecks([card({ id: "free" })], topics, "2026-01-01");
    expect(decks.length).toBe(CURATED_PACKS.length); // فقط بانک منتخب‌ها
    expect(curatedCardKey("p", " سوال ")).toBe("p::سوال");
  });

  it("shuffleSeededId ترتیب پایدار برای همان seed می‌دهد", () => {
    const arr = [{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }];
    const a = shuffleSeededId(arr, 123);
    const b = shuffleSeededId(arr, 123);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    expect([...a].sort((x, y) => x.id.localeCompare(y.id)).map((x) => x.id)).toEqual(["1", "2", "3", "4"]);
  });
});

// اطمینان از این‌که همه‌ی کارت‌های هر پک، سوال و جواب غیرخالی دارند
describe("curated packs sanity", () => {
  it("هر پک شناسه‌ی یکتا و کارت‌های معتبر دارد", () => {
    const ids = CURATED_PACKS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of CURATED_PACKS) {
      expect(p.cards.length).toBeGreaterThan(0);
      for (const c of p.cards) {
        expect(c.f.trim().length).toBeGreaterThan(3);
        expect(c.b.trim().length).toBeGreaterThan(1);
      }
    }
    // کلیدها نباید با هم تصادم کنند
    for (const p of CURATED_PACKS) {
      const keys = p.cards.map((c) => curatedCardKey(p.id, c.f));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
