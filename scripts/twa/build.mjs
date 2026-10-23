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

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fail, manifestChecksum, ok, parseArgs, warn } from "./shared.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = parseArgs();
const androidDir = resolve(ROOT, String(args.dir ?? "android"));
const manifestPath = join(androidDir, "twa-manifest.json");
const checksumPath = join(androidDir, "manifest-checksum.txt");

if (!existsSync(manifestPath)) {
  fail("android/twa-manifest.json نیست. اول: npm run android:generate");
}

// ۱) نسخه/checksum هم‌گام باشد، وگرنه Bubblewrap تعاملی می‌پرسد
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

// ۲) keystore و رمزها
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

// ۳) اجرای build
const bubblewrap = process.env.BUBBLEWRAP_BIN ?? "bubblewrap";
console.log(`\n🔨 bubblewrap build  (cwd: ${androidDir})\n`);
const result = spawnSync(bubblewrap, ["build"], {
  cwd: androidDir,
  stdio: "inherit",
  env: { ...process.env, ANDROID_HOME: process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? "" },
  shell: process.platform === "win32",
});
if (result.error) {
  fail(
    `bubblewrap اجرا نشد (${result.error.message}).\n` +
      "  نصب: npm install -g @bubblewrap/cli@1.27.0",
  );
}
if (result.status !== 0) fail(`bubblewrap build با کدِ ${result.status} شکست خورد.`);

// ۴) جمع‌آوریِ خروجی
const signedApk = join(androidDir, "app-release-signed.apk");
const bundle = join(androidDir, "app-release-bundle.aab");
if (!existsSync(signedApk)) fail("APK امضاشده ساخته نشد (app-release-signed.apk پیدا نشد).");

const version = String(twaManifest.appVersion ?? twaManifest.appVersionName ?? "0.0.0");
const label = String(args.label ?? process.env.ANDROID_BUILD_LABEL ?? "test");
if (!["test", "release"].includes(label)) fail(`برچسبِ ساخت نامعتبر: ${label} (test|release)`);

const outDir = join(ROOT, String(args.out ?? "build/android"));
mkdirSync(outDir, { recursive: true });
const apkName = `planner-${version}-${label}.apk`;
const apkPath = join(outDir, apkName);
copyFileSync(signedApk, apkPath);

const sha256 = createHash("sha256").update(readFileSync(apkPath)).digest("hex");
const sizeMb = (statSync(apkPath).size / (1024 * 1024)).toFixed(1);

// ۵) اثرِ انگشتِ امضا (همان چیزی که در assetlinks.json لازم است)
let fingerprint = "";
const buildTools = process.env.ANDROID_HOME
  ? [
      join(process.env.ANDROID_HOME, "build-tools", "36.1.0", "apksigner"),
      join(process.env.ANDROID_HOME, "build-tools", "36.1.0", "apksigner.bat"),
    ].find((candidate) => existsSync(candidate))
  : undefined;
if (buildTools) {
  const verify = spawnSync(
    buildTools,
    ["verify", "--print-certs", apkPath],
    { encoding: "utf8", env: process.env, shell: true },
  );
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
