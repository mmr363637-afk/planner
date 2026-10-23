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

  it("سخت‌سازیِ CI روی پروژه هست (وگرنه release در Actions می‌شکند)", () => {
    const properties = readFileSync("android/gradle.properties", "utf8");
    // ۱٫ حافظهٔ Gradle: 1536m برای R8/dex کم است
    expect(properties).toMatch(/org\.gradle\.jvmargs=-Xmx3g/);
    expect(properties).toContain("android.suppressUnsupportedCompileSdk=36");

    // ۲٫ R8 بدونِ proguard-rules → «Missing class»؛ پس minify خاموش است
    expect(gradle).toMatch(/minifyEnabled false/);
    expect(gradle).not.toMatch(/minifyEnabled true/);

    // ۳٫ buildTools پین‌شده (همان نسخه‌ای که Bubblewrap برای zipalign/apksigner می‌خواهد)
    expect(gradle).toMatch(/buildToolsVersion "3[4-9]\.\d+\.\d+"/);

    // ۴٫ lint نباید ساختِ release را در CI بشکند
    expect(gradle).toMatch(/abortOnError false/);
  });

  it("اسکریپتِ build خطاهای Bubblewrap را به Annotation و لاگِ کامل تبدیل می‌کند", () => {
    // بدونِ این، در UI فقط «Process completed with exit code 1» دیده می‌شد و علت پیدا نبود.
    const buildScript = readFileSync("scripts/twa/build.mjs", "utf8");
    expect(buildScript).toContain("::error title=Bubblewrap build failed");
    expect(buildScript).toContain("bubblewrap-build.log");
    expect(buildScript).toContain("GITHUB_STEP_SUMMARY");
  });

  it("قالبِ workflow در scripts/twa با نصب‌شده هم‌مسیر است و اصلاحات را دارد", () => {
    const template = readFileSync("scripts/twa/android-apk.yml", "utf8");
    // قالب باید کامل باشد (همان محتوای .github/workflows) و اصلاحات را داشته باشد.
    expect(template).toContain("workflow_dispatch:");
    expect(template).toContain('tags:');
    expect(template).toContain("Upload build log (on failure)");
    expect(template).toMatch(/actions\/checkout@v5/);
    expect(template).toMatch(/actions\/setup-java@v5/);
    // و هیچ فراخوانیِ بی‌محافظِ bubblewrap نداشته باشد
    expect(template).not.toMatch(/^\s*bubblewrap --version/);
  });

  it("هیچ keystore/کلید/APK در ریپو commit نشده است", () => {
    // secretها فقط در GitHub Secrets می‌مانند؛ خروجیِ ساخت هم فقط Artifact است.
    const forbidden = /\.(keystore|jks|p12|apk|aab)$/i;
    const leaked = walk("android").filter((file) => forbidden.test(file));
    expect(leaked).toEqual([]);
    // فایلِ workflow یا در ریشه (نسخهٔ نصب‌نشده) یا در مسیرِ رسمیِ Actions است.
    // workflow باید در مسیرِ رسمیِ Actions باشد (نسخهٔ تکراریِ ریشه حذف شده است).
    expect(existsSync(".github/workflows/android-apk.yml")).toBe(true);
    expect(existsSync("android-workflow.yml")).toBe(false);
  });

  it("workflow هیچ فراخوانیِ bubblewrap پیش از ساخته‌شدنِ config ندارد (دامِ exit 130)", () => {
    const workflow = readFileSync(".github/workflows/android-apk.yml", "utf8");
    // Bubblewrap حتی برای --version اول ~/.bubblewrap/config.json را می‌خواند؛ اگر نباشد
    // تعاملی می‌شود و در CI با SIGINT (exit 130) می‌میرد.
    const configIndex = workflow.indexOf("/.bubblewrap/config.json");
    expect(configIndex).toBeGreaterThan(-1);
    const callPattern = /^\s*(?:timeout \d+ )?bubblewrap (?!-)([a-z-]+)/gm;
    let match: RegExpExecArray | null;
    let calls = 0;
    while ((match = callPattern.exec(workflow)) !== null) {
      calls += 1;
      expect(match.index).toBeGreaterThan(configIndex);
    }
    expect(calls).toBeGreaterThanOrEqual(0);
    // نسخه‌بندیِ bubblewrap فقط با timeout (تا هیچ‌وقت job معلق نماند)
    expect(workflow).not.toMatch(/^\s*bubblewrap --version/);
  });
});
