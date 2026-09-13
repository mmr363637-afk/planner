import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { applyAccentColor } from "./lib/accent";

// قبل از اولین رندر، رنگ اصلی ذخیره‌شده را اعمال کن تا هنگام بازکردن اپ پرش رنگی نداشته باشیم.
// عمداً با regex (نه JSON.parse کامل) تا روی دیتای حجیم، بوت کند نشود.
try {
  const raw = localStorage.getItem("study-planner-v1");
  const m = raw?.match(/"accentColor"\s*:\s*"([^"]+)"/);
  if (m?.[1]) applyAccentColor(m[1]);
} catch {
  /* دسترسی به localStorage ممکن نیست؛ رنگ پیش‌فرض می‌ماند */
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// اسپلش بوت (#boot-splash) را React با mount خودش کنار می‌زند؛ این فقط کمربند ایمنی است:
// فقط وقتی پاکش می‌کنیم که اپ واقعاً رندر شده باشد تا هیچ‌وقت صفحه‌ی سفید نبینیم.
requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    const root = document.getElementById("root");
    const splash = document.getElementById("boot-splash");
    if (splash && root && root.childElementCount > 1) splash.remove();
  }),
);

// Offline-first: register the service worker (best-effort; ignored when unavailable).
// The URL is resolved against the document, never root-absolute, so it also works when the
// app is served from a sub-path such as https://user.github.io/repo/.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    const swUrl = new URL("sw.js", document.baseURI).href;
    navigator.serviceWorker.register(swUrl).catch(() => {
      /* offline caching unavailable in this environment */
    });
  });
}
