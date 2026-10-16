// مولدِ «تم‌های آمادهٔ پس‌زمینه» (Theme Packs) برای src/index.css
// اجرا:  npm run gen:themes
//
// چرا مولد؟ هر تم باید ۱۱ پله‌ی پالتِ slate را عوض کند (bg-slate-50، dark:bg-slate-900،
// border-slate-200، text-slate-800 و…) هم برای تم روشن و هم تیره. دست‌نویس‌کردنِ
// ۸ تم × ۲ حالت × ۱۱ پله = ۱۷۶ رنگ، خطای انسانی می‌آورد؛ این‌جا از «نردبانِ روشناییِ
// خودِ Tailwind slate» استفاده می‌شود، پس قراردادِ کنتراستِ متن/کارت عیناً حفظ می‌شود و
// فقط «ته‌رنگ» عوض می‌شود. خروجی بین دو نشانگر در src/index.css نوشته می‌شود.
//
// ⚠️ نکته: مقدار `background` هر تم در src/lib/themePacks.ts هم آمده (برای theme-color
// مرورگر و پیش‌نمایش در تنظیمات)؛ تستِ theme-packs هم‌خوانیِ این دو را می‌سنجد.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CSS_PATH = join(ROOT, "src", "index.css");
const START = "/* @generated:theme-packs:start */";
const END = "/* @generated:theme-packs:end */";

/** نردبانِ روشناییِ Tailwind slate (از خودِ پالت گرفته شده) */
const SLATE_L = { 50: 98.0, 100: 96.1, 200: 91.4, 300: 83.9, 400: 65.1, 500: 46.9, 600: 34.5, 700: 26.7, 800: 17.5, 900: 11.2, 950: 4.9 };
/** اشباعِ Tailwind slate در هر پله — تم‌ها نسبتی از همین را می‌گیرند */
const SLATE_S = { 50: 40.0, 100: 40.0, 200: 31.8, 300: 26.8, 400: 20.2, 500: 16.3, 600: 19.3, 700: 25.0, 800: 32.6, 900: 47.4, 950: 84.0 };
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

/** هر تم: ته‌رنگ (hue) و ضریبِ اشباع برای هر حالت + بازنویسی‌های اختیاری/رنگ «کارت» */
const PACKS = [
  // «پیش‌فرض» عیناً همان پالتِ خودِ Tailwind slate است تا انتخابِ آن هیچ تغییری در ظاهر نسازد
  { id: "default", identity: true, whiteL: "#ffffff" },
  // «پس‌زمینهٔ کاغذی»: پله‌ی ۵۰ کمی تیره‌تر می‌شود تا صفحه واقعاً کِرِم/کاغذی دیده شود،
  // در حالی که کارت‌ها (bg-white) تقریباً سفید می‌مانند — همان حسِ کاغذ و مرکب.
  { id: "paper", hueL: 36, satL: 1.15, hueD: 34, satD: 0.95, whiteL: "#fffdf6", lightBaseShift: 2.5 },
  { id: "coffee", hueL: 26, satL: 1.25, hueD: 24, satD: 0.85, whiteL: "#fffaf3", lightBaseShift: 3 },
  { id: "forest", hueL: 152, satL: 0.95, hueD: 158, satD: 0.85, whiteL: "#fbfffa", lightBaseShift: 1.8 },
  { id: "plum", hueL: 285, satL: 0.9, hueD: 290, satD: 0.75, whiteL: "#fffbff", lightBaseShift: 1.6 },
  { id: "rose", hueL: 345, satL: 0.95, hueD: 340, satD: 0.7, whiteL: "#fffafb", lightBaseShift: 1.6 },
  { id: "neutral", hueL: 220, satL: 0, hueD: 220, satD: 0, whiteL: "#ffffff" },
  {
    id: "oled",
    hueL: 220,
    satL: 0,
    hueD: 220,
    satD: 0.25,
    whiteL: "#ffffff",
    // تم مشکی واقعی: سطوحِ تیره تا حدِ مشکی پایین می‌آیند (صرفه‌جویی باتری روی OLED)
    darkOverride: { 950: "#000000", 900: "#050505", 800: "#0e0e10", 700: "#1b1b1e" },
    lightOverride: { 50: "#ffffff", 100: "#f7f7f8" },
  },
];

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** یک پله: روشناییِ slate + تهرنگ/اشباعِ تم ⇒ کنتراستِ همان پله حفظ می‌شود */
function shade(step, hue, scale, lightShift = 0) {
  const s = Math.min(70, SLATE_S[step] * scale);
  // lightShift فقط پله‌های ۵۰/۱۰۰ تم روشن را کمی تیره‌تر می‌کند (حسِ کاغذ/کِرِم)
  // و به پله‌های متن دست نمی‌زند تا خوانایی عیناً حفظ شود.
  const l = step <= 100 ? SLATE_L[step] - lightShift : SLATE_L[step];
  return hslToHex(hue, s, l);
}

