// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import App from "../App";
import { STORAGE_KEY } from "../lib/persist";
import { accentShades } from "../lib/accent";

/**
 * 🎨 نگهبانِ «تم در بانک سؤال عوض می‌شود».
 *
 * گزارش بچه‌ها: «تم برنامه مثلاً دارکه، ولی وقتی می‌ری تو بانک سؤال پره‌انترنی و
 * دستیاری، یهو تم عوض می‌شود؛ انگار تم آن‌جا با برنامه فرق دارد.»
 *
 * دو ریشه داشت و این تست هر دو را قفل می‌کند:
 *
 *  ۱) **رنگ‌های ثابتِ بیگانه.** بانک سؤال با `indigo-*` و رنگ‌های هاردکد
 *     (`#0d9488`/`#f59e0b`) رنگ می‌شد، در حالی که بقیهٔ اپ یک تمِ واحد دارد
 *     (پالتِ slate + رنگِ برنامه از `--acc-*`). پس همان صفحه شبیهِ یک پنلِ
 *     بیگانه دیده می‌شد — دقیقاً «تمش فرق دارد».
 *  ۲) **کنترل‌های بومیِ مرورگر.** بانک چند `<select>` دارد (نوعِ آزمون، سال)؛
 *     بدونِ `color-scheme`، این‌ها در تمِ تیره سفید باز می‌شدند.
 *
 * این فایل عمداً روی «منبع» تست می‌گذارد نه اسکرین‌شات، چون:
 *  • کلاس‌های Tailwind در jsdom به CSS واقعی تبدیل نمی‌شوند (تستِ بصری این‌جا
 *    دروغ می‌گوید)، ولی «کدام کلاس روی کدام عنصر است» کاملاً قابلِ سنجش است.
 *  • لازم است کلِ فایل‌های بانک پوشش داده شود، حتی صفحاتی که در یک تستِ UI
 *    باز نمی‌شوند (مثلِ تبِ «بانک» و فهرستِ نتیجه).
 */

afterEach(cleanup);

const BANK_FILES = [
  "src/components/ExamBank.tsx",
  "src/components/ExamBankSession.tsx",
  "src/components/BankQuestionCard.tsx",
];

/** همهٔ رشته‌های کلاسِ داخلِ یک فایل (className="…" و رشته‌های cn(...)) */
function classStrings(file: string): { line: number; value: string }[] {
  const src = readFileSync(file, "utf8");
  const out: { line: number; value: string }[] = [];
  src.split("\n").forEach((text, i) => {
    for (const m of text.matchAll(/"([^"\n]*)"|`([^`\n]*)`/g)) {
      const value = m[1] ?? m[2];
      if (value && value.trim()) out.push({ line: i + 1, value });
    }
  });
  return out;
}

