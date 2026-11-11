/// <reference types="vitest/config" />
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// نسخه‌ی نمایشی اپ از package.json می‌آید (تک‌منبع؛ در تنظیمات و «چی جدیده؟» دیده می‌شود)
const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, "package.json"), "utf8"),
) as { version?: string };
const APP_VERSION: string = pkg.version ?? "0.0.0";

/** Emit a compact list of app-code chunks so the service worker can cache lazy routes. */
function offlineUiPrecachePlugin(): Plugin {
  const maxAssetBytes = 1_500_000;
  return {
    name: "offline-ui-precache-manifest",
    apply: "build",
    generateBundle(_options, bundle) {
      const assets = Object.values(bundle)
        .filter((item) => {
          if (item.type === "chunk") return item.fileName.endsWith(".js") && Buffer.byteLength(item.code ?? "") <= maxAssetBytes;
          if (item.type === "asset" && item.fileName.endsWith(".css")) {
            const size = typeof item.source === "string" ? Buffer.byteLength(item.source) : item.source?.byteLength ?? 0;
            return size <= maxAssetBytes;
          }
          return false;
        })
        .map((item) => `./${item.fileName}`)
        .sort();
      this.emitFile({
        type: "asset",
        fileName: "precache-manifest.json",
        source: JSON.stringify({ version: APP_VERSION, assets }, null, 2),
      });
    },
  };
}

// Tesseract requests language names itself. Keep model filenames stable within
// their versioned directory, while all executable assets remain content-hashed.
const assetFileNames = (asset: { names: string[] }) =>
  asset.names.some((n) => n.endsWith(".traineddata.gz"))
    ? "assets/ocr-models-1.0.0/[name][extname]"
    : "assets/[name]-[hash][extname]";

// https://vite.dev/config/
export default defineConfig({
  // The app is deployed to a sub-path (GitHub Pages: https://<user>.github.io/<repo>/),
  // so every emitted URL must be relative.
  base: "./",
  optimizeDeps: { include: ["tesseract.js"] },
  plugins: [
    react(),
    tailwindcss(),
    offlineUiPrecachePlugin(),
    {
      // 🎬 پیش‌نمایشِ دمو: اگر متغیرِ `DEMO_OPEN` ست شده باشد، باز شدنِ ریشهٔ اپ
      // کاربر را مستقیم سرِ همان پنجره می‌برد (مثلاً شبیه‌ساز آزمون). این فقط برای
      // اجرای محلی/پیش‌نمایش است و در build هیچ اثری ندارد (apply: "serve").
      name: "demo-deep-link",
      apply: "serve",
      configureServer(server) {
        const target = (process.env.DEMO_OPEN ?? "").trim();
        if (!target) return;
        // دادهٔ نمونهٔ دمو از بیرونِ ریپو سرو می‌شود (هرگز در build/docs نمی‌رود)
        const demoState = (process.env.DEMO_STATE ?? "/tmp/demo-state.json").trim();
        server.middlewares.use((req, res, next) => {
          if ((req.url ?? "").split("?")[0] === "/__demo-state.json") {
            try {
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(readFileSync(demoState));
            } catch {
              res.statusCode = 404;
              res.end("{}");
            }
            return;
          }
          const url = req.url ?? "/";
          // فقط ریشه؛ فایل‌ها، HMR و APIها دست‌نخورده می‌مانند — و اگر پارامترِ
          // مقصد از قبل هست، دیگر ریدایرکت نمی‌کنیم (وگرنه حلقهٔ بی‌پایان می‌شود).
          if (!/^\/(\?.*)?$/.test(url)) return next();
          if (/[?&](open|demo)=/.test(url)) return next();
          res.statusCode = 302;
          res.setHeader("Location", `./?demo=1&open=${encodeURIComponent(target)}`);
          res.end();
        });
      },
    },
    {
      name: "local-ocr-models",
      configureServer(server) {
        // In development ?url assets live in separate node_modules directories;
        // Tesseract needs a single folder with both language filenames.
        server.middlewares.use((req, res, next) => {
          const match = req.url?.match(
            /^\/__ocr-models\/(fas|eng)\.traineddata\.gz(?:\?.*)?$/,
          );
          if (!match) return next();
          try {
            res.setHeader("Content-Type", "application/gzip");
            res.end(
              readFileSync(
                path.resolve(
                  __dirname,
                  `node_modules/@tesseract.js-data/${match[1]}/4.0.0_best_int/${match[1]}.traineddata.gz`,
                ),
              ),
            );
          } catch {
            res.statusCode = 503;
            res.end("OCR model unavailable");
          }
        });
      },
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  worker: { rollupOptions: { output: { assetFileNames } } },
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
        assetFileNames,
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
  // مهلتِ آزمون‌ها: اپ صفحه‌ها را با React.lazy بارگذاری می‌کند و بعضی آزمون‌ها
  // (نگهبانِ بانکِ ۱۷٬۹۳۶ سؤالی، درسنامه‌ها، آزمونِ سرتاسری بانک) روی ماشینِ شلوغ
  // از مهلتِ پیش‌فرضِ ۵ ثانیه رد می‌شدند و بی‌آنکه خطایی در کار باشد قرمز می‌شدند.
  test: {
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  server: {
    // Allow the Arena live-preview proxy host (and any other) to reach the dev server.
    host: true,
    allowedHosts: true,
    // لینکِ عمیق در خودِ پیش‌نمایش: درخواست‌های /* به index.html سرو می‌شوند تا
    // آدرس‌هایی مثل `/simulator` (بعد از ریدایرکتِ کوتاه) اپ را با همان مسیر باز کنند.
    proxy: {},
  },
});