/** پالتِ دست‌نخوردهٔ Tailwind slate — مرجعِ تمِ «پیش‌فرض» */
const IDENTITY = {
  50: "#f8fafc", 100: "#f1f5f9", 200: "#e2e8f0", 300: "#cbd5e1", 400: "#94a3b8",
  500: "#64748b", 600: "#475569", 700: "#334155", 800: "#1e293b", 900: "#0f172a", 950: "#020617",
};

function packVariables(pack, mode) {
  if (pack.identity) return STEPS.map((step) => `    --color-slate-${step}: ${IDENTITY[step]};`);
  const hue = mode === "light" ? pack.hueL : pack.hueD;
  const scale = mode === "light" ? pack.satL : pack.satD;
  const override = (mode === "light" ? pack.lightOverride : pack.darkOverride) ?? {};
  const shift = mode === "light" ? (pack.lightBaseShift ?? 0) : 0;
  const lines = [];
  for (const step of STEPS) {
    const value = override[step] ?? shade(step, hue, scale, shift);
    lines.push(`    --color-slate-${step}: ${value};`);
  }
  return lines;
}

function buildCss() {
  const out = [];
  out.push(START);
  out.push("/* تم‌های آمادهٔ پس‌زمینه — تولیدشده با `npm run gen:themes`؛ دستی ویرایش نکنید.");
  out.push("   کلاس‌های slate-* (پس‌زمینه‌ها، کارت‌ها، حاشیه‌ها و متن‌ها) به همین متغیرها");
  out.push("   وصل‌اند، پس با عوض‌شدن تم، ته‌رنگِ کلِ اپ یکجا عوض می‌شود و قراردادِ روشنایی");
  out.push("   (و در نتیجه خوانایی) دست‌نخورده می‌ماند. تم روشن و تیره هرکدام پالتِ خودش را دارد. */");
  for (const pack of PACKS) {
    out.push(`:root[data-theme-pack="${pack.id}"] {`);
    out.push(`  --color-white: ${pack.whiteL}; /* «کارت» در تم روشن */`);
    out.push(...packVariables(pack, "light"));
    out.push("}");
    out.push(`:root.dark[data-theme-pack="${pack.id}"] {`);
    out.push("  --color-white: #ffffff; /* متن سفید روی دکمه‌های رنگی در تم تیره باید سفید بماند */");
    out.push(...packVariables(pack, "dark"));
    out.push("}");
    // پس‌زمینهٔ گرافیکی صفحه‌ها هم با تم هماهنگ می‌شود
    out.push(`:root[data-theme-pack="${pack.id}"] .page-backdrop { --scene-base: ${pack.identity ? IDENTITY[50] : (pack.lightOverride ?? {})[50] ?? shade(50, pack.hueL, pack.satL, pack.lightBaseShift ?? 0)}; }`);
    out.push(`:root.dark[data-theme-pack="${pack.id}"] .page-backdrop { --scene-base: ${pack.identity ? IDENTITY[900] : (pack.darkOverride ?? {})[900] ?? shade(900, pack.hueD, pack.satD)}; }`);
  }
  out.push(END);
  return out.join("\n");
}

const css = readFileSync(CSS_PATH, "utf8");
const startIndex = css.indexOf(START);
const endIndex = css.indexOf(END);
const block = buildCss();
let next;
if (startIndex >= 0 && endIndex > startIndex) {
  next = css.slice(0, startIndex) + block + css.slice(endIndex + END.length);
} else {
  next = `${css.trimEnd()}\n\n${block}\n`;
}
writeFileSync(CSS_PATH, next);

// چاپِ رنگ‌های «پس‌زمینه» برای هم‌خوانی با src/lib/themePacks.ts
console.log("پس‌زمینهٔ هر تم (برای themePackBackground در themePacks.ts):");
for (const pack of PACKS) {
  const light = pack.identity ? IDENTITY[50] : (pack.lightOverride ?? {})[50] ?? shade(50, pack.hueL, pack.satL, pack.lightBaseShift ?? 0);
  const dark = pack.identity ? IDENTITY[900] : (pack.darkOverride ?? {})[900] ?? shade(900, pack.hueD, pack.satD);
  console.log(`  ${pack.id.padEnd(8)} light=${light} dark=${dark}`);
}
