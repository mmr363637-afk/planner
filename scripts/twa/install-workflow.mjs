#!/usr/bin/env node
// فعال‌سازیِ workflow اندروید: کپیِ android-workflow.yml به .github/workflows/android-apk.yml
//
//   npm run android:install-workflow
//
// چرا لازم است؟ GitHub فقط فایل‌های داخلِ .github/workflows/ را اجرا می‌کند و ابزارِ
// خودکاری که این تغییرات را ساخت مجوزِ «Workflows» برای push آن مسیر را ندارد؛ پس نسخهٔ
// کامل و به‌روز در scripts/twa/android-apk.yml نگه داشته می‌شود و این اسکریپت آن را (روی
// رایانهٔ خودتان که مجوزِ لازم را دارید) سرِ جایش می‌گذارد. اصلاحاتِ ساخت (R8/minify،
// حافظهٔ Gradle، Annotationها) در android/ و scripts/twa/build.mjs هستند و بدونِ این مرحله
// هم اعمال می‌شوند.

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = join(ROOT, "scripts", "twa", "android-apk.yml"); // قالبِ کامل و به‌روز
const targetDir = join(ROOT, ".github", "workflows");
const target = join(targetDir, "android-apk.yml");

if (!existsSync(source)) {
  console.error(`✖ قالبِ workflow پیدا نشد: ${source}`);
  process.exit(1);
}

mkdirSync(targetDir, { recursive: true });

if (existsSync(target) && readFileSync(target, "utf8") === readFileSync(source, "utf8")) {
  console.log("✔ از قبل نصب و هم‌گام است: .github/workflows/android-apk.yml");
  process.exit(0);
}

copyFileSync(source, target);
console.log("✔ کپی شد: scripts/twa/android-apk.yml → .github/workflows/android-apk.yml");
console.log(`
قدمِ بعد (push باید با حسابی انجام شود که مجوزِ «Workflows» دارد):

  git add .github/workflows/android-apk.yml
  git commit -m "اندروید: فعال‌سازی workflow ساختِ APK"
  git push

سپس در GitHub: تبِ Actions → «Build Android APK (TWA)» → Run workflow
(یا بدونِ رابط: gh workflow run android-apk.yml)
`);
