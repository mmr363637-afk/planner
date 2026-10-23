#!/usr/bin/env node
// ساختِ (یا بازسازیِ) پروژهٔ اندرویدِ TWA از manifest خودِ سایت.
//
//   npm run android:generate
//   npm run android:generate -- --manifest https://mmr363637-afk.github.io/planner/manifest.webmanifest
//   npm run android:generate -- --source docs        # بدونِ اینترنت، از همان بیلدِ منتشرشده در docs/
//
// چرا این اسکریپت و نه `bubblewrap init`؟ `init` پرسش‌های تعاملی دارد (و برای CI مناسب نیست).
// این‌جا همان موتورِ رسمی (`@bubblewrap/core` → TwaGenerator) صدایش می‌زنیم، فیلدهای
// مخصوصِ اندروید را از یک‌جا (همین اسکریپت + package.json) می‌گذاریم و خروجی را قطعی می‌کنیم.
//
// پیش‌نیازِ نصب (در CI خودکار انجام می‌شود):
//   npm install -g @bubblewrap/cli@1.27.0
//   NODE_PATH="$(npm root -g)" npm run android:generate
//
// مقادیرِ ثابتِ پروژه (اگر روزی عوض شدند، همین‌جا عوض کنید):
//   packageId : ir.mahdimr.planner   ← شناسهٔ مستندشده در TWA_GUIDE.md؛ شناسهٔ دیگری در ریپو نیست.

import { createServer } from "node:http";
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  fail,
  manifestChecksum,
  ok,
  parseArgs,
  readJsonFile,
  stringifyManifest,
  versionCodeFromVersion,
  warn,
} from "./shared.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);

const DEFAULT_MANIFEST_URL = "https://mmr363637-afk.github.io/planner/manifest.webmanifest";
const DEFAULT_PACKAGE_ID = "ir.mahdimr.planner";
const DEFAULT_KEY_ALIAS = "android";
const DEFAULT_KEYSTORE = "./android.keystore"; // نسبی و داخلِ android/؛ هرگز commit نمی‌شود
const TEXT_EXTENSIONS = new Set([
  ".gradle", ".xml", ".json", ".properties", ".java", ".txt", ".webmanifest", ".md", ".pro",
]);

const args = parseArgs();

/** @type {any} */
let core;
try {
  core = require("@bubblewrap/core");
} catch {
  fail(
    "@bubblewrap/core پیدا نشد.\n" +
      "  نصب:  npm install -g @bubblewrap/cli@1.27.0\n" +
      '  اجرا: NODE_PATH="$(npm root -g)" npm run android:generate',
  );
}

// ---------------------------------------------------------------------------
// سرورِ محلیِ استاتیک (وقتی می‌خواهیم آیکون‌ها/منیفست از docs/ محلی خوانده شوند)
// ---------------------------------------------------------------------------
const MIME = {
  ".webmanifest": "application/manifest+json",
  ".json": "application/json; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function startStaticServer(directory) {
  const rootDir = resolve(directory);
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
    const filePath = normalize(join(rootDir, pathname));
    if (!filePath.startsWith(rootDir + sep) && filePath !== rootDir) {
      response.writeHead(403).end("forbidden");
      return;
    }
    let target = filePath;
    if (existsSync(target) && statSync(target).isDirectory()) target = join(target, "index.html");
    if (!existsSync(target)) {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "content-type": MIME[extname(target)] ?? "application/octet-stream" });
    response.end(readFileSync(target));
  });
  return new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolvePromise({
        url: new URL(`http://127.0.0.1:${port}/`),
        // fetch (undici) اتصالِ keep-alive نگه می‌دارد و بدونِ closeAllConnections،
        // server.close() هرگز callback نمی‌دهد و اسکریپت در CI معلق می‌ماند.
        close: () =>
          new Promise((done) => {
            server.closeAllConnections?.();
            server.close(() => done(undefined));
          }),
      });
    });
  });
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { redirect: "follow", signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function findIcon(icons = [], purpose, minSize) {
  let best = null;
  for (const icon of icons) {
    const purposes = new Set(String(icon.purpose ?? "any").split(/\s+/));
    if (!purposes.has(purpose)) continue;
    const size = Number.parseInt(String(icon.sizes ?? "0x0").split(/\s+/)[0], 10) || 0;
    if (size < minSize) continue;
    if (!best || size > best.size) best = { icon, size };
  }
  return best?.icon ?? null;
}

function listTextFiles(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...listTextFiles(full));
    else if (entry.isFile() && TEXT_EXTENSIONS.has(extname(entry.name))) found.push(full);
  }
  return found;
}

