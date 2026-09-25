# 🤖 اندروید بومی و ویجت صفحه‌ی خانگی (TWA) — نقشه‌ی راه

این راهنما برای وقتی است که بخواهی PWA را به یک **APK نصب‌شدنی اندروید** تبدیل کنی و/یا
**ویجتِ صفحه‌ی خانگی** (streak، کار بعدی، تایمر) بسازی. خودِ اپ فعلی یک PWA کامل است و
از طریق «افزودن به صفحه اصلی» هم نصب می‌شود؛ TWA فقط تجربه‌ی بومی‌تر (آیکون در لانچر،
بدون قاب مرورگر، دانلود از کافه‌بازار/مایکت) می‌دهد.

## ۱) ساخت APK با Bubblewrap (Trusted Web Activity)

پیش‌نیاز: Node 18+، JDK، Android SDK (Bubblewrap خودش راهنمایی می‌کند).

```bash
npx @bubblewrap/cli init --manifest https://<user>.github.io/<repo>/manifest.webmanifest
npx @bubblewrap/cli build
```

- `twa-manifest.json` ساخته می‌شود: `packageId` (مثلاً `ir.mahdimr.planner`) و امضای keystore را یک‌بار انتخاب کن.
- خروجی: `app-release-bundle.aab` / `app-release.apk` — برای کافه‌بازار aab و برای نصب مستقیم apk.

## ۲) Digital Asset Links (حذف قاب مرورگر)

وقتی APK را روی Play/بازار منتشر کردی، باید ثابت کنی مالکِ همان دامنه هستی تا TWA
تمام‌صفحه باز شود (وگرنه نوار آدرس می‌ماند):

1. `assetlinks.json` را با اثر انگشتِ SHA-256ِ گواهی امضایت بساز (نمونه پایین).
2. آن را در `https://<user>.github.io/.well-known/assetlinks.json` سرو کن.
   ⚠️ نکته‌ی مهم در GitHub Pages پروژه‌ای: سایت زیر `/<repo>/` سرو می‌شود ولی `assetlinks.json`
   باید **دقیقاً روی ریشه‌ی دامنه** باشد (`github.io/.well-known/`) — یعنی یا باید یک ریپوی
   `<user>.github.io` بسازی و آنجا سروش کنی، یا از دامنه‌ی شخصی (`planner.example.ir`) استفاده کنی.

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "ir.mahdimr.planner",
    "sha256_cert_fingerprints": ["AA:BB:...:اثر_انگشت_امضا"]
  }
}]
```

## ۳) ویجت صفحه‌ی خانگی — مسیر فنی پیشنهادی

PWA خالص هنوز Widget API ندارد؛ مسیرهای عملی:

1. **میان‌برهای PWA (بدون کد اضافه):** منیفست از قبل `shortcuts` دارد (مطالعه/مرور/امتحان‌ها) —
   با لمس‌طولانی آیکون اپ در لانچر دیده می‌شوند. این «ویجت ساده» امروز موجود است.
2. **ویجت بومی روی TWA:** وقتی APK را با Bubblewrap ساختی، می‌توانی یک `AppWidgetProvider`
   ساده (کوتین/Kotlin) اضافه کنی که فقط یک تصویرِ به‌روزشده (ذخیره‌شده توسط خود اپ در
   `localStorage` → خروجی PNG در `getExternalFilesDir` از طریق یک WebView مخفی یا WorkManager)
   نشان دهد و با tap، PWA را روی همان صفحه باز کند (`?page=home`).
   داده‌ها را می‌توان از طریق `localStorage` مشترک WebView/… نخواند (Sandbox جداست)؛ تمیزترین
   راه، «آخرین وضعیت» در SharedPreferences از طریق یک JavaScriptInterface کوچکِ داخل همان WebView
   است (streak + کار بعدی + زمان باقی‌مانده‌ی تایمر — همگی از پیش‌محاسبه‌شده در `wrappedShare`/
   `homeCards` موجودند).
3. **مسیر کامل‌تر:** میزبانی یک فایل وضعیتِ کوچک در Supabase (اختیاری) و خواندن آن با WorkManager —
   فقط اگر کاربر سینک ابر را وصل کرده باشد؛ حالت آفلاین همان مسیر ۲ است.

## ۴) پیشنهاد ترتیب کار

1. Bubblewrap + انتشار اولیه (بدون ویجت) — ارزان و سریع.
2. shortcuts کافی است تا نسخه‌ی ۲ ویجت بومی ساخته شود.
3. ویجتِ read-only (بدون تعامل) با مسیر ۳.۲ — تعامل (تایمر کنترلی) پیچیدگیِ زیادی دارد و برای
   نسخه‌ی اول لازم نیست.

سوال/گپ: [@Mahdimr3](https://t.me/Mahdimr3)
