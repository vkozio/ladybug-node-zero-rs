/**
 * Load native addon (tools/rust_api) or WASM path (@lbug/lbug-wasm). DB handle API: database_create_sync/async,
 * database_close_sync, database_connect_sync, connection_close_sync,
 * connection_query_sync/async, query_result_*, get_all_arrow_chunks_async.
 * Set LADYBUG_USE_WASM=1 to use @lbug/lbug-wasm (optional dep) instead of native addon.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddonBinding, NativeTopology } from "./addon-types.ts";
import type { ZeroCopyTopology } from "./types.ts";
import { getWasmAddon } from "./addon-wasm.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const addonPath = path.join(__dirname, "..", "..", "tools", "rust_api");
const require = createRequire(import.meta.url);
const nativeAddon = require(addonPath) as AddonBinding;

function useWasmPath(): boolean {
  const v = process.env.LADYBUG_USE_WASM;
  return v === "1" || v === "true" || v === "yes";
}

let addonInstance: AddonBinding | null = null;
function getAddonInstance(): AddonBinding {
  if (addonInstance) return addonInstance;
  addonInstance = useWasmPath() ? getWasmAddon() : nativeAddon;
  return addonInstance;
}

export type { AddonBinding, NativeTopology } from "./addon-types.ts";

export function getAddon(): AddonBinding {
  return getAddonInstance();
}

export function getNativeTopology(): ZeroCopyTopology {
  const { sources, targets, dictionary } = getAddonInstance().getTopology();
  let disposed = false;
  const topo: ZeroCopyTopology = {
    sources,
    targets,
    dictionary,
    [Symbol.dispose]() {
      if (disposed) return;
      disposed = true;
      this.sources = new Int32Array(0);
      this.targets = new Int32Array(0);
    },
  };
  return topo;
}
