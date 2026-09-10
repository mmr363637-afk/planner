// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import App from "../App";
import { buildDecks, shuffleSeededId } from "../components/Flashcards";
import { curatedCardKey, CURATED_PACKS } from "../lib/curatedPacks";
import { toFa } from "../lib/jalali";
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

/** پک موردنظر را از بانک باز می‌کند: گروه درس → دکمه‌ی «افزودن از منتخب‌ها» */
function openPackInBank(packId: string) {
  const pack = CURATED_PACKS.find((p) => p.id === packId)!;
  const groupButton = screen.getByRole("button", { name: new RegExp(`⭐ ${pack.subjectName}`) });
  fireEvent.click(groupButton); // باز کردن گروه درس (accordion)
  const deckEl = screen.getByText(pack.topicName).closest("[data-deck]") as HTMLElement;
  fireEvent.click(within(deckEl).getByRole("button", { name: "افزودن از منتخب‌ها" }));
  return pack;
}

describe("Curated flashcard packs (منتخب) — مبحث‌محور", () => {
  it("نمایش بانک منتخب‌ها و افزودنِ انتخابیِ فقط چند کارتِ دلخواه", () => {
    localStorage.clear();
    render(<App />);
    completeOnboarding();
    // نمونه‌های پزشکی را بارگذاری کن تا پک به مبحث واقعی وصل شود
    fireEvent.click(screen.getAllByText("برنامه")[0]);
    fireEvent.click(screen.getByText("دروس"));
    fireEvent.click(screen.getByText("📚 افزودن / به‌روزرسانی نمونه‌های پزشکی"));
    fireEvent.click(screen.getAllByText("مرور")[0]);
    fireEvent.click(screen.getByRole("button", { name: "🃏 کارت‌ها" }));

    // بانک منتخب‌ها با نامِ ذخیره‌شده در پک دیده می‌شود
    expect(screen.getByText("⭐ بانک فلش‌کارت‌های منتخب")).toBeTruthy();
    const pack = openPackInBank(CURATED_PACKS[0].id);
    const modalTitle = screen.getByText(`🃏 ${pack.topicName}`);
    expect(modalTitle).toBeTruthy();

    // داخل جزئیات مبحث: فقط دو کارتِ اول را تیک می‌زنیم — نه همه را
    fireEvent.click(screen.getAllByRole("button", { name: new RegExp(escapeRe(pack.cards[0].f)) })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: new RegExp(escapeRe(pack.cards[1].f)) })[0]);
    fireEvent.click(screen.getByRole("button", { name: /افزودن ۲ کارت انتخابی به کارت‌های من/ }));

    // فقط ۲ کارت اضافه شد و ردیف‌های اضافه‌شده علامت ✓ دارند
    expect(screen.getByText("کارت‌های من (۲)")).toBeTruthy();
    expect(screen.getAllByText("به کارت‌های تو اضافه شده").length).toBe(2);
    const saved = JSON.parse(localStorage.getItem("study-planner-v1")!);
    expect(saved.flashcards.length).toBe(2);
    expect(saved.flashcards[0].origin).toBe("curated");
    expect(saved.flashcards[0].packId).toBe(pack.id);
    // وصل‌شدن به مبحث کاتالوگ: اگر پک topicSampleId دارد، کارت topicId دارد
    if (pack.topicSampleId) expect(saved.flashcards[0].topicId).toBeTruthy();
  });

  it("import دوباره‌ی همان کارت تکراری اضافه نمی‌کند (idempotent)", () => {
    localStorage.clear();
    // پکی که فقط یک پک به مبحثش وصل است تا «انتخاب همه» قطعی باشد
    const pack = CURATED_PACKS.find((p) => CURATED_PACKS.filter((x) => x.topicSampleId === p.topicSampleId).length === 1 && p.topicSampleId)!;
    render(<App />);
    completeOnboarding();
    goToCardsTab();

    openPackInBank(pack.id);
    fireEvent.click(screen.getByRole("button", { name: "انتخاب همه" }));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`افزودن ${toFa(pack.cards.length)} کارت انتخابی`) }));
    expect(screen.getByText(`کارت‌های من (${toFa(pack.cards.length)})`)).toBeTruthy();

    // انتخاب همه‌ی باقی‌مانده دیگر در دسترس نیست (باقی‌مانده = ۰)
    expect(screen.queryByRole("button", { name: "انتخاب همه" })).toBeNull();
    const saved = JSON.parse(localStorage.getItem("study-planner-v1")!);
    expect(saved.flashcards.length).toBe(pack.cards.length);
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
  const pack0 = CURATED_PACKS.find((p) => p.topicSampleId)!;
  const topics: Topic[] = [
    { id: "t1", subjectId: "s1", name: "مبحث یک", volume: 1, estimatedMinutes: 10, priority: "medium", difficulty: 1, status: "learning", sampleId: pack0.topicSampleId, createdAt: 1 },
    { id: "t2", subjectId: "s1", name: "مبحث دو", volume: 1, estimatedMinutes: 10, priority: "medium", difficulty: 1, status: "learning", createdAt: 1 },
  ];
  const card = (over: Partial<Flashcard>): Flashcard => ({
    id: over.id ?? "x", front: "ف", back: "ب", ef: 2.5, intervalDays: 0, repetitions: 0, dueDate: "2020-01-01", lapses: 0, createdAt: 1, ...over,
  });

  it("کارت‌ها بر اساس مبحث گروه می‌شوند و پکِ همان مبحث شناخته می‌شود", () => {
    const decks = buildDecks([card({ id: "a", topicId: "t1" }), card({ id: "b", topicId: "t1" }), card({ id: "c", topicId: "t2" })], topics, "2026-01-01");
    const d1 = decks.find((d) => d.key === "t:t1")!;
    expect(d1.myCards.length).toBe(2);
    expect(d1.packs.length).toBeGreaterThan(0);
    expect(d1.packs.every((p) => p.topicSampleId === pack0.topicSampleId)).toBe(true);
    expect(d1.dueCount).toBe(2);
    const d2 = decks.find((d) => d.key === "t:t2")!;
    expect(d2.myCards.length).toBe(1);
    expect(d2.packs.length).toBe(0); // مبحث بدون sampleId پک ندارد
  });

  it("کارت منتخبِ بدون مبحث در فهرست کاربر، با کلید پک گروه می‌شود", () => {
    const standalone = CURATED_PACKS.find((p) => !p.topicSampleId)!;
    const decks = buildDecks([card({ id: "a", packId: standalone.id, origin: "curated" })], topics, "2026-01-01");
    const orphan = decks.find((d) => d.key === `p:${standalone.id}`)!;
    expect(orphan).toBeTruthy();
    expect(orphan.title).toBe(standalone.topicName); // نامِ ذخیره‌شده در پک
    expect(orphan.myCards.length).toBe(1);
  });

  it("کارتِ بدون مبحث در هیچ مجموعه‌ای نمی‌آید ولی کلید تکراریِ منتخب یکتاست", () => {
    const decks = buildDecks([card({ id: "free" })], topics, "2026-01-01");
    // هیچ مجموعه‌ای کارتِ بی‌مبحث را نگه نمی‌دارد
    expect(decks.every((d) => !d.myCards.some((c) => c.id === "free"))).toBe(true);
    // و کلید همه‌ی مجموعه‌ها یکتاست
    expect(new Set(decks.map((d) => d.key)).size).toBe(decks.length);
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

// اطمینان از سلامتِ داده‌ی generated
describe("curated packs sanity", () => {
  it("پک‌های زیاد و متنوع داریم؛ هر پک شناسه‌ی یکتا و کارت‌های معتبر دارد", () => {
    expect(CURATED_PACKS.length).toBeGreaterThan(100);
    const totalCards = CURATED_PACKS.reduce((s, p) => s + p.cards.length, 0);
    expect(totalCards).toBeGreaterThan(4000);

    const ids = CURATED_PACKS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of CURATED_PACKS) {
      expect(p.cards.length).toBeGreaterThan(0);
      for (const c of p.cards) {
        expect(c.f.trim().length).toBeGreaterThan(3);
        expect(c.b.trim().length).toBeGreaterThan(0);
      }
      // کلیدها نباید با هم تصادم کنند
      const keys = p.cards.map((c) => curatedCardKey(p.id, c.f));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

/** escape برای regex فارسی/لاتین در getByRole name */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
