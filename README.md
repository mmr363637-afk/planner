# برنامه‌ریز مطالعه (Study Planner)

اپلیکیشن شخصی برنامه‌ریزی و مطالعه برای دانشجویان (به‌ویژه پزشکی) — **کاملاً فارسی، RTL، Offline-first و قابل نصب روی اندروید به‌صورت PWA**.

## قابلیت‌ها

| بخش | امکانات |
|---|---|
| خانه | سلام + تاریخ شمسی، پیشرفت امروز (Ring + Progress)، کارهای امروز (شروع/تکمیل/جابه‌جایی/حذف)، مرورهای امروز، Streak/XP/مجموع مطالعه/تحقق هفتگی، بنر «عقب افتاده‌ای؛ Replan؟» |
| برنامه › دروس | درس با رنگ و اولویت؛ مبحث با توضیح، حجم، زمان تخمینی، اولویت، سختی، وضعیت یادگیری |
| برنامه › برنامه‌ها | Wizard چهارمرحله‌ای (هدف/بازه/ساعت روزانه → دروس و مباحث → روزهای هفته → پیش‌نمایش) + **Planning Engine** با فشرده‌سازی نسبی و تقسیم مباحث بلند بین روزها + Replan |
| برنامه › تقویم | نمای روز/هفته/ماه شمسی، نشانگر تسک و مرور هر روز، افزودن دستی مبحث به روز |
| مطالعه | تایمر آزاد و پومودورو (قابل تنظیم)، ادامه‌ی صحیح تایمر هنگام جابه‌جایی بین صفحات/بستن اپ (مبتنی بر timestamp)، ارزیابی یادگیری در پایان، ثبت زمان واقعی |
| مرورها | Spaced Repetition (۱/۳/۷/۱۴/۳۰ روز، قابل تنظیم) با تطبیق فاصله بر اساس عملکرد؛ بخش‌های عقب‌افتاده/امروز/آینده؛ انجام/عقب‌انداختن/«بلد نیستم» |
| آمار | امروز/هفته/ماه، تعداد جلسات، مباحث تکمیل‌شده، تحقق برنامه، Streak، نمودار ۷ روز اخیر، نمودار بر اساس درس، دستاوردها |
| گیمیفیکیشن | XP، سطح (نوآموز → استاد)، ۱۱ دستاورد |
| تنظیمات | تم روشن/تیره/سیستم، پومودورو، فاصله‌ی مرورها، اعلان‌ها (۵ نوع)، ساعت شروع/پایان روز، Backup/Restore (JSON)، حذف همه‌ی داده‌ها |

## اجرا

```bash
npm install
npm run dev        # توسعه
npm test           # تست‌ها (Planning Engine, SRS, Streak, Progress, Study time, Jalali, E2E smoke)
npm run build      # خروجی در docs/ (همان پوشه‌ای که GitHub Pages منتشر می‌کند)
npm run preview    # سرو خروجی ساخته‌شده
```

## نصب روی اندروید

1. `docs/` را روی هر هاست HTTPS قرار دهید (یا `npm run preview` روی شبکه محلی).
2. در Chrome اندروید آدرس را باز کنید → منو → **«افزودن به صفحه اصلی» / Install app**.
3. اپ به‌صورت standalone (بدون نوار مرورگر) و آفلاین اجرا می‌شود؛ داده‌ها روی دستگاه ذخیره می‌شوند.

> برای تولید APK از همین کد می‌توان از **Bubblewrap / Trusted Web Activity** یا **Capacitor** استفاده کرد (نیازمند JDK + Android SDK).

## استقرار روی GitHub Pages

این پروژه یک اپ Vite است و **کد مبدأ مستقیماً در مرورگر اجرا نمی‌شود**؛ GitHub Pages فقط فایل
استاتیک سرو می‌کند، پس حتماً باید خروجی `npm run build` (پوشه‌ی `docs/`) منتشر شود. در غیر این
صورت صفحه سفید می‌ماند، چون `index.html` ریشه به `/src/main.tsx` (فایل TypeScript) اشاره می‌کند.

