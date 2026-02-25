import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: dir,
  resolve: {
    alias: {
      // When src/api/* imports "./addon.ts", use addon-browser (WASM-only) in browser build
      "./addon.ts": path.join(dir, "..", "..", "src", "api", "addon-browser.ts"),
    },
  },
  build: {
    rollupOptions: {
      external: ["lbug-wasm/sync"],
      output: {
        globals: { "lbug-wasm/sync": "lbugWasmSync" },
      },
    },
  },
});
