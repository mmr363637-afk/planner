# 🤖 اندروید بومی (TWA) و ویجتِ صفحه‌ی خانگی — راهنمای کامل

این پروژه از قبل یک **PWA کامل** است: `manifest.webmanifest` با `start_url`/`scope` نسبی
(زیرِ `/planner/`)، آیکون‌های ۱۹۲/۵۱۲ و maskable، و service workerِ آفلاین. پس برای اندروید
کدِ اپ بازنویسی نمی‌شود؛ همان PWA با **Trusted Web Activity** بسته‌بندی می‌شود و هر تغییرِ وب
(بعد از deploy) بدونِ انتشارِ APK تازه به گوشی می‌رسد.

خلاصهٔ کاربردی (نصب workflow، دانلودِ APK، Secretها) در README → **«نصب روی اندروید»** آمده است.
این فایل جزئیاتِ فنی و تنظیماتِ دستی را پوشش می‌دهد.

---

## ۰) وضعیتِ فعلی — چه چیزی کجاست؟

| مسیر | چیست |
|---|---|
| `android/` | پروژهٔ اندرویدِ تولیدشدهٔ Bubblewrap (commit شده): `twa-manifest.json`، Gradle، منابع/آیکون‌ها، `LauncherActivity.java` |
| `android/twa-manifest.json` | تنها منبعِ تنظیماتِ اندروید: `packageId`، `host`، `startUrl`، `fullScopeUrl`، نسخه، امضا |
| `android/manifest-checksum.txt` | SHA-1 همان فایل؛ Bubblewrap با آن می‌فهمد پروژه به‌روز است یا نه |
| `scripts/twa/generate.mjs` | بازسازیِ `android/` از manifest سایت (`TwaManifest.fromWebManifestJson` + `TwaGenerator`) |
| `scripts/twa/sync-version.mjs` | نسخهٔ `package.json` → `twa-manifest.json` + بازنویسیِ checksum |
| `scripts/twa/preflight.mjs` | بررسیِ manifest/آیکون/scope و هم‌خوانی با `android/twa-manifest.json` |
| `scripts/twa/build.mjs` | اجرای غیرتعاملیِ `bubblewrap build` + نام‌گذاری و اثرِ انگشتِ خروجی |
| `scripts/twa/install-workflow.mjs` | بررسیِ نصب بودنِ workflow (آرشیو/فورک) |
| `.github/workflows/android-apk.yml` | خودِ workflow (دستی و با تگ) |
| `scripts/twa/android-apk.yml` | قالبِ کاملِ همان workflow (منبعِ هم‌گام‌سازی) |
| `src/__tests__/android-twa.test.ts` | نگهبان: نسخه/شناسه/آیکون/checksum از PWA جدا نشود |

| مورد | مقدار |
|---|---|
| `packageId` | `ir.mahdimr.planner` |
| host | `mmr363637-afk.github.io` |
| `startUrl` / scope | `/planner/` / `https://mmr363637-afk.github.io/planner/` |
| `versionName` / `versionCode` | `1.21.0` / `12100` = `major×10000 + minor×100 + patch` |
| minSdk / compileSdk / targetSdk | 21 / 36 / 36 |
| ابزارها | Node 22، JDK 17 (Temurin)، Android SDK 36 + build-tools 36.1.0، Bubblewrap 1.27.0، Gradle 8.11.1، AGP 8.9.1 |

---

## ۱) فعال‌سازی و اجرای workflow

workflow از قبل در `.github/workflows/android-apk.yml` نصب و فعال است؛ کاری لازم نیست.
اگر قالب را در `scripts/twa/android-apk.yml` تغییر دادید: `npm run android:install-workflow`
و سپس commit/push (این مسیر به مجوزِ «Workflows» نیاز دارد).

اجرا:

