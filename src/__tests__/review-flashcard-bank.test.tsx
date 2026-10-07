// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, configure, fireEvent, render, screen, within } from "@testing-library/react";
import App from "../App";
import { ensureCuratedPacks, getCuratedPacks, type CuratedPack } from "../lib/curatedPacks";
import { STORAGE_KEY } from "../lib/persist";
import { toFa, todayKey } from "../lib/jalali";

afterEach(cleanup);
configure({ asyncUtilTimeout: 10000 });

beforeAll(async () => {
  await ensureCuratedPacks();
}, 60000);

/**
 * پکی که تنها پکِ مبحثش است و تعداد کارتش متوسط است تا هم تأییدِ «افزودن همه»
 * (بالای ۱۰ کارت) تست شود و هم جلسه‌ی مرورش سنگین نباشد.
 */
function mediumPack(): CuratedPack {
  const packs = getCuratedPacks();
  const pack = packs.find(
    (p) =>
      p.topicSampleId != null &&
      p.cards.length > 10 &&
      p.cards.length <= 25 &&
      packs.filter((x) => x.topicSampleId === p.topicSampleId).length === 1,
  );
  if (!pack) throw new Error("پک متوسطِ تک‌مبحثی برای تست پیدا نشد");
  return pack;
}

/** مبحثِ کاربر که به همان پک بانک وصل است، با یک مرور سررسیدشده و بدون کارت شخصی */
function seedTopicWithDueReview(pack: CuratedPack, flashcards: unknown[] = []) {
  localStorage.clear();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      subjects: [{ id: "s1", name: pack.subjectName, color: "#0ea5e9", priority: "high", createdAt: 1 }],
      topics: [
        {
          id: "t1",
          sampleId: pack.topicSampleId,
          subjectId: "s1",
          name: pack.topicName,
          volume: 10,
          estimatedMinutes: 60,
          priority: "medium",
          difficulty: 2,
          status: "learning",
          createdAt: 1,
        },
      ],
      reviews: [{ id: "r1", topicId: "t1", dueDate: todayKey(), reviewNumber: 1, stage: 0, intervalDays: 1, status: "pending" }],
      flashcards,
      settings: { onboarded: true },
    }),
  );
}

const savedCards = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!).flashcards as unknown[];

/** مثل کاربر واقعی، مودال «چی جدیده؟» را می‌بندد تا متن‌هایش با کوئری‌ها قاطی نشود */
function renderApp() {
  const view = render(<App />);
  const dismiss = screen.queryByRole("button", { name: "بزن بریم! 🚀" });
  if (dismiss) fireEvent.click(dismiss);
  return view;
}

/** دکمه‌ی «افزودن همه» را می‌زند و اگر مودال تأیید باز شد، تأییدش می‌کند */
function clickBulkAdd(button: HTMLElement, count: number) {
  fireEvent.click(button);
  const confirm = screen.queryByRole("button", { name: new RegExp(`^افزودن ${toFa(count)} کارت$`) });
  if (confirm) fireEvent.click(confirm);
}

