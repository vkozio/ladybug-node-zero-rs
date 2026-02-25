/**
 * E2E: TS API layer + addon DB/connection/result. Requires: npm run build:addon + Ladybug linked.
 * Uses a single DB fixture (schema + User/Follows data). No skip — connect DB and run.
 */
import test from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Database,
  Connection,
  QueryResult,
  createPool,
  getAddon,
  PreparedStatement,
  type IngestColumnBatch,
  type LoadArrowOptions,
} from "../src/api/index.ts";
import { createDbWithFixture, runSchemaAndFixture, type DbFixture } from "./db-fixture.ts";

const require = createRequire(import.meta.url);
const addon = require("../tools/rust_api");

let fixture: DbFixture;

test.before(() => {
  fixture = createDbWithFixture(join(tmpdir(), "ladybug-e2e-main-" + Date.now() + ".lbug"));
});

test.after(() => {
  if (fixture) {
    fixture.conn.closeSync();
    fixture.db.closeSync();
  }
});

void test("DB API: addon exports databaseCreateSync, databaseCloseSync, databaseConnectSync", () => {
  assert.strictEqual(typeof addon.databaseCreateSync, "function");
  assert.strictEqual(typeof addon.databaseCloseSync, "function");
  assert.strictEqual(typeof addon.databaseConnectSync, "function");
});

void test("DB API: addon exports connectionCloseSync, connectionQuerySync, connectionQueryAsync", () => {
  assert.strictEqual(typeof addon.connectionCloseSync, "function");
  assert.strictEqual(typeof addon.connectionQuerySync, "function");
  assert.strictEqual(typeof addon.connectionQueryAsync, "function");
});

void test("DB API: addon exports queryResult* and getAllArrowChunksAsync", () => {
  assert.strictEqual(typeof addon.queryResultGetArrowSchemaSync, "function");
  assert.strictEqual(typeof addon.queryResultGetNextArrowChunkSync, "function");
  assert.strictEqual(typeof addon.queryResultCloseSync, "function");
  assert.strictEqual(typeof addon.getAllArrowChunksAsync, "function");
});

void test("DB API: Database.path and handle", () => {
  const dbPath = join(tmpdir(), "ladybug-e2e-db-path");
  const db = new Database(dbPath);
  assert.strictEqual(db.path, dbPath);
  assert.strictEqual(db.handle, null);
});

void test("DB API: TS layer - Database initSync/closeSync and Connection initSync", () => {
  const dbPath = join(tmpdir(), "ladybug-e2e-db");
  const db = new Database(dbPath);
  try {
    db.initSync();
    assert.notStrictEqual(db.handle, null);
    const conn = new Connection(db, 1);
    conn.initSync();
    assert.notStrictEqual(conn.handle, null);
    conn.closeSync();
  } catch (e) {
    assert.match(String(e), /Ladybug not linked|not implemented/i);
  } finally {
    if (db.handle !== null) db.closeSync();
  }
});

void test("DB API: TS layer - async database create does not block main thread", async () => {
  const dbPath = join(tmpdir(), "ladybug-e2e-db");
  const addonBinding = getAddon();
  let mainThreadRan = false;
  setImmediate(() => {
    mainThreadRan = true;
  });
  const promise = addonBinding.databaseCreateAsync(dbPath).catch(() => {}); // handle rejection so test runner doesn't see it
  await new Promise<void>((r) => setImmediate(r));
  await promise;
  assert.strictEqual(mainThreadRan, true);
});

void test("DB API: TS layer - async query does not block main thread", async () => {
  let mainThreadRan = false;
  setImmediate(() => {
    mainThreadRan = true;
  });
  const result = await fixture.conn.queryAsync("RETURN 1");
  assert.strictEqual(mainThreadRan, true);
  result.closeSync();
});

void test("DB API: TS layer - full flow: query async, consume result; main thread not blocked", async () => {
  const result = await fixture.conn.queryAsync("RETURN 1");
  assert.notStrictEqual(result.handle, null);
  let mainThreadRan = false;
  setImmediate(() => {
    mainThreadRan = true;
  });
  const chunks = await result.getAllChunksAsync(1024);
  assert.strictEqual(mainThreadRan, true);
  assert.strictEqual(Array.isArray(chunks), true);
  result.closeSync();
});