// ---------------------------------------------------------------------------
// ۱) منبعِ محتوا
// ---------------------------------------------------------------------------
const publicManifestUrl = new URL(
  String(args.manifest ?? process.env.TWA_MANIFEST_URL ?? DEFAULT_MANIFEST_URL),
);
const publicBase = new URL(".", publicManifestUrl);
const outDir = resolve(ROOT, String(args.out ?? "android"));
const packageId = String(args["package-id"] ?? DEFAULT_PACKAGE_ID);
const keyAlias = String(args["key-alias"] ?? DEFAULT_KEY_ALIAS);

if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(packageId)) {
  fail(`packageId نامعتبر است: «${packageId}» (قالب: com.example.app)`);
}

let sourceBase = publicBase;
let server = null;
if (args.source) {
  const source = String(args.source);
  if (existsSync(source) && statSync(source).isDirectory()) {
    server = await startStaticServer(source);
    sourceBase = server.url;
    console.log(`📁 منبعِ محلی: ${resolve(source)} → ${sourceBase.href}`);
  } else {
    sourceBase = new URL(".", new URL(source));
    console.log(`🌐 منبعِ جایگزین: ${sourceBase.href}`);
  }
}

const sourceManifestUrl = new URL("manifest.webmanifest", sourceBase);
console.log(`\n📥 خواندنِ manifest از ${sourceManifestUrl.href}`);

let webManifest;
try {
  webManifest = JSON.parse((await fetchText(sourceManifestUrl.href)).trim());
} catch (error) {
  await server?.close();
  fail(
    `manifest خوانده نشد (${error instanceof Error ? error.message : error}).\n` +
      "  اگر سایت در دسترس نیست: --source docs (همان بیلدِ منتشرشدهٔ مخزن).",
  );
}

// ---------------------------------------------------------------------------
// ۲) ساختِ TwaManifest (همان کاری که bubblewrap init می‌کند)
// ---------------------------------------------------------------------------
const twaManifest = core.TwaManifest.fromWebManifestJson(sourceManifestUrl, webManifest);

const version = String(
  args.version ?? readJsonFile(join(ROOT, "package.json")).version ?? "",
).replace(/^v/i, "");
const appVersionCode = args["version-code"]
  ? Number(args["version-code"])
  : versionCodeFromVersion(version);

// سایتِ واقعی (نه آدرسِ محلی) — host و startUrl همان‌هایی‌اند که APK باز می‌کند.
twaManifest.host = publicBase.host;
twaManifest.startUrl = publicBase.pathname + publicBase.search;
twaManifest.fullScopeUrl = new URL(webManifest.scope ?? ".", publicBase);
twaManifest.packageId = packageId;
// در TwaManifest، فیلدِ JSON «appVersion» به appVersionName نگاشت می‌شود؛ هر دو را ست می‌کنیم
// تا هم build.gradle و هم twa-manifest.json یک عدد نشان دهند.
twaManifest.appVersion = version;
twaManifest.appVersionName = version;
twaManifest.appVersionCode = appVersionCode;
twaManifest.signingKey = { path: DEFAULT_KEYSTORE, alias: keyAlias };
twaManifest.generatorApp = "bubblewrap-cli";
twaManifest.splashScreenFadeOutDuration = 300;

// آیکون: عمداً PNG ۵۱۲ (نه SVG) تا لانچر همیشه آیکونِ درست داشته باشد.
const icon512 = findIcon(webManifest.icons, "any", 512) ?? findIcon(webManifest.icons, "maskable", 512);
const maskable512 = findIcon(webManifest.icons, "maskable", 512) ?? icon512;
if (icon512) twaManifest.iconUrl = new URL(icon512.src, sourceBase).href;
if (maskable512) twaManifest.maskableIconUrl = new URL(maskable512.src, sourceBase).href;
if (!twaManifest.launcherName) twaManifest.launcherName = String(webManifest.short_name ?? "");
if (twaManifest.launcherName.length > 12) twaManifest.launcherName = twaManifest.launcherName.slice(0, 12);

