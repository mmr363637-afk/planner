// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_THEME_PACK, THEME_PACKS, applyThemePack, isThemePackId, themePack, themePackBackground } from "../themePacks";

// ===== 🎨 تم‌های آمادهٔ پس‌زمینه =====
// این تست‌ها سه چیز را قفل می‌کنند:
//  ۱) پالتِ تولیدشده در index.css با متادیتای THEME_PACKS هم‌خوان باشد (نام و رنگ پس‌زمینه)
//  ۲) هر تم هر ۱۱ پلهٔ slate را در «هر دو حالت» روشن و تیره داشته باشد
//  ۳) قراردادِ خوانایی حفظ شود: در تم روشن پله‌های روشن روشن‌تر از پله‌های متن بمانند
//     (کاربر گفت رنگِ نوشته را نمی‌خواهد عوض کند؛ هیچ تمی نباید کنتراست را به‌هم بزند)

// توجه: در محیط jsdom مقدار import.meta.url از نوع http است، پس مسیر از cwd گرفته می‌شود
const CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

function lin(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`hex نامعتبر: ${hex}`);
  const n = parseInt(m[1], 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** بلوکِ یک انتخابگر تا آکولاد بستهٔ خودش */
function blockOf(selector: string): string {
  const idx = CSS.indexOf(selector);
  expect(idx, `انتخابگر در index.css پیدا نشد: ${selector}`).toBeGreaterThan(-1);
  const open = CSS.indexOf("{", idx);
  const close = CSS.indexOf("}", open);
  return CSS.slice(open + 1, close);
}

function varOf(block: string, name: string): string | null {
  const m = new RegExp(`--${name}\\s*:\\s*([^;]+);`).exec(block);
  return m ? m[1].trim() : null;
}

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

describe("تم‌های آمادهٔ پس‌زمینه", () => {
  it("هر تم در index.css برای هر دو حالتِ روشن و تیره پالتِ کامل دارد", () => {
    for (const pack of THEME_PACKS) {
      const light = blockOf(`:root[data-theme-pack="${pack.id}"] {`);
      const dark = blockOf(`:root.dark[data-theme-pack="${pack.id}"] {`);
      for (const block of [light, dark]) {
        for (const step of STEPS) {
          expect(varOf(block, `color-slate-${step}`), `${pack.id} / slate-${step}`).toMatch(/^#[0-9a-f]{6}$/i);
        }
      }
      expect(varOf(light, "color-white"), `${pack.id} / white روشن`).toMatch(/^#[0-9a-f]{6}$/i);
      // در تیره، «سفید» باید واقعاً سفید بماند تا متن روی دکمه‌های رنگی خوانا باشد
      expect(varOf(dark, "color-white"), `${pack.id} / white تیره`).toBe("#ffffff");
    }
  });

  it("رنگِ پس‌زمینهٔ هر تم در متادیتا با CSS یکی است", () => {
    for (const pack of THEME_PACKS) {
      const lightScene = varOf(blockOf(`:root[data-theme-pack="${pack.id}"] .page-backdrop {`), "scene-base");
      const darkScene = varOf(blockOf(`:root.dark[data-theme-pack="${pack.id}"] .page-backdrop {`), "scene-base");
      expect(lightScene?.toLowerCase(), `${pack.id} روشن`).toBe(pack.background.light.toLowerCase());
      expect(darkScene?.toLowerCase(), `${pack.id} تیره`).toBe(pack.background.dark.toLowerCase());
    }
    // و هیچ تمِ اضافه‌ای در CSS نمانده باشد که در تنظیمات دیده نمی‌شود
    const cssIds = [...CSS.matchAll(/:root\[data-theme-pack="([^"]+)"\]/g)].map((m) => m[1]);
    expect(new Set(cssIds)).toEqual(new Set(THEME_PACKS.map((p) => p.id)));
  });

  it("قراردادِ خوانایی حفظ می‌شود: سطح روشن‌تر از پلهٔ متن است (هر دو حالت)", () => {
    for (const pack of THEME_PACKS) {
      const light = blockOf(`:root[data-theme-pack="${pack.id}"] {`);
      const dark = blockOf(`:root.dark[data-theme-pack="${pack.id}"] {`);
      const lightSurface = luminance(varOf(light, "color-slate-50")!);
      const lightText = luminance(varOf(light, "color-slate-800")!);
      expect(lightSurface, `${pack.id}: سطح روشن باید روشن‌تر از متن باشد`).toBeGreaterThan(lightText + 0.5);
      const darkSurface = luminance(varOf(dark, "color-slate-900")!);
      const darkText = luminance(varOf(dark, "color-slate-200")!);
      expect(darkSurface, `${pack.id}: سطح تیره باید تیره‌تر از متن باشد`).toBeLessThan(darkText - 0.4);
    }
  });

  it("تمِ پیش‌فرض پالتِ اصلیِ تیلویند است و هیچ attribute اضافه‌ای نمی‌گذارد", () => {
    const cssDefault = blockOf(':root[data-theme-pack="default"] {');
    expect(varOf(cssDefault, "color-slate-50")).toBe("#f8fafc");
    expect(varOf(cssDefault, "color-slate-900")).toBe("#0f172a");
    const applied = applyThemePack("default");
    expect(applied).toBe("default");
    expect(document.documentElement.hasAttribute("data-theme-pack")).toBe(false);
  });

  it("اعمال تم روی سند و رنگِ نوار مرورگر درست کار می‌کند", () => {
    applyThemePack("paper");
    expect(document.documentElement.getAttribute("data-theme-pack")).toBe("paper");
    expect(themePackBackground("paper", false)).toBe(themePack("paper").background.light);
    expect(themePackBackground("paper", true)).toBe(themePack("paper").background.dark);
    expect(themePackBackground("oled", true)).toBe("#050505");
    // مقدار ناشناخته/قدیمی ⇒ تمِ پیش‌فرض (نه crash، نه پالتِ نیمه‌کاره)
    expect(themePack("nemidoonam").id).toBe(DEFAULT_THEME_PACK);
    expect(themePack(undefined).id).toBe(DEFAULT_THEME_PACK);
    expect(themePackBackground("nemidoonam", true)).toBe(themePackBackground("default", true));
    expect(isThemePackId("forest")).toBe(true);
    expect(isThemePackId("forest ")).toBe(false);
    expect(isThemePackId(42)).toBe(false);
    applyThemePack(null);
    expect(document.documentElement.hasAttribute("data-theme-pack")).toBe(false);
  });

  it("هر تمِ تیره واقعاً تیره است و تمِ روشن روشن (پیش‌نمایشِ تنظیمات دروغ نمی‌گوید)", () => {
    for (const pack of THEME_PACKS) {
      expect(luminance(pack.background.light), `${pack.id} روشن`).toBeGreaterThan(0.7);
      expect(luminance(pack.background.dark), `${pack.id} تیره`).toBeLessThan(0.09);
    }
  });
});
