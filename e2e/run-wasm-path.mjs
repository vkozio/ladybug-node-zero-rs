// Run with LADYBUG_USE_WASM=1 to trigger WASM path. Exits 42 if lbug-wasm could not be loaded.
import { getAddon } from "../src/api/addon.ts";
try {
  getAddon();
  process.exit(0);
} catch (e) {
  const msg = e?.message ?? String(e);
  if (msg.includes("lbug-wasm") && msg.includes("could not be loaded")) process.exit(42);
  process.exit(1);
}
