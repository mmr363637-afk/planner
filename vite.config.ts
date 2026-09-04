import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // GitHub Pages serves this repository at /planner/.
  base: "/planner/",
  // Keep a deployable build in docs/ because this repository uses GitHub
  // Pages' branch publishing mode (no Actions workflow permission required).
  build: {
    outDir: "docs",
    emptyOutDir: true,
  },
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
