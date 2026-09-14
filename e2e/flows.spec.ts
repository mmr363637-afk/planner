import { expect, type Page, test } from "@playwright/test";

/**
 * سه جریان کاربریِ اصلی اپ — روی بیلدِ production در مرورگر واقعی.
 * (رفتار داخلی توسط ۳۵۰+ تست واحد پوشش داده شده؛ اینجا فقط «دوربزن» کاربری است.)
 */

/** آنبوردینگِ ۴ کلیکه با کتابخانه‌ی نمونه (۲۹۷ مبحث) */
async function finishOnboarding(page: Page) {
  await page.goto("/");
  await expect(page.getByText("شروع · قدم ۱ از ۳")).toBeVisible();
  await page.getByRole("button", { name: "بعدی" }).click();
  await expect(page.getByText("روزی چقدر می‌خوای بخونی؟")).toBeVisible();
  await page.getByRole("button", { name: "بعدی" }).click();
  await page.getByRole("button", { name: /بساژ و شروع کن/ }).click();
  await expect(page.getByText("🎉 آماده‌ای!")).toBeVisible();
  await page.getByRole("button", { name: "فعلاً خودم می‌گردم" }).click();
}

/** یک مبحث (شوک — جراحی لارنس) به برنامه‌ی امروز اضافه کن */
async function planTopicForToday(page: Page, topicName = "شوک") {
  await page.getByRole("button", { name: "برنامه", exact: true }).click();
  await page.getByTitle("افزودن مبحث به این روز").click();
  await page.getByPlaceholder("نام مبحث یا درس…").fill(topicName);
  await page.getByRole("button", { name: new RegExp(topicName) }).first().click();
  await page.getByRole("button", { name: "افزودن", exact: true }).click();
  await expect(page.getByText(`«${topicName}» به برنامه اضافه شد`)).toBeVisible();
}

test.describe("جریان ۱ — آنبوردینگ تا ثبتِ جلسه‌ی مطالعه", () => {
  test("آنبوردینگ ← برنامه‌ریزی ← مطالعه ← ارزیابی", async ({ page }) => {
    await finishOnboarding(page);

    await planTopicForToday(page, "شوک");

    // شروع جلسه از روی ردیفِ تسک
    await page.getByTitle("شروع مطالعه").click();
    await expect(page.getByRole("heading", { name: "شوک" })).toBeVisible();

    // پایان ← ارزیابی ← خلاصه‌ی جلسه
    await page.getByRole("button", { name: "پایان", exact: true }).click();
    await expect(page.getByText("چقدر از این مبحث را یاد گرفتی؟")).toBeVisible();
    await page.getByRole("button", { name: "نسبتاً خوب" }).click();
    await expect(page.getByText("جلسه ثبت شد 🎉")).toBeVisible();
    await expect(page.getByText(/مطالعه ثبت شد \(\+۱ XP\)/)).toBeVisible();
    await expect(page.getByText(/🔁 مرور بعدی:/)).toBeVisible();

    // بازگشت به خانه؛ نشانِ تبِ مرور باید فعال شده باشد
    await page.getByRole("button", { name: "بازگشت به خانه" }).click();
    await expect(page.locator("nav").getByRole("button", { name: /مرور/ }).first()).toContainText(/۱|۲|۹\+/);
  });
});

test.describe("جریان ۲ — برگِ چاپیِ هفتگی", () => {
  test("در صفحه دیده نمی‌شود؛ در حالت print فقط خودش چاپ می‌شود", async ({ page }) => {
    await finishOnboarding(page);
    await planTopicForToday(page, "شوک");

    // شیت چاپ تا زدن دکمه اصلاً در DOM نیست
    await expect(page.getByRole("heading", { name: "برنامه‌ی هفتگی مطالعه" })).toHaveCount(0);

    // دکمه‌ی «🖨️ چاپ / PDF» در صفحه‌ی هفتگی — arm می‌کند و دیالوگِ چاپ را می‌زند
    await page.getByRole("button", { name: "⏰ هفتگی" }).click();
    const printDialog = page.waitForEvent("dialog").catch(() => null);
    await page.getByRole("button", { name: /🖨️ چاپ \/ PDF/ }).click();
    await expect(page.getByRole("heading", { name: "برنامه‌ی هفتگی مطالعه" })).toHaveCount(1);
    await printDialog; // اگر دیالوگِ چاپ باز شد، نادیده بگیر (headless: معمولاً نمی‌آید)

    // حالت print: فقط شیت چاپ
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("heading", { name: "برنامه‌ی هفتگی مطالعه" })).toBeVisible();
    // تسکِ امروزِ برنامه‌ریزی‌شده روی شیت
    await expect(page.getByText(/شوک/)).toBeVisible();
    // بقیه‌ی اپ (نوار پایین و…) پنهان
    await expect(page.locator("nav")).toBeHidden();

    // بازگشت به حالت صفحه
    await page.emulateMedia({ media: "screen" });
    await expect(page.getByRole("heading", { name: "برنامه‌ی هفتگی مطالعه" })).toBeHidden();
    await expect(page.locator("nav")).toBeVisible();
  });
});

test.describe("جریان ۳ — بانک فلش‌کارت‌های منتخب", () => {
  test("بازکردن بانک ← بارگذاری تنبل ← انتخاب همه ← وارد کردن", async ({ page }) => {
    await finishOnboarding(page);

    // تب مرور ← زیرتب کارت‌ها
    await page.getByRole("button", { name: "مرور", exact: true }).click();
    await page.getByRole("button", { name: /🃏 کارت‌ها/ }).click();
    await expect(page.getByText("⭐ بانک فلش‌کارت‌های منتخب")).toBeVisible();

    // بازکردن اولین گروه درس
    await page.getByRole("button", { name: /^⭐ / }).first().click();

    // اولین مبحثِ بانک — چیپ «منتخب: N باقی‌مانده» نشانه‌ی آن است
    const deck = page.getByRole("button", { name: /⭐ منتخب: / }).first();
    await expect(deck).toBeVisible();
    await deck.click();

    // جزئیات: ابتدا کارت‌های منتخب با بارگذاری تنبل می‌آیند (chunk جدا)
    await expect(page.getByText("⭐ فلش‌کارت‌های منتخب سازنده")).toBeVisible();

    // انتخاب همه ← وارد کردن
    await page.getByRole("button", { name: "انتخاب همه" }).click();
    const importBtn = page.getByRole("button", { name: /افزودن \S+ کارت انتخابی/ }).first();
    await expect(importBtn).toBeEnabled();
    await importBtn.click();
    await expect(page.getByText(/کارت منتخب به کارت‌های تو اضافه شد/)).toBeVisible();

    // کارت‌ها حالا در «کارت‌های من» هستند؛ بخش منتخب دیگر «باقی‌مانده» ندارد
    await expect(page.getByText("کارت‌های من", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: /افزودن \S+ کارت انتخابی/ })).toHaveCount(0);
    await expect(page.getByText(/۰ باقی‌مانده/)).toBeVisible();

    // بستن ← در فهرست، چیپِ مبحث «۰ باقی‌مانده» نشان می‌دهد همه وارد شده
    await page.getByRole("button", { name: "بستن", exact: true }).click();
    await expect(page.getByRole("button", { name: /⭐ منتخب: ۰ باقی‌مانده/ })).toBeVisible();
  });
});
