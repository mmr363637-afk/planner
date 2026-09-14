/// <reference types="vitest/config" />
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// نسخه‌ی نمایشی اپ از package.json می‌آید (تک‌منبع؛ در تنظیمات و «چی جدیده؟» دیده می‌شود)
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8")) as { version?: string };
const APP_VERSION: string = pkg.version ?? "0.0.0";

// https://vite.dev/config/
export default defineConfig({
  // The app is deployed to a sub-path (GitHub Pages: https://<user>.github.io/<repo>/),
  // so every emitted URL must be relative.
  base: "./",
  // تست‌های واحد فقط در src — جریان‌های Playwright (e2e/*.spec.ts) توسط vitest اجرا نشوند
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  build: {
    // Keep the deployable build in docs/ because this repository uses GitHub Pages'
    // branch publishing mode (no Actions workflow permission required). public/ is
    // copied over as-is, which is also where .nojekyll comes from.
    //
    // NOTE (perf): the build is intentionally multi-chunk, NOT single-file. A 2MB+
    // inlined index.html parses slowly on phones and re-downloads on every deploy;
    // hashed chunks are cached by the service worker and only changed chunks
    // re-download. Lazy routes (React.lazy) keep the first paint small.
    outDir: "docs",
    emptyOutDir: true,
    assetsInlineLimit: 4096,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    // Allow the Arena live-preview proxy host (and any other) to reach the dev server.
    host: true,
    allowedHosts: true,
  },
});
