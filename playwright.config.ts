import { defineConfig } from "@playwright/test";

/**
 * E2E روی بیلدِ واقعیِ production (vite preview روی docs/).
 * سه جریان کاربری اصلی:
 *  1) آنبوردینگ ← برنامه‌ریزیِ مبحث ← جلسه‌ی مطالعه ← ارزیابی ← ثبت مرور
 *  2) برگِ چاپیِ هفتگی (فقط هنگام print ظاهر می‌شود)
 *  3) بانک فلش‌کارت‌های منتخب — بارگذاری تنبل + وارد کردن کارت‌ها
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
    // اپ موبایل‌محور است — با viewport موبایل تست می‌شود
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: "npm run build && npm run preview -- --port 4173 --host 127.0.0.1 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
  projects: [{ name: "chromium", use: {} }],
});
