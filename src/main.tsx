import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register inside the current app path. An absolute `/sw.js` points outside
// this repository when the app is hosted at GitHub Pages' `/planner/` path.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    const serviceWorkerUrl = new URL("sw.js", document.baseURI);
    navigator.serviceWorker.register(serviceWorkerUrl.href).catch(() => {
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
