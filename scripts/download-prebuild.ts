/**
 * Download prebuilt addon for current platform from GitHub Release.
 * Exit 0 if success (binary in place), non-zero if no prebuild or error (caller should build from source).
 * Env: LADYBUG_PREBUILD_REPO (default: vkozio/ladybug-node-zero-rs), LADYBUG_PREBUILD_VERSION (default: package version).
 */
import { createWriteStream } from "node:fs";
import { mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { spawnSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(path.join(scriptDir, ".."));
const rustApiDir = path.join(root, "tools", "rust_api");

function getNapiTriple(): string {
  const p = process.platform;
  const a = process.arch;
  if (p === "win32") return a === "x64" ? "win32-x64-msvc" : a === "arm64" ? "win32-arm64-msvc" : "";
  if (p === "darwin") return a === "x64" ? "darwin-x64" : a === "arm64" ? "darwin-arm64" : "";
  if (p === "linux") return a === "x64" ? "linux-x64-gnu" : a === "arm64" ? "linux-arm64-gnu" : "";
  return "";
}

async function getPackageVersion(): Promise<string> {
  const pkgPath = path.join(root, "package.json");
  const { readFile } = await import("node:fs/promises");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
  return pkg.version ?? "0.1.0";
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const dir = path.dirname(dest);
  await mkdir(dir, { recursive: true });
  const file = createWriteStream(dest);
  await pipeline(Readable.fromWeb(res.body as WebReadableStream), file);
}

function unzip(zipPath: string, outDir: string): boolean {
  const isWin = process.platform === "win32";
  if (isWin) {
    const r = spawnSync(
      "powershell",
      ["-NoProfile", "-Command", `Expand-Archive -Path ${JSON.stringify(zipPath)} -DestinationPath ${JSON.stringify(outDir)} -Force`],
      { stdio: "inherit" },
    );
    return r.status === 0;
  }
  const r = spawnSync("unzip", ["-o", zipPath, "-d", outDir], { stdio: "inherit" });
  return r.status === 0;
}

async function main(): Promise<void> {
  const triple = getNapiTriple();
  if (!triple) {
    console.warn("[ladybug-node-zero-rs] No prebuild for platform", process.platform, process.arch);
    process.exit(1);
  }

  const repo = process.env.LADYBUG_PREBUILD_REPO ?? "vkozio/ladybug-node-zero-rs";
  let version = process.env.LADYBUG_PREBUILD_VERSION;
  if (!version) version = await getPackageVersion();
  const tag = version.startsWith("v") ? version : `v${version}`;
  const assetName = `prebuild-${triple}.zip`;
  const url = `https://github.com/${repo}/releases/download/${tag}/${assetName}`;

  const tmpDir = path.join(root, "node_modules", ".prebuild-dl");
  const zipPath = path.join(tmpDir, assetName);
  await mkdir(tmpDir, { recursive: true });

  try {
    await download(url, zipPath);
  } catch (e) {
    console.warn("[ladybug-node-zero-rs] Prebuild download failed:", (e as Error).message);
    process.exit(1);
  }

  const extracted = path.join(tmpDir, "extract");
  await mkdir(extracted, { recursive: true });
  if (!unzip(zipPath, extracted)) {
    console.warn("[ladybug-node-zero-rs] Prebuild unzip failed");
    process.exit(1);
  }

  const { readdir } = await import("node:fs/promises");
  let copyFrom = extracted;
  const entries = await readdir(extracted);
  if (entries.length === 1) {
    const single = path.join(extracted, entries[0]);
    if ((await stat(single)).isDirectory()) copyFrom = single;
  }
  const files = await readdir(copyFrom);
  await mkdir(rustApiDir, { recursive: true });
  for (const f of files) {
    const src = path.join(copyFrom, f);
    const st = await stat(src);
    if (st.isFile()) await rename(src, path.join(rustApiDir, f));
  }

  console.log("[ladybug-node-zero-rs] Prebuild installed:", triple);
  process.exit(0);
}

main();
