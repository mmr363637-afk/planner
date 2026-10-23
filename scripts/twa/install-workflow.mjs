#!/usr/bin/env node
// فعال‌سازیِ workflow اندروید: کپیِ android-workflow.yml به .github/workflows/android-apk.yml
//
//   npm run android:install-workflow
//
// چرا لازم است؟ GitHub فقط فایل‌های داخلِ .github/workflows/ را اجرا می‌کند و ابزارِ
// خودکاری که این تغییرات را ساخت، مجوزِ «Workflows» برای push آن مسیر را نداشت (همان
// وضعیتی که deploy-workflow.yml را در ریشه نگه داشته). این اسکریپت همان یک قدم را انجام
// می‌دهد؛ بعدش فقط commit و push لازم است.

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = join(ROOT, "android-workflow.yml");
const targetDir = join(ROOT, ".github", "workflows");
const target = join(targetDir, "android-apk.yml");

if (!existsSync(source)) {
  console.error(
    `✖ ${source} پیدا نشد.\n` +
      "  اگر workflow را از قبل منتقل کرده‌اید، همین حالا فعال است: .github/workflows/android-apk.yml",
  );
  process.exit(1);
}

mkdirSync(targetDir, { recursive: true });

if (existsSync(target) && readFileSync(target, "utf8") === readFileSync(source, "utf8")) {
  console.log("✔ از قبل نصب شده است: .github/workflows/android-apk.yml");
  process.exit(0);
}

copyFileSync(source, target);
console.log(`✔ کپی شد: android-workflow.yml → .github/workflows/android-apk.yml`);
console.log(`
قدمِ بعد (push باید با حسابی انجام شود که مجوزِ «Workflows» دارد):

  git add .github/workflows/android-apk.yml
  git commit -m "اندروید: فعال‌سازی workflow ساختِ APK"
  git push

سپس در GitHub: تبِ Actions → «Build Android APK (TWA)» → Run workflow
(یا بدونِ رابط: gh workflow run android-apk.yml)
`);
