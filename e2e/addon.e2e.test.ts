/**
 * E2E: Addon load and DB handle API exports. Requires: npm run build:addon
 */
import test from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const addon = require("../tools/rust_api");

void test("Addon loads and exports placeholder", () => {
  assert.strictEqual(typeof addon.placeholder, "function");
  assert.strictEqual(addon.placeholder(), 0);
});

void test("Addon exports DB API: databaseCreateSync, databaseCloseSync, databaseConnectSync", () => {
  assert.strictEqual(typeof addon.databaseCreateSync, "function");
  assert.strictEqual(typeof addon.databaseCloseSync, "function");
  assert.strictEqual(typeof addon.databaseConnectSync, "function");
});

void test("Addon exports connectionCloseSync, connectionQuerySync, connectionQueryAsync", () => {
  assert.strictEqual(typeof addon.connectionCloseSync, "function");
  assert.strictEqual(typeof addon.connectionQuerySync, "function");
  assert.strictEqual(typeof addon.connectionQueryAsync, "function");
});

void test("Addon exports queryResult* and getAllArrowChunksAsync", () => {
  assert.strictEqual(typeof addon.queryResultGetArrowSchemaSync, "function");
  assert.strictEqual(typeof addon.queryResultGetNextArrowChunkSync, "function");
  assert.strictEqual(typeof addon.queryResultCloseSync, "function");
  assert.strictEqual(typeof addon.queryResultGetNumTuplesSync, "function");
  assert.strictEqual(typeof addon.queryResultGetColumnNamesSync, "function");
  assert.strictEqual(typeof addon.queryResultGetColumnDataTypesSync, "function");
  assert.strictEqual(typeof addon.queryResultHasNextSync, "function");
  assert.strictEqual(typeof addon.queryResultGetNextRowSync, "function");
  assert.strictEqual(typeof addon.getAllArrowChunksAsync, "function");
});

void test("Addon exports connectionPrepareSync, connectionExecuteSync, preparedStatement*", () => {
  assert.strictEqual(typeof addon.connectionPrepareSync, "function");
  assert.strictEqual(typeof addon.connectionExecuteSync, "function");
  assert.strictEqual(typeof addon.preparedStatementCloseSync, "function");
  assert.strictEqual(typeof addon.preparedStatementIsSuccessSync, "function");
  assert.strictEqual(typeof addon.preparedStatementGetErrorMessageSync, "function");
});
