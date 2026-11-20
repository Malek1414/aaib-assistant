import { defineConfig } from "vite";

// GitHub Pages serves the site from /<repo>/, so the base path is configurable.
export default defineConfig({
  base: process.env.BASE_PATH ?? "./",
  build: { target: "es2022", sourcemap: true },
  worker: { format: "es" },
  optimizeDeps: { exclude: ["@huggingface/transformers"] },
});
