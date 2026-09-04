import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  // The app is deployed to a sub-path (GitHub Pages: https://<user>.github.io/<repo>/),
  // so every emitted URL must be relative. `vite-plugin-singlefile` also pins base to "./"
  // (it inlines all JS/CSS into index.html); declaring it here keeps that guarantee
  // explicit and survives removing the plugin.
  base: "./",
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    // Keep the deployable build in docs/ because this repository uses GitHub Pages'
    // branch publishing mode (no Actions workflow permission required). public/ is
    // copied over as-is, which is also where .nojekyll comes from.
    outDir: "docs",
    emptyOutDir: true,
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