describe("بانک سؤال پره‌انترنی/دستیاری — همان تمِ بقیهٔ اپ", () => {
  it("هیچ رنگِ ثابتِ indigo در بانک نمانده — تأکیدِ بانک از رنگِ برنامه می‌آید", () => {
    // `indigo-*` در index.css به `--acc-*` وصل نیست؛ پس هر استفاده‌اش یعنی یک
    // رنگِ بیگانه که با تمِ کاربر عوض نمی‌شود (همان حسِ «تمِ متفاوت»).
    const offenders: string[] = [];
    for (const file of BANK_FILES) {
      for (const { line, value } of classStrings(file)) {
        // توضیح‌های کد (که با // شروع می‌شوند) رنگ محسوب نمی‌شوند، ولی این‌جا
        // کلِ رشته بررسی می‌شود چون کلاس‌ها همیشه داخلِ رشته‌اند.
        if (/\b(?:dark:)?(?:bg|text|border|ring|from|to|via|accent|divide)-indigo-/.test(value)) {
          offenders.push(`${file}:${line} → ${value.trim().slice(0, 90)}`);
        }
      }
    }
    expect(offenders, `رنگِ ثابتِ indigo در بانک پیدا شد (باید teal-* یا پالتِ slate باشد):\n${offenders.join("\n")}`).toEqual([]);
  });

  it("رنگ‌های SVG/نوارِ پیشرفت از «رنگ برنامه» می‌آیند، نه از هگزِ هاردکد", () => {
    const offenders: string[] = [];
    for (const file of BANK_FILES) {
      const src = readFileSync(file, "utf8");
      src.split("\n").forEach((text, i) => {
        // رنگِ برند هاردکدشده (فیروزه‌ای/نارنجیِ پیش‌فرضِ قدیمی)
        if (/#0d9488|#f59e0b/i.test(text)) offenders.push(`${file}:${i + 1} → ${text.trim().slice(0, 90)}`);
      });
    }
    expect(offenders, `رنگِ هاردکد در بانک (باید currentAccentColor() باشد):\n${offenders.join("\n")}`).toEqual([]);
  });

  it("هیچ سطح/متنِ فقط-روشنی در بانک نمانده که در تمِ تیره روشن بماند", () => {
    // الگوهای سطح‌های روشن که بدونِ جفتِ `dark:` روی کارت‌های تیره «سفید» می‌مانند.
    // (bg-white/10 و … عمداً مستثنی‌اند: پردهٔ شفاف روی پس‌زمینه‌های رنگی‌اند.)
    const lightSurface = /\b(?:bg-(?:white|slate-50|slate-100|slate-200)|text-(?:slate-(?:700|800|900)|black)|border-(?:slate-(?:100|200|300)|white))\b/;
    const offenders: string[] = [];
    for (const file of BANK_FILES) {
      for (const { line, value } of classStrings(file)) {
        if (lightSurface.test(value) && !/\bdark:/.test(value)) {
          offenders.push(`${file}:${line} → ${value.trim().slice(0, 100)}`);
        }
      }
    }
    expect(offenders, `سطح/متنِ فقط-روشن در بانک (جفتِ dark: ندارد):\n${offenders.join("\n")}`).toEqual([]);
  });

  it("کلِ سند color-scheme می‌گیرد تا منوهای بومی (select) با تم هم‌رنگ شوند", () => {
    const css = readFileSync("src/index.css", "utf8");
    // تمِ روشن/تیره باید color-scheme هم داشته باشند، وگرنه در بانک (که دو
    // select در صفحهٔ اولش دارد) منوی بازشو سفید می‌مانَد.
    expect(css).toMatch(/html\s*\{[\s\S]*?color-scheme:\s*light/);
    expect(css).toMatch(/html\.dark\s*\{[\s\S]*?color-scheme:\s*dark/);
  });

  it("در حالتِ تیره، پوستهٔ بانک با پوستهٔ بقیهٔ اپ یکسان رنگ می‌گیرد", async () => {
    localStorage.clear();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        subjects: [],
        topics: [],
        flashcards: [],
        settings: {
          onboarded: true,
          theme: "dark",
          themePack: "navy",
          tourSeen: true,
          lastSeenVersion: "1.25.0",
          lastSeenChangelogVersion: "1.25.0",
        },
      }),
    );
    const { container } = render(<App />);
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    fireEvent.click(screen.getAllByText("امتحانات")[0]);
    fireEvent.click(await screen.findByRole("button", { name: /بانک سؤال پره‌انترنی/ }));
    // چانکِ بانک تنبل است؛ تا رندر شدنش صبر کن (سربرگِ بخش)
    await screen.findByText(/🏥 بانک سؤال پره‌انترنی و دستیاری/);

    // پوستهٔ تمام‌صفحهٔ بانک — همان لایه‌ای که کلِ صفحه را می‌پوشانَد
    const findShell = () =>
      [...container.querySelectorAll("div")].find(
        (d) =>
          typeof d.className === "string" &&
          d.className.includes("fixed") &&
          d.className.includes("inset-0") &&
          d.className.includes("overflow-y-auto"),
      ) as HTMLElement | undefined;
    const shell = findShell();
    expect(shell, "پوستهٔ تمام‌صفحهٔ بانک پیدا نشد").toBeTruthy();

    // ۱) پالتِ تم: همان bg-slate-50/dark:bg-slate-900 و رنگِ متنِ پوستهٔ اپ
    expect(shell!.className).toContain("bg-slate-50");
    expect(shell!.className).toContain("dark:bg-slate-900");
    expect(shell!.className).toContain("text-slate-800");
    expect(shell!.className).toContain("dark:text-slate-100");

    // ۲) گرافیکِ پس‌زمینه: بانک هم (مثلِ خانه/آمار) پردهٔ ثابتِ صفحه را دارد،
    //    پس ورود به آن پس‌زمینهٔ تخت و بی‌ربط نمی‌شود.
    expect(shell!.querySelector(".page-backdrop"), "گرافیکِ پس‌زمینه در بانک نیست").toBeTruthy();
    //    …و این پرده با z-index:-1 رسم می‌شود؛ بدونِ stacking context روی همین
    //    لایه، پشتِ رنگِ ماتِ پوسته پنهان می‌ماند و بی‌فایده است. `isolate` همان
    //    کاری را می‌کند که wrapper خودِ App می‌کند.
    expect(shell!.className, "پوستهٔ بانک isolate ندارد ⇒ پردهٔ پس‌زمینه دیده نمی‌شود").toContain("isolate");

    // ۳) منوهای بومیِ بانک (نوعِ آزمون / سال) هم با تمِ تیره هم‌سو می‌شوند —
    //    یعنی سند color-scheme دارد و مرورگر منوی سفید باز نمی‌کند.
    expect(shell!.querySelectorAll("select").length).toBeGreaterThan(0);
    const css = readFileSync("src/index.css", "utf8");
    expect(css).toContain("color-scheme: dark");
  }, 60_000);
});

describe("رنگِ برنامه به‌صورت hex برای SVG/رینگ‌ها", () => {
  it("accentShades همان رنگی را می‌دهد که پالتِ اولیهٔ ۷۰۰/۶۰۰ دارد", () => {
    // رنگِ پیش‌فرضِ اپ (سبز دریایی) باید بدونِ تغییر باقی بماند
    const shades = accentShades("#0d9488");
    expect(shades[600]).toMatch(/^#[0-9a-f]{6}$/i);
    expect(shades[600]).toBe("#0d9488");
  });

  it("applyAccentColor متغیرِ --acc-600-hex را هم ست می‌کند تا SVGها هم‌رنگ شوند", async () => {
    const { applyAccentColor, currentAccentColor } = await import("../lib/accent");
    applyAccentColor("#2563eb");
    expect(document.documentElement.style.getPropertyValue("--acc-600-hex")).toBe("#2563eb");
    expect(currentAccentColor()).toBe("#2563eb");
  });
});
