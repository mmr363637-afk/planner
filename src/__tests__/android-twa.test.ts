import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * نگهبانِ نسخهٔ اندروید (TWA).
 *
 * پروژهٔ `android/` فقط یک «پوسته» دورِ همین PWA است؛ اگر منیفست، شناسه یا نسخه عوض شود و
 * `android/` به‌روز نشود، APK به آدرسِ اشتباه می‌رود، آیکونِ قدیمی نشان می‌دهد یا اندروید
 * اجازهٔ به‌روزرسانیِ نسخهٔ نصب‌شده را نمی‌دهد. این تست همان drift را قبل از merge می‌گیرد.
 *
 * رفعِ خطا:
 *   npm run android:generate   # اگر manifest/آیکون/shortcut عوض شده
 *   npm run android:sync       # اگر فقط نسخهٔ package.json بالا رفته
 */

const SITE = "https://mmr363637-afk.github.io/planner/";
const PACKAGE_ID = "ir.mahdimr.planner";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
const twa = JSON.parse(readFileSync("android/twa-manifest.json", "utf8")) as Record<string, any>;
const gradle = readFileSync("android/app/build.gradle", "utf8");
const webManifest = JSON.parse(readFileSync("docs/manifest.webmanifest", "utf8")) as Record<string, any>;

/** روی فایل و زیرپوشه‌ها می‌گردد و مسیرِ همهٔ فایل‌ها را برمی‌گرداند */
function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const full = join(directory, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe("پروژهٔ اندروید (TWA) — هم‌گام با PWA", () => {
  it("شناسهٔ بسته همان شناسهٔ مستندشده است و در Manifest اندروید هم آمده", () => {
    expect(twa.packageId).toBe(PACKAGE_ID);
    expect(gradle).toContain(`applicationId "${PACKAGE_ID}"`);
    expect(gradle).toContain(`namespace "${PACKAGE_ID}"`);
  });

  it("به همان سایتِ منتشرشده و همان scope اشاره می‌کند", () => {
    expect(twa.host).toBe(new URL(SITE).host);
    expect(twa.startUrl).toBe(new URL(SITE).pathname);
    expect(twa.fullScopeUrl).toBe(SITE);
    expect(twa.webManifestUrl).toBe(`${SITE}manifest.webmanifest`);
    // start_url داخلِ scope: پیش‌شرطِ باز شدنِ تمام‌صفحه در TWA
    expect(`${SITE}${twa.startUrl.replace(/^\//, "")}`.startsWith(twa.fullScopeUrl)).toBe(true);
  });

  it("نسخهٔ اندروید با package.json و فرمولِ versionCode یکی است", () => {
    expect(twa.appVersion).toBe(pkg.version);
    expect(twa.appVersionName).toBe(pkg.version);
    const [major, minor, patch] = pkg.version.split(".").map(Number);
    expect(twa.appVersionCode).toBe(major * 10000 + minor * 100 + patch);
    expect(gradle).toContain(`versionCode ${twa.appVersionCode}`);
    expect(gradle).toContain(`versionName "${pkg.version}"`);
    // versionCode باید با هر نسخه بزرگ‌تر شود؛ صفر/تکراری بودنش نصبِ نسخهٔ جدید را می‌شکند
    expect(twa.appVersionCode).toBeGreaterThan(0);
  });

  it("manifest-checksum.txt دقیقاً SHA-1 فایلِ twa-manifest.json است", () => {
    // Bubblewrap اگر این دو یکی نباشند، هنگامِ build تعاملی می‌پرسد و در CI گیر می‌کند.
    const checksum = createHash("sha1")
      .update(readFileSync("android/twa-manifest.json"))
      .digest("hex");
    expect(readFileSync("android/manifest-checksum.txt", "utf8").trim()).toBe(checksum);
  });

  it("آیکون‌های اعلام‌شده در PWA واقعاً در بیلدِ منتشرشده هستند", () => {
    const icons = (webManifest.icons ?? []) as { src: string; sizes: string; type: string; purpose?: string }[];
    const find = (purpose: string, min: number) =>
      icons.find((icon) => {
        const purposes = new Set(String(icon.purpose ?? "any").split(/\s+/));
        const size = Number.parseInt(String(icon.sizes).split(/\s+/)[0], 10) || 0;
        return purposes.has(purpose) && size >= min;
      });
    expect(find("any", 512)).toBeTruthy();
    expect(find("maskable", 512)).toBeTruthy();
    for (const icon of icons) {
      expect(existsSync(join("docs", icon.src.replace(/^\.\//, "")))).toBe(true);
    }
    expect(twa.iconUrl).toBe(`${SITE}icon-512.png`);
    expect(twa.maskableIconUrl).toBe(`${SITE}icon-512.png`);
  });

  it("میان‌برهای لانچر همان میان‌برهای منیفستِ وب هستند", () => {
    const shortcuts = (twa.shortcuts ?? []) as { url: string; name: string }[];
    expect(shortcuts.length).toBe((webManifest.shortcuts ?? []).length);
    expect(shortcuts.map((s) => s.url)).toEqual([
      `${SITE}?page=study`,
      `${SITE}?page=reviews`,
      `${SITE}?page=exams`,
    ]);
    for (const shortcut of shortcuts) expect(shortcut.name.length).toBeGreaterThan(0);
  });

  it("پروژه با تنظیماتِ درستِ Gradle ساخته شده (بدون jcenter و با SDK سازگار)", () => {
    const rootGradle = readFileSync("android/build.gradle", "utf8");
    expect(rootGradle).not.toContain("jcenter()"); // jcenter خاموش است و ساخت را می‌شکند
    expect(rootGradle).toContain("mavenCentral()");
    expect(gradle).toMatch(/compileSdkVersion 3[4-9]/);
    expect(gradle).toMatch(/targetSdkVersion 3[4-9]/);
    expect(gradle).toMatch(/minSdkVersion 2[1-9]/);
  });

  it("هیچ keystore/کلید/APK در ریپو commit نشده است", () => {
    // secretها فقط در GitHub Secrets می‌مانند؛ خروجیِ ساخت هم فقط Artifact است.
    const forbidden = /\.(keystore|jks|p12|apk|aab)$/i;
    const leaked = walk("android").filter((file) => forbidden.test(file));
    expect(leaked).toEqual([]);
    // فایلِ workflow یا در ریشه (نسخهٔ نصب‌نشده) یا در مسیرِ رسمیِ Actions است.
    expect(
      existsSync("android-workflow.yml") || existsSync(".github/workflows/android-apk.yml"),
    ).toBe(true);
  });
});
