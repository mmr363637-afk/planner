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

  it("منیفست و آیکون‌ها در public/ وجود دارند", () => {
    const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
    expect(manifest.dir).toBe("rtl");
    expect(manifest.lang).toBe("fa");
    expect(readFileSync("public/icon.svg", "utf8")).toContain("<svg");
  });
});
