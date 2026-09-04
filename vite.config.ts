import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  // The app is deployed to a sub-path (GitHub Pages: https://<user>.github.io/<repo>/),
  // so every emitted URL must be relative. `vite-plugin-singlefile` also pins base to "./"
  // (it inlines all JS/CSS into index.html); declaring it here keeps that guarantee
  // explicit and survives removing the plugin.
  base: "./",
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    // GitHub Pages serves .webmanifest with a generic content type on some setups;
    // the copy step keeps public/ assets as-is, so nothing else is needed here.
    outDir: "dist",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
