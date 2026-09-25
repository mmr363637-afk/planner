// ===== 📲 اعلان واقعی (Web Push) — اختیاری و تکمیلی =====
// تا امروز اعلان‌ها فقط وقتی اپ باز بود کار می‌کردند (Notification API). این ماژول
// «پوش واقعی» را اضافه می‌کند: حتی وقتی اپ بسته است، سرویس‌ورکر اعلان را نشان می‌دهد
// (یادآور صبحگاهی، روز امتحان، مرورهای سررسید).
//
// اصول طراحی (مثل بقیه‌ی اپ):
//  - کاملاً اختیاری: بدون کلید VAPID یا بدون سرویس‌گیرنده، فیچر خاموش است و
//    اعلان‌های داخل اپ دقیقاً مثل قبل کار می‌کنند (مسیر آفلاین دست‌نخورده می‌ماند).
//  - بدون سرورِ ما: subscription مستقیم به پروژه‌ی Supabase خودِ اپ می‌رود
//    (Edge Function `push-subscribe`؛ کدش در supabase/functions هست).
//  - کلید VAPID «عمومی» است (public key) و ذخیره‌اش در تنظیمات بی‌خطر است.

export type PushSupport = "unsupported" | "no-sw" | "ready";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window)) return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "no-sw";
  return "ready";
}

/** تبدیل کلید VAPID (base64url) به Uint8Array برای applicationServerKey */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (c) => c.charCodeAt(0));
}

export interface PushSubscribeResult {
  ok: boolean;
  error?: string;
}

function friendly(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/permission/i.test(msg)) return "اجازه‌ی اعلان داده نشد؛ از تنظیمات مرورگر اجازه بده و دوباره تلاش کن.";
  if (/fetch|network|Failed to fetch/i.test(msg)) return "به سرور پوش نرسیدیم — اینترنت یا در دسترس بودن Edge Function را بررسی کن.";
  if (/vapid|key/i.test(msg)) return "کلید VAPID معتبر نیست.";
  return msg || "خطای ناشناخته در ثبت پوش.";
}

/**
 * ثبت subscription و ارسالش به Edge Function پروژه‌ی Supabase.
 * endpoint = آدرس پروژه (همان https://xxx.supabase.co). بدون endpoint یا vapidKey
 * کاری انجام نمی‌دهد (فیچر عمداً خاموش می‌ماند).
 */
export async function subscribePush(opts: {
  vapidKey: string;
  supabaseUrl: string;
  anonKey: string;
}): Promise<PushSubscribeResult> {
  const support = pushSupport();
  if (support !== "ready") {
    return { ok: false, error: support === "unsupported" ? "این مرورگر از اعلان واقعی پشتیبانی نمی‌کند." : "سرویس‌ورکر اپ فعال نیست؛ یک بار اپ را آنلاین باز کن." };
  }
  if (!opts.vapidKey.trim() || !opts.supabaseUrl.trim()) {
    return { ok: false, error: "کلید VAPID یا آدرس سرور وارد نشده — پوش بدون راه‌اندازی سازنده فعال نمی‌شود." };
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return { ok: false, error: "اجازه‌ی اعلان لازم است." };
    const reg = await navigator.serviceWorker.ready;
    // subscription فعلی را عوض نکن؛ اگر هست همان را بفرست
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(opts.vapidKey.trim()).buffer as ArrayBuffer,
      });
    }
    const fn = `${opts.supabaseUrl.replace(/\/$/, "")}/functions/v1/push-subscribe`;
    const res = await fetch(fn, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.anonKey}`, apikey: opts.anonKey },
      body: JSON.stringify(sub),
    });
    if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

/** لغو ثبت پوش (حذف سرور + لغو محلی) — اعلان‌های داخل اپ دست‌نخورده می‌مانند */
export async function unsubscribePush(opts: { supabaseUrl: string; anonKey: string }): Promise<PushSubscribeResult> {
  if (pushSupport() !== "ready") return { ok: true };
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const raw = sub.toJSON();
      const fn = `${opts.supabaseUrl.replace(/\/$/, "")}/functions/v1/push-unsubscribe`;
      await fetch(fn, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.anonKey}`, apikey: opts.anonKey },
        body: JSON.stringify({ endpoint: raw.endpoint }),
      }).catch(() => undefined); // خطای شبکه در لغو — محلی پاک می‌کنیم
      await sub.unsubscribe();
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}
