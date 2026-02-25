/**
 * E2E: Addon API — every addon method is invoked. Uses shared DB fixture (no skip).
 */
import test from "node:test";
import assert from "node:assert";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getAddon } from "../src/api/index.ts";
import { createDbWithFixture, type DbFixture } from "./db-fixture.ts";

const addon = getAddon();
const tmpPath = () => join(tmpdir(), "ladybug-addon-api-e2e-" + Date.now());

let fixture: DbFixture;

test.before(() => {
  fixture = createDbWithFixture();
});

test.after(() => {
  if (fixture) {
    fixture.conn.closeSync();
    fixture.db.closeSync();
  }
});

void test("addon.databaseCreateSync is invoked: returns handle or throws", () => {
  const path = tmpPath();
  let handle: number;
  try {
    handle = addon.databaseCreateSync(path);
  } catch (e) {
    assert.ok(
      /Ladybug|linked|ENOENT|failed|not found|error/i.test(String(e)),
      "expected addon to throw when DB unavailable or path invalid",
    );
    return;
  }
  assert.strictEqual(typeof handle, "number");
  assert.ok(handle > 0);
  addon.databaseCloseSync(handle);
});

void test("addon full flow sync: querySync -> schema, chunk, close over fixture", () => {
  const resultHandle = addon.connectionQuerySync(fixture.conn.handle!, "RETURN 1 AS x");
  const schema = addon.queryResultGetArrowSchemaSync(resultHandle);
  assert.strictEqual(typeof schema, "string");
  const chunk = addon.queryResultGetNextArrowChunkSync(resultHandle, 1024);
  assert.strictEqual(typeof chunk, "string");
  assert.strictEqual(typeof addon.queryResultGetNumTuplesSync(resultHandle), "number");
  assert.ok(Array.isArray(addon.queryResultGetColumnNamesSync(resultHandle)));
  assert.ok(Array.isArray(addon.queryResultGetColumnDataTypesSync(resultHandle)));
  assert.strictEqual(typeof addon.queryResultHasNextSync(resultHandle), "boolean");
  addon.queryResultCloseSync(resultHandle);
});

void test("addon full flow async: query -> getAllChunksAsync over fixture (TS async path)", async () => {
  const result = await fixture.conn.queryAsync("RETURN 1");
  const chunks = await result.getAllChunksAsync(1024);
  assert.ok(Array.isArray(chunks));
  result.closeSync();
});

void test("addon prepare/execute flow over fixture", () => {
  const psHandle = addon.connectionPrepareSync(fixture.conn.handle!, "RETURN 1 AS y");
  assert.strictEqual(typeof addon.preparedStatementIsSuccessSync(psHandle), "boolean");
  assert.strictEqual(typeof addon.preparedStatementGetErrorMessageSync(psHandle), "string");
  const resultHandle = addon.connectionExecuteSync(fixture.conn.handle!, psHandle, "{}");
  if (resultHandle > 0) {
    addon.queryResultGetArrowSchemaSync(resultHandle);
    addon.queryResultCloseSync(resultHandle);
  }
  addon.preparedStatementCloseSync(psHandle);
});

void test("addon queryResultHasNextSync and getNextRowSync loop over fixture", () => {
  const resultHandle = addon.connectionQuerySync(fixture.conn.handle!, "RETURN 1");
  while (addon.queryResultHasNextSync(resultHandle)) {
    const row = addon.queryResultGetNextRowSync(resultHandle);
    assert.strictEqual(typeof row, "string");
  }
  addon.queryResultCloseSync(resultHandle);
});

void test("addon fixture data: MATCH User via raw addon", () => {
  const resultHandle = addon.connectionQuerySync(
    fixture.conn.handle!,
    "MATCH (n:User) RETURN n.name ORDER BY n.name",
  );
  const n = addon.queryResultGetNumTuplesSync(resultHandle);
  assert.strictEqual(n, 4);
  addon.queryResultCloseSync(resultHandle);
});

void test("addon binary Arrow: getArrowSchemaBinarySync and getNextArrowChunkBinarySync", () => {
  const resultHandle = addon.connectionQuerySync(fixture.conn.handle!, "RETURN 1 AS x");
  const schemaBuf = addon.queryResultGetArrowSchemaBinarySync(resultHandle);
  assert.ok(schemaBuf instanceof Uint8Array || Buffer.isBuffer(schemaBuf));
  const chunkBuf = addon.queryResultGetNextArrowChunkBinarySync(resultHandle, 1024);
  assert.ok(chunkBuf instanceof Uint8Array || Buffer.isBuffer(chunkBuf));
  addon.queryResultCloseSync(resultHandle);
});

void test("Connection.scanNodeTableSync over fixture User", () => {
  const result = fixture.conn.scanNodeTableSync("User", ["name", "age"]);
  assert.strictEqual(result.getNumTuples(), 4);
  assert.strictEqual(result.getColumnNames().length, 2);
  result.closeSync();
});

void test("Connection.scanRelSync over fixture Follows", () => {
  const result = fixture.conn.scanRelSync("Follows");
  assert.ok(result.getNumTuples() >= 3);
  result.closeSync();
});

void test("Connection.scanRelsSync over fixture (single type)", async () => {
  const result = fixture.conn.scanRelsSync(["Follows"]);
  assert.ok(result.getNumTuples() >= 3);
  const names = result.getColumnNames();
  assert.ok(names.includes("source") || names.length >= 1);
  result.closeSync();
});

void test("QueryResult.recordBatches yields Arrow RecordBatches", async () => {
  const result = fixture.conn.querySync("MATCH (n:User) RETURN n.name, n.age ORDER BY n.name");
  let rowCount = 0;
  for await (const batch of result.recordBatches(1024)) {
    rowCount += batch.numRows;
  }
  assert.ok(rowCount >= 4);
  result.closeSync();
});
