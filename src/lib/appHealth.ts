// ===== سلامت اپ: بازیابی خودکار از شکستِ لود چانک و نسخه‌ی زامبی =====
// سناریوی واقعی که این فایل حلش می‌کند:
//   بعد از هر دیپلوی، تبِ بازِ کاربر هنوز جاوااسکریپت نسخه‌ی قدیمی را اجرا می‌کند.
//   سرویس‌ورکر تازه فعال می‌شود و کش قدیمی را پاک می‌کند. تا وقتی کاربر صفحه را
//   رفرش نکند، اولین کلیک روی بخش lazy (مثلاً «ساخت خودکار فلش‌کارت») دنبال چانکی
//   قدیمی می‌گردد که دیگر نه روی سرور هست نه در کش → «Failed to fetch dynamically
//   imported module» → ErrorBoundary تب می‌شکند و کاربر فکر می‌کند «آپدیت خراب کرده».
// راه‌حل:
//   ۱) به‌محض تعویض سرویس‌ورکر (controllerchange) صفحه یک‌بار خودکار رفرش می‌شود
//      تا کد و کش همیشه هم‌نسخه بمانند.
//   ۲) اگر با این حال لود چانکی شکست خورد، یک‌بار خودکار رفرش می‌کنیم؛ اگر باز هم
//      ناموفق بود، ErrorBoundary پیام «با یک رفرش درست می‌شود» نشان می‌دهد.
//   guard با sessionStorage: در یک نشست حداکثر یک رفرش خودکار برای هر علت — بدون حلقه.

const GUARD_KEY = "sp_autoreload_guard_v1";
/** حداقل فاصله‌ی زمانی بین دو رفرش خودکار (حلقه‌شکن) */
const GUARD_TTL_MS = 60_000;

let installed = false;

/** آیا پیام خطا از جنس «شکست در لود چانک lazy» است؟ (کروم/سافاری/فایرفاکس/ویت) */
export function isChunkLoadError(message: string | null | undefined): boolean {
  if (!message) return false;
  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) || // سافاری
    /Load failed/i.test(message) // سافاری — fetch ماژول
  );
}

/**
 * رفرش محافظت‌شده: در بازه‌ی GUARD_TTL_MS فقط یک‌بار انجام می‌شود.
 * برمی‌گرداند آیا رفرش می‌کند یا نه (برای تست/لاگ).
 */
export function guardedReload(reason: string, now: number = Date.now()): boolean {
  try {
    const raw = sessionStorage.getItem(GUARD_KEY);
    if (raw) {
      const prev = JSON.parse(raw) as { at?: number };
      if (typeof prev.at === "number" && now - prev.at < GUARD_TTL_MS) return false;
    }
    sessionStorage.setItem(GUARD_KEY, JSON.stringify({ at: now, reason }));
  } catch {
    /* حافظه در دسترس نیست؛ رفرش کردن بی‌خطر است */
  }
  try {
    console.info(`[app-health] auto reload (${reason})`);
  } catch {
    /* ignore */
  }
  window.location.reload();
  return true;
}

/**
 * نصب شنونده‌های بازیابی — یک‌بار، قبل از بوت React (در main.tsx).
 * بدون سرویس‌ورکر/در محیط تست بی‌اثر و امن است.
 */
export function installAppHealthGuards(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  // ۱) تعویض سرویس‌ورکر → نسخه‌ی جدید کنترل صفحه را گرفت → کد قدیمی زامبی است؛ رفرش کن.
  //    (مسیر اعمالِ به‌روزرسانی با بنر «نسخه جدید آماده است» هم خودش رفرش می‌کند؛ guard مانع دوباره‌کاری است.)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      guardedReload("controllerchange");
    });
  }

  // ۲) شکست لود چانک lazy (رویداد مخصوص Vite + خطاهای خام مرورگر)
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault(); // خطا را به ErrorBoundary نسپار
    guardedReload("vite-preload-error");
  });
  window.addEventListener("error", (event) => {
    if (isChunkLoadError(event.message)) {
      event.preventDefault();
      guardedReload("chunk-error");
    }
  });
  window.addEventListener("unhandledrejection", (event) => {
    const msg = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "");
    if (isChunkLoadError(msg)) {
      event.preventDefault();
      guardedReload("chunk-rejection");
    }
  });
}

/** فقط برای تست: ریست نصب */
export function __resetAppHealthForTest(): void {
  installed = false;
}