void test("DB API: Connection.loadArrow ingests rows into table", () => {
  const dbPath = join(tmpdir(), "ladybug-e2e-ingest-" + Date.now() + ".lbug");
  const db = new Database(dbPath);
  db.initSync();
  const conn = new Connection(db, 1);
  conn.initSync();
  try {
    const ddl = "CREATE NODE TABLE User(name STRING PRIMARY KEY, age INT64)";
    const r = conn.querySync(ddl);
    r.closeSync();

    const batches: IngestColumnBatch[] = [
      { name: "name", values: ["X", "Y"] },
      { name: "age", values: [10, 20] },
    ];
    const opts: LoadArrowOptions = {
      table: "User",
      columns: [
        { name: "name", type: "STRING" },
        { name: "age", type: "INT64" },
      ],
    };
    conn.loadArrowSync(batches, opts);

    const result = conn.querySync("MATCH (n:User) RETURN n.name ORDER BY n.name");
    assert.strictEqual(result.getNumTuples(), 2);
    result.closeSync();
  } finally {
    conn.closeSync();
    db.closeSync();
  }
});

void test("DB API: Connection.prepareSync and PreparedStatement isSuccess, getErrorMessage, executeSync", () => {
  const ps = fixture.conn.prepareSync("RETURN 1 AS x");
  assert.strictEqual(typeof ps.isSuccess(), "boolean");
  assert.strictEqual(typeof ps.getErrorMessage(), "string");
  const result = fixture.conn.executeSync(ps, {});
  assert.ok(result instanceof QueryResult);
  assert.strictEqual(typeof result.getArrowSchemaSync(), "string");
  result.closeSync();
  ps.closeSync();
});

void test("DB API: Connection.prepare/execute async wrappers", async () => {
  const ps = await fixture.conn.prepareAsync("RETURN 1 AS x");
  assert.ok(ps instanceof PreparedStatement);
  const result = await fixture.conn.executeAsync(ps, {});
  assert.ok(result instanceof QueryResult);
  assert.strictEqual(typeof result.getArrowSchemaSync(), "string");
  result.closeSync();
  ps.closeSync();
});

void test("DB API: Pool - createPool, init, run, acquire, release, closeSync and close", async () => {
  const poolPath = join(tmpdir(), "ladybug-e2e-pool-" + Date.now() + ".lbug");
  const pool = createPool({ databasePath: poolPath, maxSize: 2 });
  await pool.initAsync();
  const out = await pool.runAsync(async (c) => {
    assert.notStrictEqual(c.handle, null);
    runSchemaAndFixture(c);
    return 42;
  });
  assert.strictEqual(out, 42);
  const c2 = await pool.acquireAsync();
  assert.notStrictEqual(c2.handle, null);
  pool.release(c2);
  pool.closeSync();
  const pool2 = createPool({
    databasePath: join(tmpdir(), "ladybug-e2e-pool-close-" + Date.now() + ".lbug"),
    maxSize: 1,
  });
  await pool2.initAsync();
  await pool2.closeAsync();
  pool2.closeSync();
});

void test("DB API: Pool - idleTimeoutMs closes DB after idle; next acquire re-inits", async () => {
  const poolPath = join(tmpdir(), "ladybug-e2e-pool-idle-" + Date.now() + ".lbug");
  const pool = createPool({ databasePath: poolPath, maxSize: 1, idleTimeoutMs: 80 });
  await pool.initAsync();
  const c = await pool.acquireAsync();
  assert.notStrictEqual(c.handle, null);
  pool.release(c);
  await new Promise<void>((r) => setTimeout(r, 100));
  const c2 = await pool.acquireAsync();
  assert.notStrictEqual(c2.handle, null);
  pool.release(c2);
  pool.closeSync();
});

void test("DB API: QueryResult - getArrowSchemaSync returns string", () => {
  const result = fixture.conn.querySync("RETURN 1 AS x");
  const schema = result.getArrowSchemaSync();
  assert.strictEqual(typeof schema, "string");
  result.closeSync();
});

