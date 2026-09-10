// Offline-first service worker scoped to the app's deployed path (for example /planner/).
// v5: درخواست‌های ناوبری «شبکه‌اول» می‌شوند تا کاربر بلافاصله آخرین build را ببیند؛
// کش فقط به‌عنوان fallback وقتی استفاده می‌شود که دستگاه آفلاین است. (قبلاً کش اولویت
// داشت، بنابراین حتی بعد از انتشار نسخهٔ جدید، همان HTML قدیمی سرو می‌شد و فیچرهای
// تازه برای کاربرانی که اپ را نصب کرده بودند هرگز ظاهر نمی‌شد.)
// v6: موج قابلیت‌های جدید (بکاپ خودکار، آمادگی امتحان، ساعت‌های طلایی، ثبت تست، لینک
// منابع، مرور ترکیبی، اشتراک‌گذاری، کارت PNG، جدول زمانی هفتگی، ETA، Replan هوشمند،
// آسمان واقعی، تایم‌لپس باغ، درخت مهارت، اتاق مطالعه‌ی P2P، Wrapped) — کش باید تازه شود.
const CACHE = "study-planner-v6";
const BASE = self.registration.scope;
const appUrl = (path = "") => new URL(path, BASE).href;
const CORE = [appUrl(), appUrl("index.html"), appUrl("manifest.webmanifest"), appUrl("icon.svg")];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  // صفحهٔ اپ (navigation): اول شبکه، بعد کش — تا build تازه همان بارِ بعد دیده شود.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response && response.status === 200) {
            const cache = await caches.open(CACHE);
            await Promise.all([
              cache.put(request, response.clone()).catch(() => {}),
              cache.put(appUrl("index.html"), response.clone()).catch(() => {}),
            ]);
          }
          return response;
        } catch {
          return (await caches.match(request)) || (await caches.match(appUrl("index.html"))) || Response.error();
        }
      })(),
    );
    return;
  }

  // بقیهٔ فایل‌ها (فونت، آیکون، manifest): کش‌اول، بعد شبکه.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response?.status === 200 && (request.url.startsWith(self.location.origin) || request.url.includes("jsdelivr"))) {
            caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => cached || caches.match(appUrl("index.html")));

      return cached || network;
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" })
      .then((clients) => (clients[0] ? clients[0].focus() : self.clients.openWindow(appUrl()))),
  );
});
