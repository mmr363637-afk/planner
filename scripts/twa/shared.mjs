// ابزارهای مشترکِ اسکریپت‌های TWA (اندروید) — بدونِ وابستگی خارجی.
//
// چرا اسکریپت؟ Bubblewrap دستورِ `init` را تعاملی اجرا می‌کند (inquirer) و داخلِ CI بدونِ TTY
// گیر می‌کند. پس پروژه‌ی اندروید را با API خودِ `@bubblewrap/core` (TwaGenerator) می‌سازیم،
// همان‌جا نسخه را از package.json می‌گیریم و checksumی که `bubblewrap build` انتظار دارد را
// با همان الگوریتم (SHA-1 هگزِ محتوای twa-manifest.json) دوباره می‌نویسیم.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * تجزیه‌ی ساده‌ی آرگومان‌های خط فرمان:  --key value | --key=value | --flag
 * @param {string[]} argv
 * @returns {Record<string, string | boolean> & { _: string[] }}
 */
export function parseArgs(argv = process.argv.slice(2)) {
  /** @type {Record<string, string | boolean> & { _: string[] }} */
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      out._.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const eq = body.indexOf("=");
    if (eq >= 0) {
      out[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[body] = next;
      i += 1;
    } else {
      out[body] = true;
    }
  }
  return out;
}

/**
 * کد نسخه‌ی اندروید از نسخه‌ی semver:  major*10000 + minor*100 + patch
 * مثال: 1.21.0 → 12100، 1.21.3 → 12103، 2.0.0 → 20000.
 * (پیش‌وند/پس‌وندِ pre-release نادیده گرفته می‌شود.)
 * @param {string} version
 * @returns {number}
 */
export function versionCodeFromVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version).trim().replace(/^v/i, ""));
  if (!match) throw new Error(`نسخهٔ نامعتبر: «${version}» (قالبِ درست: 1.21.0)`);
  const [, major, minor, patch] = match;
  const code = Number(major) * 10000 + Number(minor) * 100 + Number(patch);
  if (!Number.isSafeInteger(code) || code > 2_100_000_000) {
    throw new Error(`versionCode از بازهٔ مجازِ اندروید بیرون است: ${code}`);
  }
  return code;
}

/**
 * همان checksumی که Bubblewrap در `manifest-checksum.txt` می‌نویسد:
 * SHA-1 هگزِ بایت‌های فایلِ twa-manifest.json (بدونِ newline).
 * @param {Buffer | string} contents
 * @returns {string}
 */
export function manifestChecksum(contents) {
  return createHash("sha1").update(contents).digest("hex");
}

/** @param {string} file */
export function readJsonFile(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

/**
 * نوشتن JSON با همان قالبِ Bubblewrap (۲ فاصله، بدونِ newlineِ پایانی).
 * @param {unknown} value
 * @returns {string}
 */
export function stringifyManifest(value) {
  return JSON.stringify(value, null, 2);
}

/** پیامِ خطا با ظاهرِ یکسان در همه‌ی اسکریپت‌ها */
export function fail(message) {
  console.error(`\x1b[31m✖ ${message}\x1b[0m`);
  process.exit(1);
}

/** پیامِ هشدار (خروجی با کدِ ۰) */
export function warn(message) {
  console.warn(`\x1b[33m⚠ ${message}\x1b[0m`);
}

/** پیامِ موفقیت */
export function ok(message) {
  console.log(`\x1b[32m✔ ${message}\x1b[0m`);
}
