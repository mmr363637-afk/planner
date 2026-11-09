// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import App from "../App";
import { STORAGE_KEY } from "../lib/persist";
import { BANK_SAMPLE_QUESTIONS } from "../lib/examBankSeed";
import { teachingPoints } from "../lib/examAnalysis";

afterEach(cleanup);

function seed() {
  localStorage.clear();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      subjects: [],
      topics: [],
      flashcards: [],
      settings: { onboarded: true },
    }),
  );
}

const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!);

async function openBank() {
  fireEvent.click(screen.getAllByText("امتحانات")[0]);
  fireEvent.click(await screen.findByRole("button", { name: /بانک سؤال پره‌انترنی/ }));
  return screen.findByText(/قلب و عروق/);
}

describe("بانک سؤال پره‌انترنی/دستیاری", () => {
  // ترتیبِ سؤال‌ها در هر اجرا به‌هم می‌ریزد، پس کارت‌ها را با متنِ صورت پیدا می‌کنیم
  const CARDIO = BANK_SAMPLE_QUESTIONS.filter((q) => q.topicId === "internal-cardio");
  const FIRST = CARDIO[0];
  const SECOND = CARDIO[1];

  /** ناوبری تا «مرور پاسخ‌ها» و برگرداندنِ همهٔ کارت‌های سؤال */
  async function reviewCards() {
    const dismiss = screen.queryByRole("button", { name: "بزن بریم! 🚀" });
    if (dismiss) fireEvent.click(dismiss);
    await openBank();
    fireEvent.click(screen.getAllByText(/قلب و عروق/)[0]);
    // حالت آزمونی: بدون بازخورد فوری، با امکان پایان زودهنگام و مرور
    fireEvent.click(screen.getByRole("button", { name: /📝 آزمونی/ }));
    fireEvent.click(screen.getByRole("button", { name: /^شروع آزمون/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^۱\)/ }));
    fireEvent.click(screen.getByRole("button", { name: /پایان زودهنگام آزمون/ }));
    return screen.findAllByTestId("bank-question-card");
  }

  /** کارتِ یک سؤالِ مشخص؛ متنِ صورت، نشانهٔ پایدارِ آن است */
  function cardOf(cards: HTMLElement[], question: { stem: string }) {
    const found = cards.find((c) => (c.textContent ?? "").includes(question.stem));
    if (!found) throw new Error("کارتِ سؤال پیدا نشد");
    return within(found);
  }

  it("بدون تنظیم آدرس، نمونهٔ داخلی را نشان می‌دهد، مبحث را می‌گیرد و پاسخ را ذخیره می‌کند", async () => {
    seed();
    render(<App />);
    const dismiss = screen.queryByRole("button", { name: "بزن بریم! 🚀" });
    if (dismiss) fireEvent.click(dismiss);

    await openBank();
    expect(screen.getByText(/نمونهٔ داخلی/)).toBeTruthy();

    // انتخاب مبحث «قلب و عروق» و شروع آزمون
    fireEvent.click(screen.getAllByText(/قلب و عروق/)[0]);
    fireEvent.click(screen.getByRole("button", { name: /^شروع آزمون/ }));

    // سؤال اول و انتخاب یکی از گزینه‌ها
    const option = await screen.findByRole("button", { name: /^۱\)/ });
    fireEvent.click(option);
    expect(await screen.findByText(/✅ درست|❌ غلط/)).toBeTruthy();

    const state = saved();
    expect(state.examBankAttempts?.length).toBe(1);
    expect(state.examBankAttempts[0].topicId).toBe("internal-cardio");
    // فقط متادیتای کوچک ذخیره می‌شود — نه متن سؤال/گزینه/پاسخنامه
    expect(Object.keys(state.examBankAttempts[0]).sort()).toEqual(
      ["at", "correct", "examType", "id", "ms", "questionId", "selectedIndex", "topicId", "topicTitle", "year"].sort(),
    );
  });

  it("گزینه‌ها خط‌به‌خط رندر و رنگ می‌شوند — نه یک پاراگرافِ چسبیده", async () => {
    seed();
    render(<App />);
    const cards = await reviewCards();
    expect(cards.length).toBe(CARDIO.length);

    const cardEl = cards.find((c) => (c.textContent ?? "").includes(FIRST.stem))!;
    const card = within(cardEl);
    const rows = card.getAllByTestId(/^option-row-/);
    expect(rows.length).toBe(4);
    // هر ردیف دقیقاً برچسبِ یکی از گزینه‌ها را دارد (۱ تا ۴، بدون تکرار)
    const labels = rows.map((row) => row.querySelector("[aria-label]")?.getAttribute("aria-label") ?? "");
    expect(labels.map((l) => l.slice(0, 2))).toEqual(["۱)", "۲)", "۳)", "۴)"]);
    expect(new Set(labels).size).toBe(4);
    // متنِ هر گزینه داخلِ ردیفِ خودش است، نه ردیفِ دیگر
    FIRST.options.forEach((option, i) => {
      expect(labels[i]).toContain(option);
      expect(rows.filter((r) => (r.textContent ?? "").includes(option))).toHaveLength(1);
    });

    // رنگِ درست/غلط روی همان گزینه است؛ کارتِ سؤال بی‌رنگ می‌ماند
    const tone = (row: HTMLElement) => row.querySelector("[aria-label]")?.className ?? "";
    expect(tone(rows[FIRST.correctIndex])).toContain("teal");
    expect(/rose|teal|indigo/.test(cardEl.className)).toBe(false);

    // فقط سؤالی که پاسخ داده شده «انتخابِ تو» دارد
    const answeredEls = cards.filter((c) => (c.textContent ?? "").includes("انتخابِ تو"));
    expect(answeredEls).toHaveLength(1);
    const answeredEl = answeredEls[0];
    const answeredRows = within(answeredEl).getAllByTestId(/^option-row-/);
    const picked = answeredRows.findIndex((row) => (row.textContent ?? "").includes("انتخابِ تو"));
    expect(picked).toBe(0); // گزینهٔ ۱ را زدیم
    const answeredQ = CARDIO.find((q) => (answeredEl.textContent ?? "").includes(q.stem))!;
    // گزینهٔ درست همیشه سبز است — حتی وقتی کاربر چیز دیگری انتخاب کرده
    expect(tone(answeredRows[answeredQ.correctIndex])).toContain("teal");
    if (answeredQ.correctIndex !== picked) expect(tone(answeredRows[picked])).toContain("rose");
    // گزینه‌های بی‌ربط نه سبز می‌شوند نه قرمز
    expect(
      answeredRows.filter((row, i) => i !== picked && i !== answeredQ.correctIndex && /rose|teal/.test(tone(row))),
    ).toHaveLength(0);

    // توضیح و نکات، دو بخشِ جدا از گزینه‌ها
    expect(card.getByText(/📝 پاسخِ تشریحی/)).toBeTruthy();
    expect(card.getByText(/🧠 نکاتِ آموزشی/)).toBeTruthy();
    // پاسخنامهٔ بدونِ ساختار، همان‌طور که هست در بخشِ توضیح نشان داده می‌شود
    expect(cardEl.textContent ?? "").toContain(FIRST.explanation.slice(0, 40));
    // و نکته‌های آموزشی جای خودشان‌اند — قاطیِ توضیح نمی‌شوند
    for (const point of teachingPoints(FIRST)) {
      expect(cardEl.textContent ?? "").toContain(point);
    }
  });

  it("هر نکتهٔ آموزشی جداگانه به فلش‌کارتِ واقعی تبدیل می‌شود", async () => {
    seed();
    render(<App />);
    const card = cardOf(await reviewCards(), FIRST);

    // سؤالِ چندنکته‌ای: هر نکته یک ردیف، یک تیک و یک دکمهٔ افزودنِ خودش را دارد
    const expected = teachingPoints(FIRST);
    expect(expected.length).toBeGreaterThan(1);
    const picks = card.getAllByRole("checkbox", { name: /برای افزودن به فلش‌کارت/ });
    const addButtons = card.getAllByRole("button", { name: /＋ فلش‌کارت/ });
    expect(picks.length).toBe(expected.length);
    expect(addButtons.length).toBe(expected.length);
    fireEvent.click(addButtons[0]);

    const state = saved();
    expect(state.flashcards?.length).toBe(1);
    expect(state.flashcards[0].front).toBe(`📌 ${expected[0]}`);
    // پشتِ کارت ارجاعِ سؤالِ اصلی را نگه می‌دارد تا در مرور معلوم باشد از کجاست
    expect(state.flashcards[0].back).toContain(FIRST.options[FIRST.correctIndex]);
    expect(state.flashcards[0].sourceQuestion.year).toBeGreaterThanOrEqual(1390);
    expect(state.flashcards[0].sourceQuestion.year).toBeLessThanOrEqual(1500);
    expect(state.flashcards[0].sourceQuestion.questionId).toMatch(/^seed-/);
    // کلیدِ یکتای نکته — پایهٔ جلوگیری از فلش‌کارتِ تکراری در اجرای بعدی
    expect(state.flashcards[0].sourceKey).toMatch(/^bkp:seed-/);
    // کارت در همان سیستمِ SM-2 اپ است: ضریبِ آسانی، فاصله و تاریخِ مرور
    expect(state.flashcards[0].ef).toBe(2.5);
    expect(state.flashcards[0].repetitions).toBe(0);
    expect(typeof state.flashcards[0].dueDate).toBe("string");
    expect(state.topics?.some((t: { name: string }) => t.name === "قلب و عروق")).toBe(true);

    // دکمهٔ همان نکته «✓ اضافه شد» و غیرفعال می‌شود — کلیکِ دوباره کارتِ دوم نمی‌سازد
    expect(card.getAllByRole("button", { name: /✓ اضافه شد/ }).length).toBe(1);
    // نکتهٔ بعدیِ همان سؤال، مستقل اضافه می‌شود (دکمهٔ نکتهٔ قبلی دیگر «＋» نیست)
    fireEvent.click(card.getAllByRole("button", { name: /＋ فلش‌کارت/ })[0]);
    expect(saved().flashcards?.length).toBe(2);
    expect(saved().flashcards[1].front).toBe(`📌 ${expected[1]}`);
  });

  it("افزودنِ گروهیِ نکتهٔ انتخاب‌شده کار می‌کند و در اجرای بعدی تکرار نمی‌شود", async () => {
    seed();
    render(<App />);
    const card = cardOf(await reviewCards(), SECOND);
    fireEvent.click(card.getAllByRole("checkbox", { name: /برای افزودن به فلش‌کارت/ })[0]);
    fireEvent.click(card.getByRole("button", { name: /نکتهٔ انتخاب‌شده به فلش‌کارت‌ها/ }));
    expect(saved().flashcards?.length).toBe(1);
    const sourceKey = saved().flashcards[0].sourceKey as string;

    // اجرای تازه با همان وضعیتِ ذخیره‌شده: «دیروز اضافه کردم، امروز دوباره می‌بینم»
    cleanup();
    render(<App />);
    const again = cardOf(await reviewCards(), SECOND);
    expect(again.getAllByRole("button", { name: /✓ اضافه شد/ }).length).toBe(1);
    // همان نکته دیگر افزودنی نیست، ولی بقیهٔ نکته‌های همان سؤال چرا
    expect(again.getAllByRole("button", { name: /＋ فلش‌کارت/ }).length).toBeGreaterThan(0);
    fireEvent.click(again.getAllByRole("button", { name: /＋ فلش‌کارت/ })[0]);
    expect(saved().flashcards?.length).toBe(2);
    expect(saved().flashcards[1].sourceKey).not.toBe(sourceKey);
  });

  it("کارتِ ساخته‌شده در نسخهٔ قبل (بی‌sourceKey و بی‌پیشوند) هم «اضافه شده» شناخته می‌شود", async () => {
    seed();
    render(<App />);
    const point = teachingPoints(SECOND)[0];
    const card = cardOf(await reviewCards(), SECOND);
    fireEvent.click(card.getAllByRole("button", { name: /＋ فلش‌کارت/ })[0]);
    expect(saved().flashcards?.length).toBe(1);

    // شکلِ قدیمیِ همان کارت: نه `sourceKey` دارد، نه پیشوندِ «📌 » رویِ رو
    const state = saved();
    delete state.flashcards[0].sourceKey;
    state.flashcards[0].front = point;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    cleanup();
    render(<App />);
    const again = cardOf(await reviewCards(), SECOND);
    // اگر تشخیص با قاعدهٔ خودِ استور (`normalizeCardFront`) یکی نباشد، این‌جا «＋» می‌ماند
    // و کاربر با کلیکِ دوباره پیامِ «تکراری است» می‌گیرد
    expect(again.getAllByRole("button", { name: /✓ اضافه شد/ }).length).toBe(1);
    fireEvent.click(again.getAllByRole("button", { name: /＋ فلش‌کارت/ })[0]);
    // نکتهٔ بعدی اضافه می‌شود، ولی همان نکتهٔ قبلی کارتِ دوم نمی‌سازد
    expect(saved().flashcards?.length).toBe(2);
    expect(saved().flashcards.some((c: { front: string }) => c.front === point)).toBe(true);
  });
});
