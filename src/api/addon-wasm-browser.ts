/**
 * Browser WASM path: loads @lbug/lbug-wasm/sync (default build, works in browser). Same AddonBinding shape.
 * Call initWasm() before getWasmAddon(). Persistence: default Emscripten FS (in-memory) or IDBFS if mounted by app.
 * Requires optional dependency @lbug/lbug-wasm (npm i @lbug/lbug-wasm) for browser build.
 */
import type { AddonBinding } from "./addon-types.ts";
import { createWasmBinding, type LbugWasmSync } from "./addon-wasm-binding.ts";

let wasmAddon: AddonBinding | null = null;

/**
 * Load @lbug/lbug-wasm and create the binding. Call once before any getWasmAddon() / getAddon().
 * In browser: dynamic import so bundler can externalize or bundle when @lbug/lbug-wasm is present.
 */
export async function initWasm(): Promise<void> {
  if (wasmAddon) return;
  const mod = await import("@lbug/lbug-wasm/sync");
  const lbug = (mod?.default ?? mod) as LbugWasmSync;
  wasmAddon = createWasmBinding(lbug);
}

export function getWasmAddon(): AddonBinding {
  if (!wasmAddon) {
    throw new Error(
      "WASM not initialized. In browser call await initWasm() (or initAddon()) before getAddon().",
    );
  }
  return wasmAddon;
}