describe("تب مرور ← «با فلش‌کارت» وقتی کارتی از بانک اضافه نشده", () => {
  it("به‌جای «۰ کارت مرور شد» وضعیت واقعی و راه‌حل یک‌تپه نشان داده می‌شود", async () => {
    const pack = mediumPack();
    seedTopicWithDueReview(pack);
    renderApp();

    fireEvent.click(screen.getAllByText("مرور")[0]);
    const row = await screen.findByText(pack.topicName);
    expect(row).toBeTruthy();

    // برچسب دکمه صریح است: این مبحث فقط کارت بانک دارد و هنوز اضافه نشده
    fireEvent.click(screen.getByRole("button", { name: "🃏 افزودن و مرور" }));

    // باگ قدیمی: جلسه‌ی خالی با «۰ کارت مرور شد» تمام می‌شد
    expect(await screen.findByText("برای این مجموعه هنوز کارتی در «کارت‌های من» نیست")).toBeTruthy();
    expect(screen.queryByText(/کارت مرور شد/)).toBeNull();
    expect(screen.getByRole("button", { name: new RegExp(`افزودن همه‌ی ${toFa(pack.cards.length)} کارت منتخب و شروع مرور`) })).toBeTruthy();
    // هنوز هیچ کارتی اضافه نشده
    expect(savedCards().length).toBe(0);
  });

  it("«افزودن همه و شروع مرور» همهٔ کارت‌های منتخب مبحث را یک‌جا اضافه می‌کند و جلسه را شروع می‌کند", async () => {
    const pack = mediumPack();
    seedTopicWithDueReview(pack);
    renderApp();

    fireEvent.click(screen.getAllByText("مرور")[0]);
    fireEvent.click(await screen.findByRole("button", { name: "🃏 افزودن و مرور" }));

    const bulk = await screen.findByRole("button", { name: new RegExp(`افزودن همه‌ی ${toFa(pack.cards.length)} کارت منتخب و شروع مرور`) });
    clickBulkAdd(bulk, pack.cards.length);

    // همه‌ی کارت‌های پک یک‌جا اضافه شدند (نه دونه‌دونه) و جلسه روی همان‌ها شروع شد
    expect(savedCards().length).toBe(pack.cards.length);
    expect(await screen.findByText(new RegExp(`کارت ۱ از ${toFa(pack.cards.length)}`))).toBeTruthy();
    expect(screen.queryByText("برای این مجموعه هنوز کارتی در «کارت‌های من» نیست")).toBeNull();
  });

  it("اگر کارت دارد ولی هیچ‌کدام سررسید نشده‌اند، «مرور همه» پیشنهاد می‌شود (نه «۰ کارت»)", async () => {
    const pack = mediumPack();
    const future = "2099-01-01";
    seedTopicWithDueReview(pack, [
      { id: "c1", topicId: "t1", front: "سوال یک؟", back: "جواب یک", ef: 2.5, intervalDays: 10, repetitions: 3, dueDate: future, lapses: 0, createdAt: 1, origin: "user" },
      { id: "c2", topicId: "t1", front: "سوال دو؟", back: "جواب دو", ef: 2.5, intervalDays: 10, repetitions: 3, dueDate: future, lapses: 0, createdAt: 1, origin: "user" },
    ]);
    renderApp();

    fireEvent.click(screen.getAllByText("مرور")[0]);
    fireEvent.click(await screen.findByRole("button", { name: "🃏 با فلش‌کارت" }));

    expect(await screen.findByText("الان کارتِ سررسیدشده‌ای نداری")).toBeTruthy();
    expect(screen.queryByText(/کارت مرور شد/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: new RegExp("مرور همه‌ی ۲ کارت") }));
    expect(await screen.findByText(new RegExp(`کارت ۱ از ${toFa(2)}`))).toBeTruthy();
  });
});

describe("بانک منتخب‌ها ← افزودن یک‌جای همه", () => {
  /** رفتن به تب کارت‌ها و باز کردن گروه درسِ همان پک */
  async function openBankGroup(subjectName: string) {
    fireEvent.click(screen.getAllByText("مرور")[0]);
    fireEvent.click(await screen.findByRole("button", { name: "🃏 کارت‌ها" }));
    await screen.findByText("⭐ بانک فلش‌کارت‌های منتخب");
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`⭐ ${subjectName}`) }));
  }

  it("دکمهٔ «افزودن همه» در کارت بانک، همهٔ کارت‌های مبحث را با یک تپ اضافه می‌کند", async () => {
    const pack = mediumPack();
    seedTopicWithDueReview(pack);
    renderApp();
    await openBankGroup(pack.subjectName);

    const deckEl = screen.getByText(pack.topicName).closest("[data-deck]") as HTMLElement;
    clickBulkAdd(within(deckEl).getByRole("button", { name: new RegExp(`افزودن همه \\(${toFa(pack.cards.length)}\\)`) }), pack.cards.length);

    expect(savedCards().length).toBe(pack.cards.length);
    // مجموعه از «بانک» به فهرست مباحثِ من می‌آید: خبری از «افزودن همه» نیست و دکمه‌اش «مرور» است
    const after = screen.getByText(pack.topicName).closest("[data-deck]") as HTMLElement;
    expect(after.dataset.deck).toBe("t:t1");
    expect(within(after).queryByRole("button", { name: /افزودن همه/ })).toBeNull();
    expect(within(after).getByRole("button", { name: /مرور این مبحث/ })).toBeTruthy();
  });

  it("داخل جزئیات مبحث هم افزودن یک‌جای باقی‌مانده‌ها هست و انتخاب دستی سر جایش می‌ماند", async () => {
    const pack = mediumPack();
    seedTopicWithDueReview(pack);
    renderApp();
    await openBankGroup(pack.subjectName);

    const deckEl = screen.getByText(pack.topicName).closest("[data-deck]") as HTMLElement;
    fireEvent.click(within(deckEl).getByRole("button", { name: "افزودن از منتخب‌ها" }));

    const bulk = await screen.findByRole("button", { name: new RegExp(`افزودن همه‌ی ${toFa(pack.cards.length)} کارت باقی‌مانده`) });
    expect(screen.getByRole("button", { name: "انتخاب همه" })).toBeTruthy(); // انتخاب دستی برنگشته
    clickBulkAdd(bulk, pack.cards.length);

    expect(savedCards().length).toBe(pack.cards.length);
    expect(screen.getByText(`کارت‌های من (${toFa(pack.cards.length)})`)).toBeTruthy();
  });
});
