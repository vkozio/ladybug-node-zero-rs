/**
 * Copy lbug_shared.dll to tools/rust_api so the addon loads when used via pnpm link (Windows).
 * Run from repo root: pnpm run copy:dll
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyFileSync, existsSync } from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rustApiDir = path.join(root, "tools", "rust_api");
const dll = path.join(root, "third_party", "ladybug", "lbug_shared.dll");

if (process.platform !== "win32") {
  console.log("copy:dll is only needed on Windows; skipping.");
  process.exit(0);
}
if (!existsSync(dll)) {
  console.warn("lbug_shared.dll not found. Run: pnpm run download:ladybug");
  process.exit(1);
}
copyFileSync(dll, path.join(rustApiDir, "lbug_shared.dll"));
console.log("Copied lbug_shared.dll to tools/rust_api");