if (!twaManifest.iconUrl) {
  await server?.close();
  fail("در manifest سایت آیکونِ ۵۱۲×۵۱۲ پیدا نشد؛ TWA بدونِ آن ساخته نمی‌شود.");
}

console.log(`\n🧩 پروژه: ${packageId}  •  نسخه ${version} (code ${appVersionCode})`);
console.log(`   host:      ${twaManifest.host}`);
console.log(`   startUrl:  ${twaManifest.startUrl}`);
console.log(`   scope:     ${twaManifest.fullScopeUrl.href}`);
console.log(`   icon:      ${twaManifest.iconUrl}`);
console.log(`   shortcuts: ${twaManifest.shortcuts.length}\n`);

// ---------------------------------------------------------------------------
// ۳) تولیدِ پروژه
// ---------------------------------------------------------------------------
if (existsSync(outDir) && readdirSync(outDir).length > 0) {
  if (!existsSync(join(outDir, "twa-manifest.json"))) {
    await server?.close();
    fail(`پوشهٔ «${outDir}» خالی نیست و پروژهٔ TWA هم نیست؛ برای جلوگیری از پاک‌شدنِ داده متوقف شدم.`);
  }
  console.log(`♻️  بازسازیِ پوشهٔ ${outDir}`);
  rmSync(outDir, { recursive: true, force: true });
}

const generator = new core.TwaGenerator();
const log = new core.ConsoleLog("generate");
let lastPercent = -1;
await generator.createTwaProject(outDir, twaManifest, log, (current, total) => {
  const percent = Math.round((current / total) * 100);
  if (percent !== lastPercent) {
    lastPercent = percent;
    process.stdout.write(`\r   ساختِ منابع… ${percent}%`);
  }
});
process.stdout.write("\r   ساختِ منابع… 100%\n");

// ---------------------------------------------------------------------------
// ۴) پاک‌سازی: آدرسِ محلی → آدرسِ عمومی، و حذفِ jcenter (از کار افتاده)
// ---------------------------------------------------------------------------
let rewritten = 0;
if (sourceBase.href !== publicBase.href) {
  for (const file of listTextFiles(outDir)) {
    const before = readFileSync(file, "utf8");
    const after = before.split(sourceBase.href).join(publicBase.href);
    if (after !== before) {
      writeFileSync(file, after);
      rewritten += 1;
    }
  }
}

const buildGradle = join(outDir, "build.gradle");
if (existsSync(buildGradle)) {
  const before = readFileSync(buildGradle, "utf8");
  const after = before.replaceAll("jcenter()", "mavenCentral()");
  if (after !== before) writeFileSync(buildGradle, after);
}

// هیچ نشانی از localhost نباید در پروژه بماند.
const leftovers = listTextFiles(outDir).filter((file) => readFileSync(file, "utf8").includes("127.0.0.1"));
if (leftovers.length > 0) {
  await server?.close();
  fail(`آدرسِ محلی در این فایل‌ها باقی مانده است:\n  ${leftovers.join("\n  ")}`);
}

// ---------------------------------------------------------------------------
// ۵) twa-manifest.json + checksum
// ---------------------------------------------------------------------------
const manifestJson = stringifyManifest(twaManifest.toJson()).split(sourceBase.href).join(publicBase.href);
writeFileSync(join(outDir, "twa-manifest.json"), manifestJson);
writeFileSync(join(outDir, "manifest-checksum.txt"), manifestChecksum(manifestJson));

await server?.close();

ok(`پروژه ساخته شد: ${outDir}`);
if (rewritten > 0) {
  ok(`${rewritten} فایلِ متنی از ${sourceBase.href} به ${publicBase.href} بازنویسی شد.`);
}
console.log("   مرحلهٔ بعد:  npm run android:sync  (هم‌گام‌سازیِ نسخه) — یا مستقیم commit.");
if (twaManifest.shortcuts.some((shortcut) => shortcut.chosenIconUrl?.endsWith(".svg"))) {
  warn(
    "آیکونِ بعضی میان‌برها SVG است؛ Bubblewrap آن را به PNG تبدیل می‌کند. " +
      "اگر روزی تبدیل شکست خورد، در manifest برای میان‌برها PNG بگذارید.",
  );
}