```bash
gh workflow run android-apk.yml                              # نسخه از package.json
gh workflow run android-apk.yml -f version=1.21.0            # نسخهٔ دستی
gh workflow run android-apk.yml -f publish_release=true      # ساخت + GitHub Release (نیازمند Secret)
git tag v1.21.0 && git push origin v1.21.0                   # خودکار با تگ (نسخه باید با package.json یکی باشد)
```

دانلود:

```bash
gh run list --workflow android-apk.yml --limit 1
gh run download <RUN_ID> -n planner-apk-1.21.0-test
adb install -r planner-1.21.0-test.apk
```

در رابط وب: **Actions → اجرای موردنظر → پایینِ صفحه → Artifacts**.
Artifactها ۳۰ روز می‌مانند؛ برای نگه‌داریِ بلندمدت از `publish_release` (GitHub Release) استفاده کنید.

---

## ۲) امضا — کلیدِ ثابت، نه رمزِ ساختگی

دو حالت، و workflow خودش تشخیص می‌دهد:

| Secretها | نتیجه |
|---|---|
| `ANDROID_KEYSTORE_BASE64` + `ANDROID_KEYSTORE_PASSWORD` تنظیم شده | APK با کلیدِ **دائمی** امضا می‌شود (`release`) و قابلِ انتشار است |
| تنظیم نشده | یک keystore **موقت** با رمزِ تصادفی برای همان اجرا ساخته می‌شود؛ APK «آزمایشی» (`test`) است |

هیچ رمزِ ثابتی در ریپو نیست و هیچ keystore‌ای commit نمی‌شود (`*.keystore`، `*.jks`، `*.p12`
در `.gitignore`). رمزِ کلیدِ موقت فقط در متغیرهای محیطی همان Runner می‌ماند
(`openssl rand`).

کلیدِ دائمی:

```bash
keytool -genkeypair -v \
  -keystore planner-release.keystore -storetype PKCS12 \
  -alias planner -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Study Planner, O=mmr363637-afk, C=IR"

base64 -w0 planner-release.keystore | gh secret set ANDROID_KEYSTORE_BASE64
gh secret set ANDROID_KEYSTORE_PASSWORD    # رمزِ keystore
gh secret set ANDROID_KEY_ALIAS -b planner # پیش‌فرض: android
# gh secret set ANDROID_KEY_PASSWORD -b ...  # فقط اگر با رمزِ keystore فرق دارد
```

- کلید را جای امن (و ترجیحاً دو نسخهٔ پشتیبان) نگه دارید: **اگر گم شود، دیگر نمی‌توانید همان
  اپ را در فروشگاه به‌روزرسانی کنید** و کاربران باید اپ را حذف و دوباره نصب کنند.
- workflow قبل از ساخت، `keytool -list -alias` می‌زند تا مطمئن شود فایل و alias درست‌اند؛
  Secretِ ناقص (فقط یکی از دو مورد) با پیامِ روشن متوقف می‌شود.
- در push تگ، اگر امضای دائمی نباشد، Jobِ انتشار **عمداً شکست می‌خورد** تا APKِ موقت به‌اشتباه
  منتشر نشود؛ APKِ آزمایشی در Artifacts همان اجرا می‌ماند.

### محدودیتِ APKِ آزمایشی

- نصب روی گوشیِ خودتان: ✅ (فقط «نصب از منابعِ نامعلوم»).
- ارتقا روی نسخهٔ قبلی: ❌ — کلیدِ هر اجرا تازه است، پس اول اپ قبلی را حذف کنید.
- تأییدِ Digital Asset Links: ❌ — اثرِ انگشتِ هر اجرا عوض می‌شود (بخش ۳).
- انتشار در کافه‌بازار/مایکت/Play: ❌ (باید کلیدِ دائمی باشد).

---

## ۳) Digital Asset Links — چرا و کجا؟

TWA برای باز شدنِ **تمام‌صفحه و بدونِ نوار آدرس** باید ثابت کند اپِ اندرویدی همان صاحبِ دامنه
است. این اثبات با یک فایلِ JSON روی **ریشهٔ دامنه** انجام می‌شود:

