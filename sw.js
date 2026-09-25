// v11: planner 1.9 — Web Push (اعلان واقعی وقتی اپ بسته است) + همان استراتژی v10.
// v10: planner 1.8 — decision tools, source notebook and safe storage.
// Offline-first service worker scoped to the app's deployed path (for example /planner/).
// v9: «آپدیتِ امن» — ریشه‌ی باگِ «بعد از آپدیت همه‌چیز شکست».
//  - قبلاً بلافاصله هنگام activate همه‌ی کش‌های قدیمی پاک می‌شد؛ درحالی‌که تبِ بازِ
//    کاربر هنوز JS قدیمی را اجرا می‌کرد و با اولین کلیکِ lazy دنبال چانکِ پاک‌شده
//    می‌گشت → کرشِ بخش‌ها. حالا اول claim می‌کنیم (اپ با شنیدن controllerchange خودش
//    را رفرش می‌کند — lib/appHealth) و پاک‌سازی کش قدیمی با تأخیر انجام می‌شود.
// v8: ناوبری «کش-اول + به‌روزرسانی در پس‌زمینه» (باز شدن آنی روی گوشی) و بیلد چانک‌دار.
const CACHE = "study-planner-v11";
const BASE = self.registration.scope;
const appUrl = (path = "") => new URL(path, BASE).href;
const CORE = [
  appUrl(),
  appUrl("index.html"),
  appUrl("manifest.webmanifest"),
  appUrl("icon.svg"),
  // فونت خود-میزبان: با اولین نصب کش می‌شود تا آفلاین هم وزیرمتن داشته باشیم
  appUrl("fonts/Vazirmatn-Regular.woff2"),
  appUrl("fonts/Vazirmatn-Medium.woff2"),
  appUrl("fonts/Vazirmatn-Bold.woff2"),
  appUrl("fonts/Vazirmatn-ExtraBold.woff2"),
  appUrl("fonts/Vazirmatn-Black.woff2"),
];

// پیام از اپ: فعال‌سازی بی‌درنگِ نسخه‌ی تازه (بعد از تپ روی بنر «به‌روزرسانی»)
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).catch(() => {}));
  // عمداً skipWaiting نمی‌کنیم؛ کاربر با بنر داخل اپ، خودش نسخه‌ی تازه را فعال می‌کند
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // اول کنترل تب‌ها را بگیر؛ اپ با رویداد controllerchange خودش را یک‌بار رفرش می‌کند
      // و به نسخه‌ی جدید می‌نشیند — بعد از آن پاک‌سازی کش قدیمی بی‌خطر است.
      await self.clients.claim();
      // مهلتِ رفرشِ تب‌های زامبی (SW با waitUntil زنده می‌ماند). اگر تب قدیمی هنوز باز بود،
      // ناوبری بعدی‌اش index تازه می‌گیرد و چانک‌های جدید در کشِ تازه ذخیره می‌شوند.
      await new Promise((resolve) => setTimeout(resolve, 15000));
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    })(),
  );
});

// آخرین باری که دنبال نسخه‌ی تازه‌ی خودِ سرویس‌ورکر گشتیم (درون حافظه — نه persistent)
let lastUpdateCheck = 0;

/** در پس‌زمینه چک کن آیا sw.js تازه‌ای روی سرور هست (حداکثر هر ۵ دقیقه) */
function maybeCheckForSwUpdate() {
  const now = Date.now();
  if (now - lastUpdateCheck < 5 * 60 * 1000) return;
  lastUpdateCheck = now;
  try {
    const p = self.registration.update();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {
    /* ignore */
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  // صفحهٔ اپ (navigation): اگر کش داریم بی‌درنگ همان؛ تازه‌سازی در پس‌زمینه.
  // این یعنی باز شدنِ آنی روی گوشی، حتی با اینترنت ضعیف.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(appUrl("index.html"));
        const networkUpdate = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const copy = response.clone();
              cache.put(appUrl("index.html"), copy).catch(() => {});
              cache.put(request, response.clone()).catch(() => {});
            }
            return response;
          })
          .catch(() => null);
        if (cached) {
          // پس‌زمینه: صفحه را تازه کن + ببین نسخه‌ی تازه‌ای از خودِ SW هست یا نه
          event.waitUntil(
            (async () => {
              await networkUpdate;
              maybeCheckForSwUpdate();
            })(),
          );
          return cached;
        }
        // اولین بازدید (بدون کش): منتظر شبکه بمان
        const fresh = await networkUpdate;
        if (fresh) return fresh;
        return new Response("آفلاین هستی و هنوز این برنامه یک‌بار هم باز نشده. یک‌بار با اینترنت بازش کن.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      })(),
    );
    return;
  }

  // فقط همان origin کش می‌شود؛ بقیه مستقیم از شبکه
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // فایل‌ها (چانک‌های JS/CSS هش‌دار، فونت، آیکون، manifest):
  // کش-اول برای سرعت + تازه‌سازی در پس‌زمینه برای تازگی.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      const networkUpdate = fetch(request)
        .then((response) => {
          if (response && response.status === 200) cache.put(request, response.clone()).catch(() => {});
          return response;
        })
        .catch(() => null);
      if (cached) {
        event.waitUntil(networkUpdate);
        return cached;
      }
      const fresh = await networkUpdate;
      return fresh || Response.error();
    })(),
  );
});

// ===== 📲 Web Push — اعلان واقعی وقتی اپ بسته است =====
// اختیاری است: اگر کاربر پوش را فعال نکرده باشد، هیچ پیامی نمی‌رسد و اعلان‌های
// داخل اپ (Notification API) مثل قبل کار می‌کنند. payload قراردادیِ Edge Function:
// { title, body, tag, url? } — url یعنی بعد از تپ کجای اپ باز شود (مثلاً ?page=reviews).
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "برنامه‌ریز مطالعه", body: event.data.text() };
  }
  const title = payload.title || "برنامه‌ریز مطالعه";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      tag: payload.tag || "planner-push",
      icon: appUrl("icon-192.png"),
      badge: appUrl("icon.svg"),
      dir: "rtl",
      lang: "fa",
      data: { url: payload.url || "" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = appUrl(event.notification.data && event.notification.data.url ? event.notification.data.url : "");
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if ("focus" in client) {
          try {
            await client.navigate(target);
            return client.focus();
          } catch {
            return client.focus();
          }
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});
