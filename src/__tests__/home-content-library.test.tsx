// @vitest-environment jsdom
// 📚 کارتِ «محتوای آمادهٔ مطالعه» در صفحهٔ اول (خانه).
//
// چرا این تست وجود دارد؟ فیچرهای محتوا (بانکِ سؤال و درسنامه‌ها) تا پیش از این فقط از
// تب‌های «امتحانات» و «دروس» reachable بودند؛ یعنی کاربرِ قدیمی بعد از به‌روزرسانی
// هیچ نشانه‌ای از تغییر در صفحهٔ اول نمی‌دید. این تست همان خواسته را قفل می‌کند:
// ورودیِ محتوا باید در صفحهٔ اول باشد — هم برای نصبِ تازه، هم برای چیدمانِ ذخیره‌شدهٔ
// نسخهٔ قبل.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "../App";
import { STORAGE_KEY } from "../lib/persist";
import { APP_VERSION, faVersion } from "../lib/appVersion";
import { CHANGELOG } from "../lib/changelog";
import { LIBRARY_CACHE_KEY, clearLibraryCache } from "../lib/lessonLibrary";
import type { HomeCardLayout } from "../types";

const MANIFEST = {
  version: 1,
  schema: "med-library/1",
  updatedAt: "2026-11-08",
  counts: { subjects: 1, lessons: 1, minutes: 45 },
  subjects: [{ key: "cardio", name: "قلب و عروق", icon: "❤️", count: 1, minutes: 45, appSubjectKeys: ["cardiology-nematpour"] }],
  lessons: [
    {
      id: "cardio/aortic-stenosis",
      subject: "cardio",
      title: "تنگی دریچهٔ آئورت",
      path: "cardio/aortic-stenosis.html",
      sections: 9,
      words: 4200,
      minutes: 45,
      flashcards: 180,
      tables: 12,
      mcq: 30,
      appSubjectKeys: ["cardiology-nematpour"],
    },
  ],
  qbank: { index: "qbank/index.html", total: 320, parts: [{ part: "cardio", title: "قلب", count: 320, page: "qbank/cardio.html", standalone: "qbank/cardio-standalone.html" }] },
};

/** کتابخانه آنلاین فرض می‌شود؛ بقیهٔ درخواست‌ها (بانک و…) ۴۰۴ تا اپ سراغ نمونهٔ داخلی برود */
function stubFetch() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/lib/manifest.json")) {
      return { ok: true, status: 200, json: async () => MANIFEST } as unknown as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
  }) as typeof fetch;
}

function seed(homeLayout?: HomeCardLayout[]) {
  localStorage.clear();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      subjects: [],
      topics: [],
      flashcards: [],
      settings: { onboarded: true, lastSeenVersion: APP_VERSION, lastSeenChangelogVersion: APP_VERSION, ...(homeLayout ? { homeLayout } : {}) },
    }),
  );
}

const LONG = { timeout: 25_000 };

