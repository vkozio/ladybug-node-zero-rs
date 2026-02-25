/**
 * E2E: Sanity checks at the native boundary — run first.
 * Goal: ensure the addon returns adequate responses and catch regressions in the adapter itself.
 * No exact data contracts (row counts, fixture content); only "correct shape, no crash".
 */
import test from "node:test";
import assert from "node:assert";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { createDbWithFixture, type DbFixture } from "./db-fixture.ts";

const require = createRequire(import.meta.url);
const addon = require("../tools/rust_api");

let fixture: DbFixture;

test.before(() => {
  fixture = createDbWithFixture(join(tmpdir(), "ladybug-sanity-" + Date.now() + ".lbug"));
});

test.after(() => {
  if (fixture) {
    fixture.conn.closeSync();
    fixture.db.closeSync();
  }
});

void test("sanity: RETURN 1 returns result with valid shape", () => {
  const resultHandle = addon.connectionQuerySync(fixture.conn.handle!, "RETURN 1 AS x");
  assert.strictEqual(typeof addon.queryResultGetArrowSchemaSync(resultHandle), "string");
  assert.strictEqual(typeof addon.queryResultGetNextArrowChunkSync(resultHandle, 1024), "string");
  assert.strictEqual(typeof addon.queryResultGetNumTuplesSync(resultHandle), "number");
  assert.ok(Array.isArray(addon.queryResultGetColumnNamesSync(resultHandle)));
  assert.ok(Array.isArray(addon.queryResultGetColumnDataTypesSync(resultHandle)));
  assert.strictEqual(typeof addon.queryResultHasNextSync(resultHandle), "boolean");
  addon.queryResultCloseSync(resultHandle);
});

void test("sanity: MATCH returns result with valid shape (no exact count)", () => {
  const resultHandle = addon.connectionQuerySync(
    fixture.conn.handle!,
    "MATCH (n:User) RETURN n.name ORDER BY n.name",
  );
  const n = addon.queryResultGetNumTuplesSync(resultHandle);
  assert.strictEqual(typeof n, "number");
  assert.ok(n >= 0);
  const names = addon.queryResultGetColumnNamesSync(resultHandle);
  assert.ok(Array.isArray(names));
  addon.queryResultCloseSync(resultHandle);
});

void test("sanity: prepare/execute returns valid shape", () => {
  const psHandle = addon.connectionPrepareSync(fixture.conn.handle!, "RETURN 1 AS y");
  assert.strictEqual(typeof addon.preparedStatementIsSuccessSync(psHandle), "boolean");
  assert.strictEqual(typeof addon.preparedStatementGetErrorMessageSync(psHandle), "string");
  const resultHandle = addon.connectionExecuteSync(fixture.conn.handle!, psHandle, "{}");
  assert.strictEqual(typeof resultHandle, "number");
  if (resultHandle > 0) {
    assert.strictEqual(typeof addon.queryResultGetArrowSchemaSync(resultHandle), "string");
    addon.queryResultCloseSync(resultHandle);
  }
  addon.preparedStatementCloseSync(psHandle);
});
