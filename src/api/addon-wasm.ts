/**
 * Node WASM path: implements AddonBinding by wrapping lbug-wasm/nodejs/sync (NODEFS).
 * Enable with LADYBUG_USE_WASM=1. Browser uses addon-wasm-browser.ts instead.
 */
import { createRequire } from "node:module";
import type { AddonBinding } from "./addon-types.ts";
import { createWasmBinding, type LbugWasmSync } from "./addon-wasm-binding.ts";

const require = createRequire(import.meta.url);

let wasmAddon: AddonBinding | null = null;

function loadWasmAddon(): AddonBinding {
  if (wasmAddon) return wasmAddon;
  try {
    const lbug = require("lbug-wasm/nodejs/sync") as LbugWasmSync;
    wasmAddon = createWasmBinding(lbug);
    return wasmAddon;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `LADYBUG_USE_WASM is set but lbug-wasm could not be loaded: ${msg}. Install with: npm i lbug-wasm (or pnpm add lbug-wasm).`,
      { cause: e },
    );
  }
}

export function getWasmAddon(): AddonBinding {
  return loadWasmAddon();
}
