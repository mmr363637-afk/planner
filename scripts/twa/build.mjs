#!/usr/bin/env node
// ساختِ APK از پروژهٔ android/ با Bubblewrap — بدونِ هیچ پرسشِ تعاملی.
//
//   npm run android:build                     # خروجی آزمایشی (اگر با کلیدِ موقت امضا شده باشد)
//   ANDROID_BUILD_LABEL=release npm run android:build
//
// پیش‌نیازها:
//   • bubblewrap روی PATH  →  npm install -g @bubblewrap/cli@1.27.0
//   • android/twa-manifest.json و android/manifest-checksum.txt هم‌گام  →  npm run android:sync
//   • فایلِ keystore در مسیرِ signingKey.path و متغیرهای محیطی:
//       BUBBLEWRAP_KEYSTORE_PASSWORD, BUBBLEWRAP_KEY_PASSWORD
//     (Bubblewrap همین دو را می‌خواند و به‌جای پرسیدنِ رمز استفاده می‌کند.)
//
// چرا همه‌چیز این‌قدر سخت‌گیر است؟ اگر Bubblewrap به پرسشی برسد (checksum عوض شده، رمزِ
// keystore نبود، ...) در CI بدونِ TTY یا گیر می‌کند یا خطای مبهم می‌دهد. این‌جا قبل از اجرا
// همهٔ پیش‌شرط‌ها با پیامِ فارسیِ روشن بررسی می‌شوند.
//
// نکتهٔ مهم برای CI: خروجیِ build کامل در build/android/bubblewrap-build.log ذخیره می‌شود و در
// صورتِ شکست، خلاصهٔ خطا (چه چیزی خراب شد + ۱۵ خطِ آخر) به‌صورتِ GitHub Annotation منتشر
// می‌شود؛ در غیرِ این‌صورت تنها چیزی که در UI دیده می‌شد «exit code 1» بود.

import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fail, manifestChecksum, ok, parseArgs, warn } from "./shared.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = parseArgs();
const androidDir = resolve(ROOT, String(args.dir ?? "android"));
const manifestPath = join(androidDir, "twa-manifest.json");
const checksumPath = join(androidDir, "manifest-checksum.txt");
const outDir = resolve(ROOT, String(args.out ?? "build/android"));
const logPath = join(outDir, "bubblewrap-build.log");

if (!existsSync(manifestPath)) {
  fail("android/twa-manifest.json نیست. اول: npm run android:generate");
}

// ---------------------------------------------------------------------------
// ۱) نسخه/checksum هم‌گام باشد، وگرنه Bubblewrap تعاملی می‌پرسد
// ---------------------------------------------------------------------------
const manifestText = readFileSync(manifestPath, "utf8");
const twaManifest = JSON.parse(manifestText);
const expectedChecksum = manifestChecksum(manifestText);
const storedChecksum = existsSync(checksumPath) ? readFileSync(checksumPath, "utf8").trim() : "";
if (storedChecksum !== expectedChecksum) {
  fail(
    "android/manifest-checksum.txt با twa-manifest.json یکی نیست.\n" +
      "  Bubblewrap در این حالت تعاملی می‌پرسد و در CI معلق می‌ماند.\n" +
      "  اجرا کنید: npm run android:sync",
  );
}

// ---------------------------------------------------------------------------
// ۲) keystore و رمزها
// ---------------------------------------------------------------------------
const keystorePath = resolve(androidDir, String(twaManifest.signingKey?.path ?? "./android.keystore"));
if (!existsSync(keystorePath)) {
  fail(
    `فایلِ keystore پیدا نشد: ${keystorePath}\n` +
      "  • انتشارِ واقعی: keystore را از GitHub Secrets (ANDROID_KEYSTORE_BASE64) بازسازی کنید.\n" +
      "  • ساختِ آزمایشی: یک keystore موقت بسازید (workflow همین کار را می‌کند).\n" +
      "  هیچ keystore‌ای را commit نکنید.",
  );
}
for (const name of ["BUBBLEWRAP_KEYSTORE_PASSWORD", "BUBBLEWRAP_KEY_PASSWORD"]) {
  if (!process.env[name]) {
    fail(
      `متغیرِ محیطی ${name} تنظیم نشده است.\n` +
        "  Bubblewrap بدونِ آن رمز را تعاملی می‌پرسد و در CI شکست می‌خورد.",
    );
  }
}

