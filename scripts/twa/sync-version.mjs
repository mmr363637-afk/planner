#!/usr/bin/env node
// هم‌گام‌سازیِ نسخهٔ اندروید با package.json + بازنویسیِ manifest-checksum.txt
//
//   npm run android:sync                     # از نسخهٔ package.json
//   npm run android:sync -- --version 1.22.0 # نسخهٔ دستی (مثلاً از تگِ v1.22.0)
//   npm run android:sync -- --check          # فقط بررسی؛ اگر عقب است با کدِ ۱ خارج می‌شود
//   npm run android:sync -- --key-alias prod # اگر نامِ alias در keystore چیز دیگری است
//
// چرا لازم است؟ Bubblewrap هنگامِ `build` محتوای twa-manifest.json را با
// android/manifest-checksum.txt مقایسه می‌کند و اگر یکی نباشد، **تعاملی** می‌پرسد که پروژه
// به‌روز شود یا نه؛ در CI این پرسش یعنی گیرکردن. پس هر بار که نسخه را عوض می‌کنیم، checksum
// را هم با همان الگوریتم (SHA-1) از نو می‌نویسیم.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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
const args = parseArgs();

const manifestPath = resolve(ROOT, String(args.manifest ?? "android/twa-manifest.json"));
const packagePath = resolve(ROOT, String(args.package ?? "package.json"));
const checksumPath = resolve(dirname(manifestPath), "manifest-checksum.txt");

const appVersion = String(
  args.version ?? readJsonFile(packagePath).version ?? "",
).trim().replace(/^v/i, "");
if (!appVersion) fail("نسخه پیدا نشد؛ یا --version بدهید یا package.json را بررسی کنید.");

let versionCode;
try {
  versionCode = args["version-code"]
    ? Number(args["version-code"])
    : versionCodeFromVersion(appVersion);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
if (!Number.isInteger(versionCode) || versionCode < 1) {
  fail(`versionCode نامعتبر است: ${args["version-code"]}`);
}

const twaManifest = readJsonFile(manifestPath);
const previousVersion = String(twaManifest.appVersion ?? "");
const previousCode = Number(twaManifest.appVersionCode ?? 0);

if (previousCode > versionCode) {
  warn(
    `versionCode فعلی (${previousCode}) از نسخهٔ جدید (${versionCode}) بزرگ‌تر است؛ ` +
      "اندروید اجازهٔ نصبِ نسخهٔ پایین‌تر را نمی‌دهد. اگر عمدی است، عددِ بالاتر بدهید.",
  );
}

// Bubblewrap هر دو کلید را می‌نویسد و فقط «appVersion» را می‌خواند؛ برای جلوگیری از ناهم‌خوانی
// نمایشی، هر دو را یکسان نگه می‌داریم.
twaManifest.appVersion = appVersion;
twaManifest.appVersionName = appVersion;
twaManifest.appVersionCode = versionCode;
if (args["key-alias"]) {
  twaManifest.signingKey = { ...twaManifest.signingKey, alias: String(args["key-alias"]) };
}

const text = stringifyManifest(twaManifest);
const checksum = manifestChecksum(text);
const currentChecksum = readFileSync(checksumPath, "utf8").trim();

if (args.check) {
  const stale =
    previousVersion !== appVersion ||
    previousCode !== versionCode ||
    (args["key-alias"] && twaManifest.signingKey?.alias !== String(args["key-alias"])) ||
    currentChecksum !== checksum;
  if (stale) {
    fail(
      `android/ با نسخهٔ ${appVersion} هم‌گام نیست ` +
        `(فعلی: ${previousVersion} / code ${previousCode}). اجرا کنید: npm run android:sync`,
    );
  }
  ok(`android/ با نسخهٔ ${appVersion} (code ${versionCode}) هم‌گام است.`);
  process.exit(0);
}

writeFileSync(manifestPath, text);
writeFileSync(checksumPath, checksum);

ok(`twa-manifest.json → appVersion ${appVersion} / appVersionCode ${versionCode}`);
ok(`manifest-checksum.txt → ${checksum.slice(0, 12)}…`);
if (previousVersion && previousVersion !== appVersion) {
  console.log(`  نسخهٔ قبلیِ اندروید: ${previousVersion} (code ${previousCode})`);
}
