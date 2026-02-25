/**
 * E2E: WASM path (LADYBUG_USE_WASM=1). Verifies adapter choice and clear error when @lbug/lbug-wasm is missing.
 * Legacy path remains default; this test does not require @lbug/lbug-wasm to be installed.
 */
import test from "node:test";
import assert from "node:assert";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getAddon } from "../src/api/addon.ts";

test("default path: getAddon returns binding with databaseCreateSync", () => {
  delete process.env.LADYBUG_USE_WASM;
  const addon = getAddon();
  assert.strictEqual(typeof addon.databaseCreateSync, "function");
  assert.strictEqual(typeof addon.connectionQuerySync, "function");
  assert.strictEqual(typeof addon.queryResultGetArrowSchemaBinarySync, "function");
});

test("WASM path without @lbug/lbug-wasm: getAddon throws with clear message", async () => {
  const root = join(import.meta.dirname, "..");
  const script = join(root, "e2e", "run-wasm-path.mjs");
  const child = spawn(process.execPath, ["--no-warnings", script], {
    env: { ...process.env, LADYBUG_USE_WASM: "1" },
    cwd: root,
  });
  const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
  assert.strictEqual(code, 42, "Expected exit 42 when WASM path fails to load @lbug/lbug-wasm");
});
