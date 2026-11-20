import { defineConfig, loadEnv, type Plugin } from "vite";

/**
 * brand-local/ is git-ignored and only used when VITE_BRAND=aaib (npm run dev:brand).
 * In every other build its modules load as empty, so no bank logo or colour can leak into
 * a public build even when the folder exists on the machine doing the build.
 */
function brandGuard(branded: boolean): Plugin {
  return {
    name: "brand-guard",
    enforce: "pre",
    load(id) {
      if (branded || !id.split("?")[0].includes("/brand-local/")) return null;
      return id.includes(".css") ? "" : "export {};";
    },
  };
}

// GitHub Pages serves the site from /<repo>/, so the base path is configurable.
export default defineConfig(({ mode }) => {
  const branded = (process.env.VITE_BRAND ?? loadEnv(mode, process.cwd()).VITE_BRAND) === "aaib";
  return {
    base: process.env.BASE_PATH ?? "./",
    build: { target: "es2022", sourcemap: true },
    worker: { format: "es" },
    optimizeDeps: { exclude: ["@huggingface/transformers"] },
    plugins: [brandGuard(branded)],
  };
});