// ---------------------------------------------------------------------------
// ۳) عکسِ وضعیتِ محیط (برای دیباگ در لاگِ CI)
// ---------------------------------------------------------------------------
const buildToolsVersion = /buildToolsVersion\s+"([^"]+)"/.exec(
  readFileSync(join(androidDir, "app/build.gradle"), "utf8"),
)?.[1];

function capture(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    timeout: 20_000,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() || result.error?.message || "";
}

console.log("\n🧭 محیطِ ساخت");
console.log(`   node:            ${process.version}`);
console.log(`   java:            ${capture("java", ["-version"]).split("\n")[0] || "؟"}`);
console.log(`   ANDROID_HOME:    ${process.env.ANDROID_HOME ?? "(تنظیم نشده)"}`);
console.log(`   build-tools:     ${buildToolsVersion ?? "(پیش‌فرضِ AGP)"}`);
try {
  const available = readdirSync(join(process.env.ANDROID_HOME ?? "", "build-tools")).join(", ");
  console.log(`   نصب‌شده:         ${available}`);
} catch {
  console.log("   نصب‌شده:         (خوانده نشد)");
}
console.log(`   packageId:       ${twaManifest.packageId}`);
console.log(`   نسخه:            ${twaManifest.appVersion} (code ${twaManifest.appVersionCode})`);
console.log("");

// ---------------------------------------------------------------------------
// ۴) اجرای build با ثبتِ کاملِ خروجی
// ---------------------------------------------------------------------------
const bubblewrap = process.env.BUBBLEWRAP_BIN ?? "bubblewrap";
mkdirSync(outDir, { recursive: true });
console.log(`🔨 ${bubblewrap} build  (cwd: ${androidDir})\n`);

/** پیامِ Annotation در GitHub Actions باید %، \r و \n را escape کند */
function ghEscape(message) {
  return message.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

/** خطوطی که معمولاً علتِ واقعیِ شکست‌اند را از لاگ بیرون می‌کشد */
function extractErrorExcerpt(log) {
  const lines = log.split(/\r?\n/);
  const patterns = [
    /^FAILURE:/,
    /^ERROR:/,
    /^e: /,
    /^\* What went wrong:/,
    /^> /,
    /^Caused by:/,
    /Missing class/,
    /^Execution failed for task/,
    /^Could not (resolve|find|download|install)/,
    /^error:/i,
    /Execution failed|BUILD FAILED/,
  ];
  const important = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && patterns.some((pattern) => pattern.test(trimmed))) important.push(trimmed);
    if (important.length >= 12) break;
  }
  const tail = lines.map((line) => line.trimEnd()).filter(Boolean).slice(-15);
  return [...new Set([...important, ...(important.length ? ["…"] : []), ...tail])].join("\n");
}

function publishFailure(log, status) {
  const excerpt = extractErrorExcerpt(log);
  console.error(`\n\x1b[31m✖ bubblewrap build با کدِ ${status} شکست خورد.\x1b[0m`);
  console.error(`  لاگِ کامل: ${logPath}`);
  console.error(excerpt.split("\n").map((line) => `  | ${line}`).join("\n"));

  if (process.env.GITHUB_ACTIONS === "true") {
    // Annotation در UI همان اجرا بالا می‌آید و از طریق API هم قابلِ خواندن است —
    // بدونِ این، تنها چیزی که دیده می‌شد «Process completed with exit code 1» بود.
    console.log(`::error title=Bubblewrap build failed (exit ${status})::${ghEscape(excerpt).slice(0, 6000)}`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      writeFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        [
          "### ❌ ساختِ APK شکست خورد",
          "",
          `کدِ خروج: \`${status}\` — لاگِ کامل در Artifactِ \`build-log\` (فایلِ \`bubblewrap-build.log\`).`,
          "",
          "```",
          excerpt,
          "```",
          "",
        ].join("\n"),
        { flag: "a" },
      );
    } catch {
      /* summary اختیاری است */
    }
  }
}

const chunks = [];
let logBytes = 0;
const child = spawn(bubblewrap, ["build"], {
  cwd: androidDir,
  env: { ...process.env, CI: process.env.CI ?? "true" },
  stdio: ["ignore", "pipe", "pipe"], // stdin بسته: هیچ پرسشی نمیتواند منتظرِ Enter بماند
});

