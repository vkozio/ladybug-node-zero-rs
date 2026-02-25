/**
 * Postinstall: try prebuild download; on failure, build from source (Ladybug + addon).
 * Skips if @napi-rs CLI missing (consumer install). On Windows, build path copies lbug_shared.dll next to .node.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyFileSync, existsSync } from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rustApiDir = path.join(root, "tools", "rust_api");
const ladybugDir = path.join(root, "third_party", "ladybug");
const cli = path.join(root, "node_modules", "@napi-rs", "cli", "dist", "cli.js");
const downloadPrebuild = path.join(root, "scripts", "download-prebuild.ts");

if (!existsSync(cli)) {
  process.exit(0);
}

// Try prebuild first (exit 0 = success)
const prebuild = spawnSync(process.execPath, [downloadPrebuild], { cwd: root, stdio: "inherit" });
if (prebuild.status === 0) {
  process.exit(0);
}

const hasLadybug =
  existsSync(path.join(ladybugDir, "lbug.h")) ||
  existsSync(path.join(ladybugDir, "lbug_shared.lib"));

if (!hasLadybug) {
  const r = spawnSync("npm", ["run", "download:ladybug"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  if (r.status !== 0) {
    console.warn("[ladybug-node-zero-rs] Run npm run download:ladybug then npm run build:addon");
    process.exit(0);
  }
}

const build = spawnSync(process.execPath, [cli, "build", "--platform", "--no-js", "--release"], {
  cwd: rustApiDir,
  stdio: "inherit",
  shell: true,
});

if (build.status !== 0) {
  console.warn("[ladybug-node-zero-rs] Build failed. Run: npm run build:addon");
  process.exit(0);
}

if (process.platform === "win32") {
  const dll = path.join(ladybugDir, "lbug_shared.dll");
  if (existsSync(dll)) {
    copyFileSync(dll, path.join(rustApiDir, "lbug_shared.dll"));
  }
}

process.exit(0);
