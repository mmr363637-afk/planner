// Minimal offline-first service worker.
//
// All cached URLs are resolved relative to this script's own location, so the app keeps
// working when it is hosted on a sub-path (e.g. https://user.github.io/repo/) as well as
// on a domain root. Never use root-absolute ("/...") paths here.
const CACHE = "study-planner-v2";
const SCOPE = new URL("./", self.location).href; // e.g. https://user.github.io/repo/
const url = (p) => new URL(p, SCOPE).href;

const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./icon-512.png"].map(url);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(CORE))
      .catch(() => {
        /* a missing asset must not break install */
      }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && (req.url.startsWith(self.location.origin) || req.url.includes("jsdelivr"))) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached || caches.match(url("./index.html")));
      return cached || network;
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((list) => (list[0] ? list[0].focus() : self.clients.openWindow(SCOPE))),
  );
});