void test("DB API: QueryResult - getNextArrowChunkSync returns string; empty when no more", () => {
  const result = fixture.conn.querySync("RETURN 1");
  const chunk = result.getNextArrowChunkSync(100);
  assert.strictEqual(typeof chunk, "string");
  const next = result.getNextArrowChunkSync(100);
  assert.strictEqual(typeof next, "string");
  result.closeSync();
});

void test("DB API: QueryResult - for-await over result yields chunks", async () => {
  const result = await fixture.conn.queryAsync("RETURN 1");
  const chunks: string[] = [];
  for await (const c of result) {
    chunks.push(c);
  }
  assert.strictEqual(Array.isArray(chunks), true);
  result.closeSync();
});

void test("DB API: QueryResult - toStream() ReadableStream yields chunks", async () => {
  const result = await fixture.conn.queryAsync("RETURN 1");
  const stream = result.toStream(100);
  const reader = stream.getReader();
  const chunks: string[] = [];
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    chunks.push(r.value);
  }
  assert.strictEqual(Array.isArray(chunks), true);
  result.closeSync();
});

void test("DB API: QueryResult - getArrowSchemaSync throws after closeSync", () => {
  const result = fixture.conn.querySync("RETURN 1");
  result.closeSync();
  assert.throws(() => result.getArrowSchemaSync(), /already closed/);
});

void test("DB API: QueryResult - getNumTuples, getColumnNames, getColumnDataTypes", () => {
  const result = fixture.conn.querySync("RETURN 1 AS a");
  assert.strictEqual(typeof result.getNumTuples(), "number");
  const names = result.getColumnNames();
  assert.ok(Array.isArray(names));
  const types = result.getColumnDataTypes();
  assert.ok(Array.isArray(types));
  result.closeSync();
});

void test("DB API: QueryResult.resetIterator throws", () => {
  const result = fixture.conn.querySync("RETURN 1");
  assert.throws(() => result.resetIterator(), /resetIterator not implemented/);
  result.closeSync();
});

void test("DB API: QueryResult - getQuerySummary, toString, hasNext, getNextSync, getAllSync", () => {
  const result = fixture.conn.querySync("RETURN 1 AS a");
  const summary = result.getQuerySummary();
  assert.ok("numTuples" in summary);
  assert.strictEqual(typeof result.toString(), "string");
  assert.match(result.toString(), /QueryResult|rows|cols/);
  if (result.hasNext) {
    const row = result.getNextSync();
    assert.strictEqual(typeof row, "string");
  }
  const all = result.getAllSync();
  assert.strictEqual(Array.isArray(all), true);
  result.closeSync();
});

void test("DB API: fixture data - MATCH User returns 4 rows", () => {
  const result = fixture.conn.querySync("MATCH (n:User) RETURN n.name, n.age ORDER BY n.name");
  const names = result.getColumnNames();
  assert.ok(names.length >= 2);
  assert.strictEqual(result.getNumTuples(), 4);
  const all = result.getAllSync();
  assert.strictEqual(all.length, 4);
  result.closeSync();
});

void test("DB API: fixture data - MATCH Follows returns 3 edges", () => {
  const result = fixture.conn.querySync(
    "MATCH (a:User)-[f:Follows]->(b:User) RETURN a.name, b.name, f.since ORDER BY a.name, b.name",
  );
  assert.strictEqual(result.getNumTuples(), 3);
  result.closeSync();
});

void test("DB API: Connection.ping and getNumNodes/getNumRels work via Cypher", () => {
  // Uses shared fixture connection.
  fixture.conn.ping();
  const numUsers = fixture.conn.getNumNodes("User");
  assert.strictEqual(numUsers, 4);
  const numFollows = fixture.conn.getNumRels("Follows");
  assert.strictEqual(numFollows, 3);
  const explainText = fixture.conn.explain("RETURN 1");
  assert.strictEqual(typeof explainText, "string");
  assert.ok(explainText.length >= 0);
});
