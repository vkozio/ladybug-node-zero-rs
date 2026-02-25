/**
 * E2E: Package API surface — all public exports, types, and constants.
 * No addon or DB required.
 */
import test from "node:test";
import assert from "node:assert";
import {
  Database,
  Connection,
  QueryResult,
  Pool,
  createPool,
  PreparedStatement,
  NativeGraphDB,
  GraphQuery,
  EdgeQuery,
  getAddon,
  LBUG_DATABASE_LOCKED,
  VERSION,
  STORAGE_VERSION,
} from "../src/api/index.ts";
import type {
  NodeID,
  LbugValue,
  QueryOptions,
  TopologicalGraph,
  GraphNodeCursor,
} from "../src/api/index.ts";

void test("Package exports Database, Connection, QueryResult, Pool, createPool, PreparedStatement", () => {
  assert.strictEqual(typeof Database, "function");
  assert.strictEqual(typeof Connection, "function");
  assert.strictEqual(typeof QueryResult, "function");
  assert.strictEqual(typeof Pool, "function");
  assert.strictEqual(typeof createPool, "function");
  assert.strictEqual(typeof PreparedStatement, "function");
});

void test("Package exports NativeGraphDB, GraphQuery, EdgeQuery, getAddon", () => {
  assert.strictEqual(typeof NativeGraphDB, "function");
  assert.strictEqual(typeof GraphQuery, "function");
  assert.strictEqual(typeof EdgeQuery, "function");
  assert.strictEqual(typeof getAddon, "function");
});

void test("Constants LBUG_DATABASE_LOCKED, VERSION, STORAGE_VERSION", () => {
  assert.strictEqual(LBUG_DATABASE_LOCKED, "LBUG_DATABASE_LOCKED");
  assert.strictEqual(typeof VERSION, "string");
  assert.ok(VERSION.length > 0);
  assert.ok(typeof STORAGE_VERSION === "number" || typeof STORAGE_VERSION === "bigint");
});

void test("getAddon returns AddonBinding with DB methods", () => {
  const addon = getAddon();
  assert.strictEqual(typeof addon.databaseCreateSync, "function");
  assert.strictEqual(typeof addon.databaseCreateAsync, "function");
  assert.strictEqual(typeof addon.databaseCloseSync, "function");
  assert.strictEqual(typeof addon.databaseConnectSync, "function");
  assert.strictEqual(typeof addon.connectionCloseSync, "function");
  assert.strictEqual(typeof addon.connectionQuerySync, "function");
  assert.strictEqual(typeof addon.connectionQueryAsync, "function");
  assert.strictEqual(typeof addon.connectionPrepareSync, "function");
  assert.strictEqual(typeof addon.connectionExecuteSync, "function");
  assert.strictEqual(typeof addon.preparedStatementCloseSync, "function");
  assert.strictEqual(typeof addon.preparedStatementIsSuccessSync, "function");
  assert.strictEqual(typeof addon.preparedStatementGetErrorMessageSync, "function");
  assert.strictEqual(typeof addon.queryResultGetArrowSchemaSync, "function");
  assert.strictEqual(typeof addon.queryResultGetNextArrowChunkSync, "function");
  assert.strictEqual(typeof addon.queryResultCloseSync, "function");
  assert.strictEqual(typeof addon.getAllArrowChunksAsync, "function");
});

void test("Database constructor accepts path and optional options", () => {
  const db = new Database("/tmp/foo");
  assert.strictEqual(db.path, "/tmp/foo");
  assert.strictEqual(db.handle, null);
  const db2 = new Database("/tmp/bar", { path: "/tmp/bar" });
  assert.strictEqual(db2.path, "/tmp/bar");
});

void test("PoolOptions: createPool with databasePath, maxSize, numThreads, initRetries, idleTimeoutMs", () => {
  const pool = createPool({
    databasePath: "/tmp/p",
    maxSize: 3,
    numThreads: 2,
    initRetries: 5,
    idleTimeoutMs: 5000,
  });
  assert.ok(pool instanceof Pool);
});

void test("QueryOptions type: timeoutMs, signal, progressCallback reserved", () => {
  const opts: QueryOptions = { timeoutMs: 1000 };
  assert.strictEqual(opts.timeoutMs, 1000);
});

void test("NodeID and LbugValue types", () => {
  const id: NodeID = 0;
  assert.strictEqual(id, 0);
  const v: LbugValue = null;
  assert.strictEqual(v, null);
});

void test("TopologicalGraph shape: nodeCount, edges Int32Array, dictionary", () => {
  const topo: TopologicalGraph = {
    nodeCount: 2,
    edges: new Int32Array([0, 1]),
    dictionary: ["a", "b"],
  };
  assert.strictEqual(topo.nodeCount, 2);
  assert.ok(topo.edges instanceof Int32Array);
  assert.deepStrictEqual(topo.dictionary, ["a", "b"]);
});

void test("GraphNodeCursor interface: nextBatch, stream, close", () => {
  const cursor: GraphNodeCursor = {
    nextBatch() {
      return [];
    },
    async *stream() {},
    close() {},
  };
  assert.strictEqual(typeof cursor.nextBatch, "function");
  assert.strictEqual(typeof cursor.stream, "function");
  assert.strictEqual(typeof cursor.close, "function");
});
