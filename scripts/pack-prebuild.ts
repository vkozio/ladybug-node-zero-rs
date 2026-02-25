/**
 * Pack prebuild zip for current platform (for CI). Usage: node scripts/pack-prebuild.ts [triple]
 * Output: prebuild-<triple>.zip in repo root with .node and optional dll from tools/rust_api.
 */
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const rustApiDir = path.join(root, "tools", "rust_api");

function getTriple(): string {
  const p = process.platform;
  const a = process.arch;
  if (p === "win32") return a === "x64" ? "win32-x64-msvc" : a === "arm64" ? "win32-arm64-msvc" : "";
  if (p === "darwin") return a === "x64" ? "darwin-x64" : a === "arm64" ? "darwin-arm64" : "";
  if (p === "linux") return a === "x64" ? "linux-x64-gnu" : a === "arm64" ? "linux-arm64-gnu" : "";
  return "";
}

async function main(): Promise<void> {
  const triple = process.argv[2] ?? getTriple();
  if (!triple) {
    console.error("Unknown platform. Pass triple, e.g. win32-x64-msvc");
    process.exit(1);
  }

  const files = await readdir(rustApiDir);
  const nodeFile = files.find((f) => f.endsWith(".node"));
  if (!nodeFile) {
    console.error("No .node file in tools/rust_api. Build first.");
    process.exit(1);
  }

  const zipName = `prebuild-${triple}.zip`;
  const zipPath = path.join(root, zipName);

  if (process.platform === "win32") {
    const toZip = [path.join(rustApiDir, nodeFile)];
    const dll = path.join(rustApiDir, "lbug_shared.dll");
    const { existsSync } = await import("node:fs");
    if (existsSync(dll)) toZip.push(dll);
    const args = [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path (${toZip.map((f) => `'${f.replace(/'/g, "''")}'`).join(",")}) -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`,
    ];
    const r = spawnSync("powershell", args, { cwd: root, stdio: "inherit" });
    if (r.status !== 0) process.exit(1);
  } else {
    const list = [nodeFile];
    const { existsSync } = await import("node:fs");
    if (existsSync(path.join(rustApiDir, "lbug_shared.dll"))) list.push("lbug_shared.dll");
    const r = spawnSync("zip", ["-j", zipPath, ...list.map((f) => path.join(rustApiDir, f))], {
      cwd: root,
      stdio: "inherit",
    });
    if (r.status !== 0) process.exit(1);
  }

  console.log("Created", zipName);
}

main();
