import { readdirSync, readFileSync } from "node:fs";
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
    expect(rootHtml).toContain('<div id="root">'); // داخلش اسپلش بوت است، نه خالی
  });

  it("نباید خروجی build شدهٔ درون‌خطی باشد", () => {
    // build: JS/CSS داخل html اینلاین می‌شود و آدرس‌ها هَش می‌خورند
    // (سقف ۷۰۰۰: اسپلش بوت + متاهای سئو عمداً در ریشه‌اند؛ بیلد واقعی صدها کیلوبایت است)
    expect(rootHtml).not.toMatch(/<style rel="stylesheet" crossorigin>/);
    expect(rootHtml).not.toMatch(/-[A-Za-z0-9_-]{8}\.(js|css|webmanifest|svg|png)/);
    expect(rootHtml.length).toBeLessThan(7000);
  });

  it("آدرس PWAها از ریشه است تا Vite آن‌ها را به مسیر نسبی build تبدیل کند", () => {
    expect(rootHtml).toContain('href="/manifest.webmanifest"');
    expect(rootHtml).toContain('href="/icon.svg"');
  });
});

describe("docs/ — خروجی منتشرشده روی GitHub Pages", () => {
  // بیلد عمداً چندچانکی است (اولین باز شدن سبک + کش بهتر)؛ پس لیبل‌ها را در
  // مجموعِ index.html و همه‌ی چانک‌های JS جست‌وجو می‌کنیم، نه فقط در html.
  const distJs = readdirSync("docs/assets")
    .filter((f) => f.endsWith(".js"))
    .map((f) => readFileSync(`docs/assets/${f}`, "utf8"))
    .join("\n");
  const distAll = distHtml + "\n" + distJs;

  it("باید یک build کاملِ چندچانکی باشد", () => {
    expect(distHtml).toMatch(/<script type="module" crossorigin src="\.\/assets\/index-[A-Za-z0-9_-]+\.js"><\/script>/);
    expect(distHtml).toContain('<div id="root">');
    expect(distHtml).not.toContain("/src/main.tsx");
    // مسیرهای lazy واقعاً جدا شده‌اند (Study/Settings/…) تا باز شدن اولیه سبک بماند
    expect(distJs.length).toBeGreaterThan(100_000);
  });

  it("آدرس فایل‌های PWA نسبی و بدون هَش است (همان چیزی که سرویس‌ورکر پیش‌کش می‌کند)", () => {
    expect(distHtml).toContain('href="./manifest.webmanifest"');
    expect(distHtml).toContain('href="./icon.svg"');
  });

  /** فیچرهای جدیدی که باید در build منتشرشده وجود داشته باشند. */
  const SHIPPED_LABELS = [
    "دربارهٔ این اپ",
    "https://t.me/Mahdimr3",
    "پاک‌کردن مرورهای برنامه‌ریزی‌شده",
    "کارگاه برنامهٔ واقعی",
    "جزوهٔ متصل به منبع",
    "وضعیت ذخیره و تاریخچه",
    "از اشتباه مشترک تا تمرین هدفمند",
    "یک قدم روشن، همین حالا",
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
    "باغ حافظه",
    "بینش‌های تو",
    "همراه روز امتحان",
    "الگوریتم فلش‌کارت‌ها",
    "اعلان واقعی (پوش)",
    "دستیار هوشمند (اختیاری)",
    "سایه‌ی دوست",
    "ساخت هوشمند با دستیار",
    "📻 پادکست مرور",
    "کپسول زمان",
    "عادت‌های من",
    "بازتاب امروز",
    "رقابت با سایه",
    "سفر مطالعه",
    "ثبت مطالعه با صدا",
    "حالت روز امتحان",
    "پس‌زمینه‌ی زنده",
    "شروع · قدم",
    "سطل زباله",
    "نقشه‌ی فردا",
    "چک‌لیست:",
    "قالب آماده",
    "ریتم آماده",
    "همگام‌سازی ابری (Supabase)",
  ];

  it.each(SHIPPED_LABELS)("«%s» باید در build منتشرشده باشد", (label) => {
    expect(distAll).toContain(label);
  });

  it("برچسب‌های مبحث و گزارش هفتگی و یار کمکی هم در build هستند", () => {
    expect(distAll).toContain("ضعیفم");
    expect(distAll).toContain("بلدم");
    expect(distAll).toContain("گزارش و مقایسه هفته‌ها");
    expect(distAll).toContain("یار کمکی");
  });
});