```
https://mmr363637-afk.github.io/.well-known/assetlinks.json
```

⚠️ **دامِ GitHub Pages پروژه‌ای:** سایت زیر `/planner/` سرو می‌شود، ولی Chrome این فایل را
**فقط روی ریشهٔ دامنه** می‌خواند. مسیرِ `/planner/.well-known/assetlinks.json` پذیرفته
**نیست**. تا وقتی فایل منتشر نشود، APK باز می‌شود ولی داخلِ یک Custom Tab با نوار آدرس.

### راهِ الف) مخزنِ کاربری (`mmr363637-afk.github.io`) — بدونِ دامنهٔ جدید

1. مخزنِ `mmr363637-afk.github.io` را بسازید (اگر نیست) و Pages را روی `main` / ریشه فعال کنید.
2. فایلِ `.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "ir.mahdimr.planner",
    "sha256_cert_fingerprints": ["AA:BB:CC:…:اثرِ انگشتِ SHA-256"]
  }
}]
```

3. اثرِ انگشت را از Artifactِ ساخت (`apk-signing-fingerprint.txt` یا `build-info.txt`) یا از
   خودِ APK بردارید:

```bash
# از Android SDK:
$ANDROID_HOME/build-tools/36.1.0/apksigner verify --print-certs planner-1.21.0-release.apk | grep SHA-256
# یا از داخلِ Artifact:
cat apk-signing-fingerprint.txt
```

4. بررسیِ نهایی: `https://mmr363637-afk.github.io/.well-known/assetlinks.json` باید بدونِ
   ریدایرکت و با `Content-Type: application/json` باز شود. (ابزارِ گوگل:
   `https://developers.google.com/digital-asset-links/tools/generator`.)

### راهِ ب) دامنهٔ اختصاصی

فایل را روی ریشهٔ همان دامنه سرو کنید و پروژه را از manifest همان دامنه بسازید:

```bash
gh workflow run android-apk.yml -f manifest_url=https://planner.example.ir/manifest.webmanifest
```

این کار `host`/`startUrl`/`fullScopeUrl` و آیکون‌ها را از همان آدرس می‌خواند و `android/` را
(فقط داخلِ همان اجرا) بازسازی می‌کند. برای دائمی‌شدن، محلی اجرا و commit کنید:

```bash
NODE_PATH="$(npm root -g)" npm run android:generate -- --manifest https://planner.example.ir/manifest.webmanifest
npm run android:sync && npm test
```

### نکته‌های تأیید

- اثرِ انگشت باید مالِ **همان کلیدی** باشد که APK با آن امضا شده؛ کلیدِ موقتِ CI هر بار عوض می‌شود.
- اگر بعداً در Google Play منتشر کردید، اثرِ انگشتِ **Play App Signing** را هم به همان فایل اضافه
  کنید (فهرستِ `sha256_cert_fingerprints` چند مقدار می‌پذیرد).
- بعد از تغییرِ keystore، اپ را حذف/نصب کنید و Chrome را یک‌بار ببندید؛ نتیجه گاهی cache می‌شود.
- راهِ جایگزینِ بدونِ TWA برای «بدونِ نوار مرورگر»: همان **«افزودن به صفحه اصلی»** در Chrome
  (بخش ۱ README) که امروز کار می‌کند و به Asset Links نیاز ندارد.

---

## ۴) نسخه‌گذاری و به‌روزرسانی

```bash
# تغییرِ نسخه در package.json ...
npm run android:sync            # appVersion/appVersionName/appVersionCode + checksum
npm test                        # تستِ android-twa هم‌خوانی را تضمین می‌کند
```

- `versionCode` باید در هر انتشار **بزرگ‌تر** شود، وگرنه اندروید به‌روزرسانی را رد می‌کند.
  فرمولِ پروژه یکنواست: `major×10000 + minor×100 + patch` (۱٫۲۱٫۰ → ۱۲۱۰۰).
