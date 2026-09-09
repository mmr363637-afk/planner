import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * فایل‌های PWA که مستقیماً از public/ سرو می‌شوند و توسط Vite بررسی نمی‌شوند.
 * یک بار public/sw.js در اثر یک merge بد به JavaScript نامعتبر تبدیل شد و چون خطای
 * ثبتِ سرویس‌ورکر بی‌صدا catch می‌شود، هیچ‌کس متوجه نشد که حالت آفلاین از کار افتاده است.
 */
describe("فایل‌های PWA", () => {
  const sw = readFileSync("public/sw.js", "utf8");

  it("public/sw.js باید JavaScript معتبر و قابل parse باشد", () => {
    expect(sw.length).toBeGreaterThan(200);
    expect(() => new Function(sw)).not.toThrow();
  });

  it("سرویس‌ورکر هیچ مسیر مطلقِ ریشه ندارد (اپ زیر یک زیرمسیر سرو می‌شود)", () => {
    expect(sw).not.toMatch(/["'`]\//);
    expect(sw).toContain("registration.scope");
  });

  it("نسخهٔ کشِ سرویس‌ورکر ریشه با فایل منتشرشونده یکسان است", () => {
    expect(readFileSync("sw.js", "utf8")).toBe(sw);
    // هر build جدید باید نسخهٔ کش را بالا ببرد، وگرنه کش‌های قدیمی پاک نمی‌شوند.
    expect(sw).toContain('const CACHE = "study-planner-v5"');
    // صفحهٔ اپ باید «شبکه‌اول» باشد تا فیچرهای تازه بدون پاک‌کردن کش دیده شوند.
    expect(sw).toMatch(/request\.mode === "navigate"/);
  });

  it("نسخه‌های ریشهٔ منیفست/آیکون‌ها با public/ یکی است (فقط کپیِ دست‌رسِ محلی)", () => {
    // یک بار منیفست ریشه نسخهٔ قدیمی بود و کسی همان را ویرایش کرد؛ انتشار از public/ می‌آید.
    for (const file of ["manifest.webmanifest", "icon.svg", "icon-512.png"]) {
      expect(readFileSync(file, "utf8")).toBe(readFileSync(`public/${file}`, "utf8"));
    }
  });

  it("منیفست و آیکون‌ها در public/ وجود دارند", () => {
    const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
    expect(manifest.dir).toBe("rtl");
    expect(manifest.lang).toBe("fa");
    expect(readFileSync("public/icon.svg", "utf8")).toContain("<svg");
  });
});