for (const [stream, target] of [
  [child.stdout, process.stdout],
  [child.stderr, process.stderr],
]) {
  stream.on("data", (chunk) => {
    target.write(chunk);
    const size = Math.min(chunk.length, 400_000 - logBytes);
    if (size > 0) {
      chunks.push(chunk.subarray(0, size));
      logBytes += size;
    }
  });
}

let spawnError;
child.on("error", (error) => {
  spawnError = error;
});

const status = await new Promise((done) => child.on("close", (code, signal) => done(code ?? (signal ? 1 : 0))));
const log = Buffer.concat(chunks).toString("utf8");
try {
  writeFileSync(logPath, log);
} catch {
  /* نوشتنِ لاگ نباید خودش ساخت را بشکند */
}

if (spawnError) {
  fail(
    `bubblewrap اجرا نشد (${spawnError.message}).\n` +
      "  نصب: npm install -g @bubblewrap/cli@1.27.0",
  );
}
if (status !== 0) {
  publishFailure(log, status);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// ۵) جمع‌آوریِ خروجی
// ---------------------------------------------------------------------------
const signedApk = join(androidDir, "app-release-signed.apk");
const bundle = join(androidDir, "app-release-bundle.aab");
if (!existsSync(signedApk)) fail("APK امضاشده ساخته نشد (app-release-signed.apk پیدا نشد).");

const version = String(twaManifest.appVersion ?? twaManifest.appVersionName ?? "0.0.0");
const label = String(args.label ?? process.env.ANDROID_BUILD_LABEL ?? "test");
if (!["test", "release"].includes(label)) fail(`برچسبِ ساخت نامعتبر: ${label} (test|release)`);

const apkName = `planner-${version}-${label}.apk`;
const apkPath = join(outDir, apkName);
copyFileSync(signedApk, apkPath);

const sha256 = createHash("sha256").update(readFileSync(apkPath)).digest("hex");
const sizeMb = (statSync(apkPath).size / (1024 * 1024)).toFixed(1);

// ۶) اثرِ انگشتِ امضا (همان چیزی که در assetlinks.json لازم است)
let fingerprint = "";
const toolsDir = process.env.ANDROID_HOME
  ? join(process.env.ANDROID_HOME, "build-tools", buildToolsVersion ?? "36.1.0")
  : "";
const apksigner = [join(toolsDir, "apksigner"), join(toolsDir, "apksigner.bat")].find((candidate) =>
  existsSync(candidate),
);
if (apksigner) {
  const verify = spawnSync(apksigner, ["verify", "--print-certs", apkPath], {
    encoding: "utf8",
    timeout: 60_000,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
    shell: true,
  });
  fingerprint = /SHA-256 digest:\s*([0-9a-f:]+)/i.exec(verify.stdout ?? "")?.[1] ?? "";
  if (fingerprint) {
    writeFileSync(join(outDir, "apk-signing-fingerprint.txt"), `${fingerprint}\n`);
  } else {
    warn("apksigner اجرا شد ولی اثرِ انگشتِ SHA-256 خوانده نشد.");
  }
} else {
  warn("ANDROID_HOME/build-tools پیدا نشد؛ اثرِ انگشتِ امضا محاسبه نشد.");
}

writeFileSync(
  join(outDir, "build-info.txt"),
  [
    `packageId: ${twaManifest.packageId}`,
    `versionName: ${version}`,
    `versionCode: ${twaManifest.appVersionCode}`,
    `build: ${label}`,
    `apk: ${apkName}`,
    `sha256: ${sha256}`,
    `signer-sha256: ${fingerprint || "—"}`,
  ].join("\n"),
);

ok(`APK ساخته شد: ${apkPath} (${sizeMb}MB)`);
console.log(`   sha256: ${sha256}`);
if (fingerprint) console.log(`   امضاکننده (SHA-256): ${fingerprint}`);
if (existsSync(bundle)) console.log(`   AAB: ${bundle}`);
if (label === "test") {
  warn(
    "این APK آزمایشی است (کلیدِ موقت یا کلیدِ تست)؛ برای انتشار در فروشگاه از حالتِ release " +
      "با کلیدِ دائمیِ ذخیره‌شده در GitHub Secrets استفاده کنید.",
  );
}
