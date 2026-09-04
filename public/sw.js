// Offline-first service worker scoped to the app's deployed path (for example /planner/).
const CACHE = "study-planner-v2";
const BASE = self.registration.scope;
const appUrl = (path = "") => new URL(path, BASE).href;
const CORE = [appUrl(), appUrl("index.html"), appUrl("manifest.webmanifest"), appUrl("icon.svg")];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).catch(() => {}));
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
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

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

        .catch(() => cached || caches.match(url("./index.html")));
      return cached || network;
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" })
      .then((clients) => (clients[0] ? clients[0].focus() : self.clients.openWindow(appUrl()))),
    self.clients.matchAll({ type: "window" }).then((list) => (list[0] ? list[0].focus() : self.clients.openWindow(SCOPE))),
  );
});
