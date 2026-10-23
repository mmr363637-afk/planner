#!/usr/bin/env node
// پیش‌پروازِ ساختِ APK: آیا سایتِ منتشرشده همان PWA قابلِ نصب است؟
//
//   npm run android:preflight                 # بررسیِ سایتِ زنده روی GitHub Pages
//   npm run android:preflight -- --source docs  # بررسیِ بیلدِ محلی (بدونِ اینترنت؛ برای CI)
//
// چه چیزهایی چک می‌شود؟
//   ۱) manifest.webmanifest با HTTP 200 (یا از دیسک) خوانده شود و JSON معتبر باشد.
//   ۲) name/short_name/display/start_url/icons برای نصب وجود داشته باشند.
//   ۳) start_url داخلِ scope باشد.
//   ۴) آیکون‌های ۱۹۲ و ۵۱۲ (any) و ۵۱۲ (maskable) واقعاً وجود داشته باشند
//      (برای سایت: HTTP 200 + Content-Type: image/*؛ برای دیسک: فایل + ابعادِ واقعیِ PNG).
//   ۵) host / startUrl / fullScopeUrl در android/twa-manifest.json با همین سایت یکی باشند؛
//      وگرنه APK به آدرسِ دیگری می‌رود و باید پروژه از نو ساخته شود (npm run android:generate).
//
// خروجی: کدِ ۰ اگر همه‌چیز درست باشد، ۱ اگر ساختِ APK معنی نداشته باشد.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fail, ok, parseArgs, readJsonFile, warn } from "./shared.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = parseArgs();
const DEFAULT_MANIFEST_URL = "https://mmr363637-afk.github.io/planner/manifest.webmanifest";
const twaManifestPath = resolve(ROOT, String(args["twa-manifest"] ?? "android/twa-manifest.json"));

const errors = [];
const warnings = [];
const log = (message) => console.log(`  ${message}`);

