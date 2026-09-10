import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * نگهبانِ «چرا فیچر جدید را نمی‌بینم؟».
 *
 * یک بار فایل `index.html` ریشه (که Vite آن را به‌عنوان نقطهٔ ورود می‌خواند) با خروجیِ
 * buildِ inlined جایگزین شد. در آن حالت `npm run dev` و `npm run build` دیگر هرگز src/ را
 * کامپایل نمی‌کنند: همه‌چیز سبز است، تست‌ها پاس می‌شوند، ولی اپ — روی دستگاه کاربر و روی
 * GitHub Pages — همان نسخهٔ قدیمی می‌ماند و فیچرهای تازه «گم» می‌شوند.
 * این تست همان فاجعه را با یک assert ساده می‌گیرد.
 */

const rootHtml = readFileSync("index.html", "utf8");
const distHtml = readFileSync("docs/index.html", "utf8");

describe("index.html ریشه — نقطهٔ ورود Vite", () => {
  it("باید ماژول /src/main.tsx را بارگذاری کند", () => {
    expect(rootHtml).toMatch(/<script type="module" src="\/src\/main\.tsx"><\/script>/);
    expect(rootHtml).toContain('<div id="root"></div>');
  });

  it("نباید خروجی build شدهٔ درون‌خطی باشد", () => {
    // build: JS/CSS داخل html اینلاین می‌شود و آدرس‌ها هَش می‌خورند
    expect(rootHtml).not.toMatch(/<style rel="stylesheet" crossorigin>/);
    expect(rootHtml).not.toMatch(/-[A-Za-z0-9_-]{8}\.(js|css|webmanifest|svg|png)/);
    expect(rootHtml.length).toBeLessThan(4000);
  });

  it("آدرس PWAها از ریشه است تا Vite آن‌ها را به مسیر نسبی build تبدیل کند", () => {
    expect(rootHtml).toContain('href="/manifest.webmanifest"');
    expect(rootHtml).toContain('href="/icon.svg"');
  });
});

describe("docs/index.html — خروجی منتشرشده روی GitHub Pages", () => {
  it("باید یک build کامل باشد (JS/CSS درون‌خطی)", () => {
    expect(distHtml).toMatch(/<script type="module" crossorigin>/);
    expect(distHtml).toContain('<div id="root"></div>');
    expect(distHtml).not.toContain("/src/main.tsx");
  });

  it("آدرس فایل‌های PWA نسبی و بدون هَش است (همان چیزی که سرویس‌ورکر پیش‌کش می‌کند)", () => {
    expect(distHtml).toContain('href="./manifest.webmanifest"');
    expect(distHtml).toContain('href="./icon.svg"');
  });

  /** فیچرهای جدیدی که باید در build منتشرشده وجود داشته باشند. */
  const SHIPPED_LABELS = [
    "حالت تمرکز عمیق",
    "🎓 شبیه‌ساز آزمون",
    "📝 یادداشت‌برداری حین مطالعه",
    "🎯 هدف ماهانه",
    "📅 گزارش ماهانه",
    "🔊 متن‌خوان هوشمند",
    "خودکار 🌙",
    "🏷️ برچسبِ",
    "ابزارهای مطالعه",
    "✨ برنامه هوشمند",
    "دفتر اشتباهات",
    "درخت تمرکز",
    "📻 پادکست مرور",
    "کپسول زمان",
    "همگام‌سازی ابری",
    "عادت‌های من",
    "بازتاب امروز",
    "رقابت با سایه",
    "سفر مطالعه",
    "ثبت مطالعه با صدا",
    "حالت روز امتحان",
    "پس‌زمینه‌ی زنده",
    "شروع · قدم",
  ];

  it.each(SHIPPED_LABELS)("«%s» باید در build منتشرشده باشد", (label) => {
    expect(distHtml).toContain(label);
  });

  it("برچسب‌های مبحث و گزارش هفتگی و یار کمکی هم در build هستند", () => {
    expect(distHtml).toContain("ضعیفم");
    expect(distHtml).toContain("بلدم");
    expect(distHtml).toContain("گزارش و مقایسه هفته‌ها");
    expect(distHtml).toContain("یار کمکی");
  });
});
