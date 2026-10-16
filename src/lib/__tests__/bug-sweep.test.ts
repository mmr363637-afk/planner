// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseStringArray, readStringArray, writeStringArray } from "../safeJson";
import { toDateKey } from "../jalali";

// ===== 🐛 گزارش کاربر: «اپ چه باگ‌های دیگری ممکن است داشته باشد؟» =====
// این فایل باگ‌هایی را قفل می‌کند که در بازبینیِ کد پیدا و رفع شدند تا دوباره برنگردند.

describe("🧯 خواندن/نوشتنِ امنِ localStorage (باگ: یادآورها با کلیدِ خراب می‌مُردند)", () => {
  afterEach(() => localStorage.clear());

  it("JSON خراب یا غیر-آرایه ⇒ آرایه‌ی خالی، بدون استثنا", () => {
    expect(parseStringArray(null)).toEqual([]);
    expect(parseStringArray("")).toEqual([]);
    expect(parseStringArray("{broken")).toEqual([]);
    expect(parseStringArray('{"a":1}')).toEqual([]);
    expect(parseStringArray("123")).toEqual([]);
    expect(parseStringArray('"متن"')).toEqual([]);
  });

  it("فقط رشته‌های غیرخالی می‌مانند (عدد/آبجکت/رشته‌ی خالی حذف)", () => {
    expect(parseStringArray('["plan", "", 3, null, "quote", {"x":1}]')).toEqual(["plan", "quote"]);
  });

  it("خواندن از localStorage هرگز throw نمی‌کند و نوشتن دور می‌زند", () => {
    localStorage.setItem("k", "{oops");
    expect(readStringArray("k")).toEqual([]); // قبلاً این‌جا کلِ منطقِ یادآور می‌سوخت
    writeStringArray("k", ["a", "b"]);
    expect(readStringArray("k")).toEqual(["a", "b"]);
    writeStringArray("k2", []);
    expect(readStringArray("k2")).toEqual([]);
  });

  it("کدِ اپ دیگر JSON.parse مستقیم روی localStorage ندارد (نگهبان رگرسیون)", () => {
    const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    expect(app).not.toMatch(/JSON\.parse\(localStorage\.getItem/);
    expect(app).toContain("readStringArray(key)");
  });
});

describe("⏰ تاریخِ محلی (باگ: تاریخِ یادداشت‌ها با UTC یک روز عقب‌تر بود)", () => {
  it("تاریخ‌های نزدیک نیمه‌شب به وقت تهران درست نمایش داده می‌شوند", () => {
    // منطقهٔ زمانی را برای همین تست روی ایران می‌گذاریم (کاربر ایرانی است).
    const savedTz = process.env.TZ;
    process.env.TZ = "Asia/Tehran";
    try {
      // ۲۹ شهریور (۲۹ سپتامبر)، ساعت ۰۰:۳۰ بوقت تهران
      const lateNight = new Date(2025, 8, 29, 0, 30, 0);
      expect(toDateKey(lateNight)).toBe("2025-09-29");
      // و این دقیقاً همان چیزی است که الگویِ قدیمی می‌داد: یک روز عقب‌تر
      expect(lateNight.toISOString().slice(0, 10)).toBe("2025-09-28");
    } finally {
      process.env.TZ = savedTz;
    }
  });

  it("کدِ NotesPanel تاریخِ نمایشی را از تاریخِ محلی می‌سازد، نه UTC (نگهبان رگرسیون)", () => {
    const panel = readFileSync(resolve(process.cwd(), "src/components/NotesPanel.tsx"), "utf8");
    expect(panel).not.toContain(".toISOString().slice(0, 10)");
    expect(panel).toContain("toDateKey(new Date(note.createdAt))");
  });

  it("نامِ فایلِ ICS هم تاریخِ محلی می‌گیرد، نه UTC (باگ: فایل با تاریخِ دیروز دانلود می‌شد)", () => {
    // نزدیک نیمه‌شب به وقت تهران، toISOString() تاریخِ دیروز را می‌داد و نامِ فایلِ
    // خروجیِ تقویم یک روز عقب‌تر از دفترچهٔ کاربر بود.
    const settings = readFileSync(resolve(process.cwd(), "src/pages/Settings.tsx"), "utf8");
    const icsLine = settings.split("\n").find((l) => l.includes("downloadICS(")) ?? "";
    expect(icsLine).toContain("toDateKey(new Date())");
    expect(icsLine).not.toContain("toISOString");
  });
});
