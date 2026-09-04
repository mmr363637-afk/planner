import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { applyAccentColor } from "./lib/accent";

// قبل از اولین رندر، رنگ اصلی ذخیره‌شده را اعمال کن تا هنگام بازکردن اپ پرش رنگی نداشته باشیم
try {
  const raw = localStorage.getItem("study-planner-v1");
  if (raw) {
    const saved = JSON.parse(raw) as { settings?: { accentColor?: unknown } };
    if (typeof saved?.settings?.accentColor === "string") applyAccentColor(saved.settings.accentColor);
  }
} catch {
  /* دسترسی به localStorage ممکن نیست؛ رنگ پیش‌فرض می‌ماند */
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
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
