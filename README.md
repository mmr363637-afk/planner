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
npm run build      # خروجی در dist/
npm run preview    # سرو خروجی ساخته‌شده
```

## نصب روی اندروید

1. `dist/` را روی هر هاست HTTPS قرار دهید (یا `npm run preview` روی شبکه محلی).
2. در Chrome اندروید آدرس را باز کنید → منو → **«افزودن به صفحه اصلی» / Install app**.
3. اپ به‌صورت standalone (بدون نوار مرورگر) و آفلاین اجرا می‌شود؛ داده‌ها روی دستگاه ذخیره می‌شوند.

> برای تولید APK از همین کد می‌توان از **Bubblewrap / Trusted Web Activity** یا **Capacitor** استفاده کرد (نیازمند JDK + Android SDK).

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