`vite.config.ts` خروجی build را در `docs/` می‌سازد و این پوشه **همراه ریپو commit می‌شود**؛ Pages
با حالت «Deploy from a branch» (شاخه‌ی `main`، پوشه‌ی `/docs`) همان را سرو می‌کند. بنابراین بعد از
هر تغییر در `src/`، این دو کار لازم است:

```bash
npm test && npm run build   # docs/ را از نو می‌سازد
git add docs && git commit  # خروجی جدید باید commit شود
```

(اختیاری) اگر ترجیح می‌دهید خروجی را commit نکنید، می‌توانید استقرار را به GitHub Actions بسپارید:
هر push روی `main` → نصب وابستگی‌ها → اجرای تست‌ها → `npm run build` → انتشار `docs/` روی Pages.

یک‌بار (تنظیم اولیه برای حالت Actions):

1. فایل `deploy-workflow.yml` (در ریشه‌ی ریپو) را به مسیر `.github/workflows/deploy.yml` منتقل کنید
   (در GitHub: **Add file → Create new file**، مسیر را `.github/workflows/deploy.yml` بگذارید و
   محتوای همان فایل را paste کنید). این فایل در ریشه نگه داشته شده چون توکن دسترسی این محیط اجازه‌ی
   ساخت فایل workflow را ندارد.
   > ⚠️ مسیر دقیقاً باید `.github/workflows/` باشد. پوشه‌ی `workflows/` در ریشه‌ی ریپو **هیچ اثری
   > ندارد** و GitHub آن را اجرا نمی‌کند.
2. در ریپو: **Settings → Pages → Build and deployment → Source** را روی **GitHub Actions** بگذارید.
   (اگر از workflow استفاده نمی‌کنید، همان «Deploy from a branch» کافی است — فقط شاخه `main` و
   پوشه `/docs` انتخاب شده باشد، نه `/root`؛ انتخاب root همان علت صفحه‌ی سفید بود.)
3. بعد از merge، تب **Actions** را چک کنید؛ پس از سبز شدن workflow، سایت روی
   `https://<user>.github.io/<repo>/` بالا می‌آید.

نکته‌ی زیرمسیر: چون سایت زیر `/<repo>/` سرو می‌شود، هیچ مسیر مطلقی (`/sw.js`, `/manifest.webmanifest`, …)
نباید نوشته شود. `vite-plugin-singlefile` مقدار `base` را روی `./` قفل می‌کند و همه‌ی JS/CSS را داخل
`index.html` درون‌خطی می‌کند؛ بقیه‌ی آدرس‌ها (manifest، آیکون‌ها، ثبت service worker) هم نسبی شده‌اند.

برای تست محلی: `npm run build && npm run preview`.

## معماری

```
src/
  types.ts            # مدل داده (Subject, Topic, StudyPlan, StudyTask, StudySession, Review, Achievement, UserSettings)
  store.tsx           # State + Persistence (localStorage) + Use-caseها (معادل Repository/ViewModel)
  nav.tsx             # ناوبری
  lib/
    jalali.ts         # تقویم شمسی، اعداد فارسی، توابع تاریخ
    planner.ts        # Planning Engine + Replan
    srs.ts            # Spaced Repetition (interface قابل توسعه ReviewScheduler)
    stats.ts          # Streak، Progress، Study time
    gamification.ts   # XP، سطح، دستاوردها
    notify.ts         # Notification/صدا/لرزش
  components/         # UI قابل استفاده مجدد (Card, Button, Modal, ProgressBar, Segmented, TaskRow, JalaliDatePicker, ...)
  pages/              # Home, Plan(Calendar/Plans/Subjects), Study, Reviews, Stats, Settings
public/               # manifest.webmanifest, sw.js, icons
```
