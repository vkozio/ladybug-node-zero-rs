# Browser WASM demo

Runs Ladybug via **lbug-wasm** (sync, default build) in the browser. Same API as Node (Database, Connection, QueryResult).

**Note:** The npm package `lbug-wasm` is not yet published. The build externalizes it so the bundle succeeds. When LadybugDB publish it, add `lbug-wasm` as a dependency and remove `build.rollupOptions.external` from `vite.config.ts` so it is bundled. Until then, the demo page will fail at runtime when calling `initWasm()` unless you provide the module (e.g. from a local build of [Ladybug wasm tools](https://github.com/LadybugDB/ladybug/tree/master/tools/wasm)).

From repo root:

- **Dev:** `npm run dev:browser` — Vite dev server.
- **Build:** `npm run build:browser` — output in `examples/browser/dist`.

Persistence is in-memory by default (Emscripten MEMFS). For persistent storage see lbug-wasm docs (IDBFS / `browser_persistent` example).