// ---------------------------------------------------------------------------
// twa-manifest.json (مبنای مقایسه)
// ---------------------------------------------------------------------------
let twaManifest;
try {
  twaManifest = readJsonFile(twaManifestPath);
} catch (error) {
  fail(
    `android/twa-manifest.json خوانده نشد (${error instanceof Error ? error.message : error}).\n` +
      "  اول: npm run android:generate",
  );
}
const publicBase = new URL(`${twaManifest.fullScopeUrl ?? `https://${twaManifest.host}/`}`);
const localSource = args.source ? resolve(ROOT, String(args.source)) : null;
const mode = localSource ? "local" : "live";

/** @param {string} name @param {number} minSize */
function pickIcon(icons = [], name, minSize) {
  let best = null;
  for (const icon of icons) {
    const purposes = new Set(String(icon.purpose ?? "any").split(/\s+/));
    if (!purposes.has(name)) continue;
    const size = Number.parseInt(String(icon.sizes ?? "0x0").split(/\s+/)[0], 10) || 0;
    if (size < minSize) continue;
    if (!best || size > best.size) best = { icon, size };
  }
  return best?.icon ?? null;
}

/** خواندنِ ابعادِ PNG از هدرِ IHDR (بدونِ کتابخانه) */
function pngSize(buffer) {
  if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

// ---------------------------------------------------------------------------
// دریافتِ manifest
// ---------------------------------------------------------------------------
let webManifest;
let manifestUrl;

if (localSource) {
  const manifestPath = join(localSource, "manifest.webmanifest");
  manifestUrl = new URL("manifest.webmanifest", publicBase);
  try {
    webManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    fail(
      `${manifestPath} خوانده نشد (${error instanceof Error ? error.message : error}).\n` +
        "  اول: npm run build",
    );
  }
  ok(`manifest از دیسک خوانده شد: ${manifestPath}`);
} else {
  manifestUrl = new URL(
    String(args.manifest ?? process.env.TWA_MANIFEST_URL ?? DEFAULT_MANIFEST_URL),
  );
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      try {
        const response = await fetch(manifestUrl.href, {
          redirect: "follow",
          headers: { "cache-control": "no-cache" },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        webManifest = JSON.parse((await response.text()).trim());
        ok(`manifest.webmanifest دریافت شد (HTTP ${response.status}).`);
        lastError = null;
        break;
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((done) => setTimeout(done, attempt * 3_000));
    }
  }
  if (lastError) {
    fail(
      `manifest سایت در دسترس نیست: ${lastError instanceof Error ? lastError.message : lastError}\n` +
        `  آدرس: ${manifestUrl.href}\n` +
        "  اگر Pages تازه مستقر شده، چند دقیقه بعد دوباره تلاش کنید؛ برای بررسیِ آفلاین:" +
        " npm run android:preflight -- --source docs",
    );
  }
}

console.log(`\n🔎 بررسیِ PWA (حالت: ${mode === "local" ? "بیلدِ محلی" : "سایتِ زنده"})\n`);

const baseForUrls = localSource ? publicBase : new URL(".", manifestUrl);

// ---------------------------------------------------------------------------
// فیلدهای اجباریِ نصب
// ---------------------------------------------------------------------------
for (const field of ["name", "short_name", "display", "start_url", "icons"]) {
  if (!webManifest[field]) errors.push(`فیلدِ «${field}» در manifest نیست.`);
}

if (
  webManifest.display &&
  !["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"].includes(webManifest.display)
) {
  errors.push(`display = «${webManifest.display}»؛ برای نصب باید standalone/fullscreen باشد.`);
}

const startUrl = new URL(webManifest.start_url ?? ".", manifestUrl);
const scopeUrl = new URL(webManifest.scope ?? ".", manifestUrl);
if (!startUrl.href.startsWith(scopeUrl.href)) {
  errors.push(`start_url (${startUrl.href}) بیرون از scope (${scopeUrl.href}) است.`);
}
log(`start_url: ${startUrl.href}`);
log(`scope:     ${scopeUrl.href}`);
log(`display:   ${webManifest.display ?? "—"}`);

// ---------------------------------------------------------------------------
// آیکون‌ها
// ---------------------------------------------------------------------------
const iconsToCheck = [
  ["icon ≥192 any", pickIcon(webManifest.icons, "any", 192)],
  ["icon ≥512 any", pickIcon(webManifest.icons, "any", 512)],
  ["icon ≥512 maskable", pickIcon(webManifest.icons, "maskable", 512)],
];

if (!iconsToCheck[0][1]) errors.push("آیکون 192×192 با purpose=any پیدا نشد (برای نصبِ PWA لازم است).");
if (!iconsToCheck[1][1]) errors.push("آیکون 512×512 با purpose=any پیدا نشد (برای TWA لازم است).");
if (!iconsToCheck[2][1]) warnings.push("آیکون 512×512 با purpose=maskable نیست؛ آیکونِ اندروید بریده می‌شود.");

for (const [label, icon] of iconsToCheck) {
  if (!icon) continue;
  if (localSource) {
    // آیکون‌ها به مسیرِ سایت resolve می‌شوند (…/planner/icon-512.png)؛ برای فایلِ محلی باید
    // پیشوندِ scope («/planner/») برداشته شود تا به docs/icon-512.png برسیم.
    const iconPath = new URL(icon.src, manifestUrl).pathname;
    const relative = decodeURIComponent(
      iconPath.startsWith(publicBase.pathname) ? iconPath.slice(publicBase.pathname.length) : iconPath,
    );
    const file = join(localSource, relative);
    if (!existsSync(file)) {
      errors.push(`${label}: فایل پیدا نشد — ${file}`);
      continue;
    }
    const buffer = readFileSync(file);
    const size = pngSize(buffer);
    if (size) {
      log(`${label}: ${size.width}×${size.height} PNG، ${(buffer.length / 1024).toFixed(1)}KB ✔`);
      if (size.width !== size.height) warnings.push(`${label}: آیکون مربع نیست (${size.width}×${size.height}).`);
    } else {
      log(`${label}: ${buffer.length} بایت ✔`);
    }
    continue;
  }
  const url = new URL(icon.src, baseForUrls).href;
  try {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!contentType.startsWith("image/")) throw new Error(`Content-Type نامعتبر: ${contentType || "—"}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 1_000) throw new Error(`فایلِ آیکون بیش از حد کوچک است (${buffer.length} بایت)`);
    const size = pngSize(buffer);
    log(
      `${label}: ${size ? `${size.width}×${size.height} PNG` : contentType}، ` +
        `${(buffer.length / 1024).toFixed(1)}KB ✔`,
    );
  } catch (error) {
    errors.push(`${label}: دریافت نشد (${error instanceof Error ? error.message : error}) — ${url}`);
  }
}

// ---------------------------------------------------------------------------
// سرویس‌ورکر (نصب‌پذیریِ Chrome) — فقط هشدار
// ---------------------------------------------------------------------------
if (localSource) {
  if (existsSync(join(localSource, "sw.js"))) log("sw.js: موجود ✔ (حالتِ آفلاین)");
  else warnings.push("docs/sw.js پیدا نشد؛ حالتِ آفلاینِ PWA کامل نیست.");
} else {
  try {
    const response = await fetch(new URL("sw.js", baseForUrls).href, { redirect: "follow" });
    if (response.ok) log("sw.js: در دسترس ✔ (حالتِ آفلاین)");
    else warnings.push(`sw.js با HTTP ${response.status} پاسخ داد؛ نصب‌پذیریِ PWA ضعیف می‌شود.`);
  } catch {
    warnings.push("sw.js دریافت نشد؛ برای APK حیاتی نیست ولی نصبِ PWA ضعیف می‌شود.");
  }
}

// ---------------------------------------------------------------------------
// هم‌خوانی با android/twa-manifest.json
// ---------------------------------------------------------------------------
const siteHost = mode === "local" ? publicBase.host : manifestUrl.host;
const expectedStart = startUrl.pathname + startUrl.search;
// در حالتِ محلی، start_url نسبی («./») به آدرسِ عمومی resolve شده؛ همان مسیرِ سایت را می‌سنجیم.
const expectedScope = localSource ? publicBase.href : scopeUrl.href;

if (twaManifest.host !== siteHost) {
  errors.push(`host در twa-manifest.json («${twaManifest.host}») با host سایت («${siteHost}») یکی نیست.`);
}
if (String(twaManifest.startUrl) !== expectedStart) {
  errors.push(
    `startUrl در twa-manifest.json («${twaManifest.startUrl}») با start_url سایت («${expectedStart}») یکی نیست. ` +
      "پروژه را از نو بسازید: npm run android:generate",
  );
}
if (twaManifest.fullScopeUrl !== expectedScope) {
  errors.push(
    `fullScopeUrl در twa-manifest.json («${twaManifest.fullScopeUrl}») با scope سایت («${expectedScope}») یکی نیست.`,
  );
}
if (twaManifest.iconUrl && !String(twaManifest.iconUrl).startsWith(expectedScope)) {
  warnings.push(`iconUrl در twa-manifest.json بیرون از scope است: ${twaManifest.iconUrl}`);
}
log("هم‌خوانی با android/twa-manifest.json: host/startUrl/scope بررسی شد.");

// ---------------------------------------------------------------------------
// نتیجه
// ---------------------------------------------------------------------------
if (warnings.length > 0) {
  console.log("");
  for (const message of warnings) warn(message);
}
if (errors.length > 0) {
  console.log("");
  for (const message of errors) console.error(`\x1b[31m✖ ${message}\x1b[0m`);
  fail(`پیش‌پرواز ${errors.length} خطا پیدا کرد؛ ساختِ APK متوقف شد.`);
}

console.log("");
ok("سایت آمادهٔ ساختِ TWA است.");
