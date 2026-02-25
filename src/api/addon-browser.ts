/**
 * Browser addon entry: WASM only (no native). Bundlers resolve addon.ts -> addon-browser.ts via "browser" condition.
 * Call initAddon() before getAddon().
 */
import type { AddonBinding, NativeTopology } from "./addon-types.ts";
import type { ZeroCopyTopology } from "./types.ts";
import { getWasmAddon, initWasm } from "./addon-wasm-browser.ts";

export type { AddonBinding, NativeTopology } from "./addon-types.ts";

export async function initAddon(): Promise<void> {
  await initWasm();
}

export function getAddon(): AddonBinding {
  return getWasmAddon();
}

export function getNativeTopology(): ZeroCopyTopology {
  const { sources, targets, dictionary } = getWasmAddon().getTopology();
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