- اگر manifest/آیکون/میان‌برها عوض شده باشند: `npm run android:generate` (پیش‌فرض از سایتِ
  منتشرشده؛ `--source docs` برای ساختِ آفلاین از بیلدِ محلی).
- `packageId` را عوض نکنید مگر این‌که آگاهانه اپِ جدید بسازید: شناسه = هویتِ اپ در اندروید
  (تغییرِ آن یعنی از دست رفتنِ مسیرِ ارتقا و همهٔ نصب‌های قبلی).

---

## ۵) عیب‌یابیِ workflow

| نشانه | علت | راه‌حل |
|---|---|---|
| `manifest سایت در دسترس نیست` در پیش‌پرواز | Pages هنوز deploy نشده یا آدرس عوض شده | چند دقیقه صبر کنید؛ یا `-f manifest_url=...`؛ بررسیِ آفلاین: `npm run android:preflight -- --source docs` |
| `android/manifest-checksum.txt با twa-manifest.json یکی نیست` | `twa-manifest.json` دستی ویرایش شده | `npm run android:sync` |
| `فایلِ keystore پیدا نشد` | Secretها تنظیم نشده و اجرای محلی | Secretها را اضافه کنید یا برای تست محلی یک کلید بسازید |
| Jobِ انتشار قرمز است ولی Artifact هست | امضای دائمی نبوده | `ANDROID_KEYSTORE_BASE64` + `ANDROID_KEYSTORE_PASSWORD` را تنظیم کنید |
| نصبِ نسخهٔ جدید روی قبلی رد می‌شود | کلیدِ امضا فرق دارد (APKِ آزمایشی) | اپ قبلی را حذف کنید؛ برای ارتقا از APKِ `release` استفاده کنید |
| APK با نوار آدرس باز می‌شود | Asset Links منتشر نشده/اثرِ انگشت نمی‌خورد | بخش ۳ |
| خطای `build-tools` | نسخهٔ Bubblewrap عوض شده و مسیرِ build-tools ثابت است | نسخهٔ Bubblewrap را در workflow پین نگه دارید (`1.27.0` ↔ build-tools `36.1.0`) |

---

## ۶) ویجتِ صفحه‌ی خانگی — نقشه

PWA خالص هنوز Widget API ندارد؛ مسیرهای عملی:

1. **میان‌برهای لانچر (بدونِ کد):** منیفست `shortcuts` دارد (شروع مطالعه/مرورهای امروز/امتحانات)
   و همان‌ها به `shortcuts.xml` اندروید هم منتقل شده‌اند — با لمسِ طولانیِ آیکون دیده می‌شوند.
2. **ویجتِ بومیِ read-only روی TWA:** یک `AppWidgetProvider` کوچک (Kotlin/Java) که وضعیتِ
   «streak + کار بعدی + زمانِ تایمر» را نشان دهد و با tap همان PWA را روی `?page=home` باز کند.
   داده را می‌توان با `JavaScriptInterface`ِ کوچک داخلِ همان WebView از اپ گرفت (Sandboxِ
   WebView و اپ یکی است، ولی `localStorage` از بیرونِ آن قابلِ خواندن نیست).
3. **مسیرِ کامل‌تر:** یک فایلِ وضعیتِ کوچک در Supabase (فقط برای کسانی که سینکِ ابری را وصل
   کرده‌اند) + خواندن با WorkManager؛ حالتِ آفلاین همان مسیر ۲.

ترتیبِ پیشنهادی: انتشارِ APK (همین حالا آماده است) → Asset Links → ویجتِ read-only → تعامل
(تایمرِ کنترلی) که پیچیدگیِ بیشتری دارد و برای نسخهٔ اول لازم نیست.

---

سوال/گپ: [@Mahdimr3](https://t.me/Mahdimr3)