beforeEach(() => {
  clearLibraryCache();
  localStorage.removeItem(LIBRARY_CACHE_KEY);
  stubFetch();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function openHome() {
  render(<App />);
  const dismiss = screen.queryByRole("button", { name: "بزن بریم! 🚀" });
  if (dismiss) fireEvent.click(dismiss);
  return screen.findByTestId("home-content-library", undefined, LONG);
}

describe("کارتِ محتوا در صفحهٔ اول", () => {
  it("برای نصبِ تازه در خانه دیده می‌شود و هر دو ورودی را دارد", async () => {
    seed();
    const card = await openHome();
    expect(card.textContent ?? "").toContain("محتوای آمادهٔ مطالعه");
    // نسخهٔ جاری روی خودِ کارت نوشته می‌شود تا معلوم باشد چه چیزی تازه است
    expect(card.textContent ?? "").toContain(`تازه در ${faVersion()}`);
    expect(screen.getByRole("button", { name: "🏥 بانکِ سؤال" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "📖 درسنامه‌ها" })).toBeTruthy();
    // 🎬 راهنما هم از همین کارت در دسترس است (پخشِ داخلِ اپ، نه لینکِ بیرونی)
    expect(screen.getByRole("button", { name: "🎬 ویدیوهای راهنمای اپ" })).toBeTruthy();
  });

  it("برای کاربرِ نسخهٔ قبل (چیدمانِ ذخیره‌شدهٔ قدیمی) هم دیده می‌شود", async () => {
    // همین وضعیت، باگِ «کارتِ تازه تهٔ فهرست و خاموش» را بازتولید می‌کند
    seed([{ id: "quote", visible: true }]);
    const card = await openHome();
    expect(card).toBeTruthy();
  });

  it("اگر کاربر خودش خاموشش کرده باشد، در صفحهٔ اول نمی‌آید", async () => {
    seed([
      { id: "contentLibrary", visible: false },
      { id: "tasks", visible: true },
    ]);
    render(<App />);
    const dismiss = screen.queryByRole("button", { name: "بزن بریم! 🚀" });
    if (dismiss) fireEvent.click(dismiss);
    // خانه رندر شده (ناوبریِ پایین همیشه هست) ولی کارتِ محتوا خاموش است
    await screen.findByText("امتحانات", undefined, LONG);
    expect(screen.queryByTestId("home-content-library")).toBeNull();
  });

  it("«🏥 بانکِ سؤال» به تبِ امتحانات و همان بخشِ بانک می‌برد", async () => {
    seed();
    await openHome();
    fireEvent.click(screen.getByRole("button", { name: "🏥 بانکِ سؤال" }));
    expect(await screen.findByRole("button", { name: /بانک سؤال پره‌انترنی/ }, LONG)).toBeTruthy();
  });

  it("«📖 درسنامه‌ها» کتابخانه را مستقیم باز می‌کند (نه فقط صفحهٔ دروس)", async () => {
    seed();
    await openHome();
    fireEvent.click(screen.getByRole("button", { name: "📖 درسنامه‌ها" }));
    expect(await screen.findByRole("dialog", { name: /کتابخانهٔ درسنامه‌ها/ }, LONG)).toBeTruthy();
    expect(await screen.findByLabelText("جست‌وجوی درسنامه", undefined, LONG)).toBeTruthy();
    // محتوای مخزن واقعاً گرفته و فهرست شده
    // عنوان در ردیفِ فهرست و در کارتِ «از همین‌جا ادامه بده» می‌آید
    expect((await screen.findAllByText(/تنگی دریچهٔ آئورت/, undefined, LONG)).length).toBeGreaterThan(0);
  });

  // یادداشتِ «چی جدیده؟» حالا یک پنجرهٔ سراسریِ App است (کارتِ خانه فقط رویداد
  // می‌فرستد) تا هم منو و هم تنظیمات بتوانند بازش کنند — پس دو عکسِ لحظه‌ای هم
  // نباید هم‌زمان رندر شوند.
  it("«✨ چه چیزهایی تازه شد؟» یادداشتِ همین نسخه را نشان می‌دهد", async () => {
    seed();
    await openHome();
    fireEvent.click(screen.getByRole("button", { name: /چه چیزهایی در این نسخه تازه شد/ }));
    // چرا querySelector به‌جای getByRole؟ عنوانِ پنجره «✨ چی جدیه؟» است و نامِ
    // قابلِ‌دسترسیِ Modal از خودِ عنوان ساخته می‌شود؛ ولی `#id` عنوان به two نقطه
    // حساس است، پس همان data-testid پنجرهٔ سراسری را می‌گیریم.
    await screen.findByRole("button", { name: "بزن بریم! 🚀" }, LONG);
    const dialogs = screen.getAllByRole("dialog");
    expect(dialogs).toHaveLength(1);
    const latest = CHANGELOG[0];
    expect(latest.version).toBe(APP_VERSION);
    expect(screen.getByText(latest.title)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "بزن بریم! 🚀" }));
    // بستنِ یادداشت، کارتِ محتوا را از صفحهٔ اول برنمی‌دارد
    expect(screen.getByTestId("home-content-library")).toBeTruthy();
  });

  it("دکمهٔ ☰ همهٔ امکانات دسته‌بندی‌شده را در گوشی هم نشان می‌دهد", async () => {
    seed();
    await openHome();
    fireEvent.click(screen.getByRole("button", { name: /همهٔ امکانات/ }));
    const menu = await screen.findByRole("dialog", { name: /همهٔ امکانات/ }, LONG);
    // چهار دستهٔ منو، و آیتم‌های کلیدیِ «گوشه‌افتاده» داخلش هستند
    for (const label of ["محتوا و مطالعه", "ابزارها", "پیشرفت", "راهنما و برنامه"]) {
      expect(menu.textContent ?? "").toContain(label);
    }
    for (const label of ["بانکِ سؤال پره‌انترنی/دستیاری", "استودیوی صوتی", "ویدیوهای راهنمای اپ"]) {
      expect(menu.textContent ?? "").toContain(label);
    }
  });

  it("«🎬 ویدیوهای راهنمای اپ» فهرستِ ویدیوها را داخلِ اپ باز می‌کند", async () => {
    seed();
    await openHome();
    fireEvent.click(screen.getByRole("button", { name: "🎬 ویدیوهای راهنمای اپ" }));
    const dialog = await screen.findByRole("dialog", { name: /ویدیوهای راهنمای اپ/ }, LONG);
    expect(dialog.textContent ?? "").toContain("شروعِ کار با برنامه‌ریز مطالعه");
    // هیچ تگِ ویدیویی قبل از انتخابِ قسمت ساخته نمی‌شود (بدونِ دانلودِ ۱۲ مگابایت)
    expect(document.querySelector("video")).toBeNull();
  });
});
