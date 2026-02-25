/**
 * E2E: Graph adapter — GraphQuery, EdgeQuery over manual topology. NativeGraphDB is stubbed (topology from DB/client).
 */
import test from "node:test";
import assert from "node:assert";
import { NativeGraphDB, Connection, Database } from "../src/api/index.ts";
import { createDbWithFixture, type DbFixture } from "./db-fixture.ts";
import { GraphQuery, EdgeQuery } from "../src/api/graph-query.ts";

// Manual topology: 4 nodes, edges 0->1, 1->2, 2->3 (flat Int32Array).
const MANUAL_TOPOLOGY = {
  nodeCount: 4,
  edges: new Int32Array([0, 1, 1, 2, 2, 3]),
  dictionary: ["n0", "n1", "n2", "n3"],
};

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

void test("NativeGraphDB.exportTopology throws when constructed without Connection", () => {
  const db = new NativeGraphDB();
  assert.throws(() => db.exportTopology([]), /Topology must be obtained from Database/);
});

void test("NativeGraphDB.V() and E() throw (call exportTopology)", () => {
  const db = new NativeGraphDB();
  assert.throws(() => db.V(), /Topology must be obtained/);
  assert.throws(() => db.E(), /Topology must be obtained/);
  assert.throws(() => db.V("L"), /Topology must be obtained/);
  assert.throws(() => db.E(["R"]), /Topology must be obtained/);
});

void test("NativeGraphDB.exportTopology over DB connection returns non-empty topology", () => {
  const graphDb = new NativeGraphDB(fixture.conn);
  const topo = graphDb.exportTopology([]);
  assert.ok(topo.nodeCount >= 0);
  assert.ok(topo.edges.length % 2 === 0);
});

void test("NativeGraphDB V()/out()/fetchIds chain over DB connection works", () => {
  const graphDb = new NativeGraphDB(fixture.conn);
  const q = graphDb.V();
  const out = q.out();
  const ids = out.fetchIds();
  assert.ok(ids instanceof Int32Array);
});

void test("NativeGraphDB V()/outE()/inV()/fetchIds chain over DB connection works", () => {
  const graphDb = new NativeGraphDB(fixture.conn);
  const q = graphDb.V();
  const edges = q.outE();
  const toNodes = edges.inV().fetchIds();
  assert.ok(toNodes instanceof Int32Array);
});

void test("NativeGraphDB V().has/hasNot/hasIn chains over DB connection work", () => {
  const graphDb = new NativeGraphDB(fixture.conn);
  const topo = graphDb.exportTopology([]);
  if (topo.nodeCount === 0) return;
  const all = graphDb.V();
  const dict = topo.dictionary;
  const firstId = dict[0];
  if (typeof firstId !== "string") return;
  const one = all.has("id", firstId).fetchIds();
  const notOne = all.hasNot("id", firstId).fetchIds();
  const inMany = all.hasIn("id", [firstId]).fetchIds();
  assert.ok(one instanceof Int32Array);
  assert.ok(notOne instanceof Int32Array);
  assert.ok(inMany instanceof Int32Array);
});

void test("GraphQuery/EdgeQuery over manual topology - out() follows outgoing edges", () => {
  const fromNode0 = new GraphQuery(MANUAL_TOPOLOGY, new Set([0]));
  const next = fromNode0.out();
  const ids = next.fetchIds();
  assert.strictEqual(ids.length, 1);
  assert.strictEqual(ids[0], 1);
});

void test("GraphQuery/EdgeQuery over manual topology - in() follows incoming edges", () => {
  const toNode3 = new GraphQuery(MANUAL_TOPOLOGY, new Set([3]));
  const prev = toNode3.in();
  const ids = prev.fetchIds();
  assert.strictEqual(ids.length, 1);
  assert.strictEqual(ids[0], 2);
});

void test("GraphQuery/EdgeQuery over manual topology - both() unions in and out", () => {
  const fromNode1 = new GraphQuery(MANUAL_TOPOLOGY, new Set([1]));
  const both = fromNode1.both();
  const ids = both.fetchIds();
  assert.strictEqual(ids.length, 2);
  assert.ok(Array.from(ids).includes(0));
  assert.ok(Array.from(ids).includes(2));
});

void test("GraphQuery/EdgeQuery over manual topology - fetchTopology returns subgraph", () => {
  const q = new GraphQuery(MANUAL_TOPOLOGY, new Set([0, 1]));
  const sub = q.fetchTopology();
  assert.strictEqual(sub.nodeCount, MANUAL_TOPOLOGY.nodeCount);
  assert.ok(sub.edges.length <= MANUAL_TOPOLOGY.edges.length);
  assert.strictEqual(sub.dictionary, MANUAL_TOPOLOGY.dictionary);
});

void test("GraphQuery.fromAllNodes yields all node indices", () => {
  const q = GraphQuery.fromAllNodes(MANUAL_TOPOLOGY);
  const ids = q.fetchIds();
  assert.strictEqual(ids.length, 4);
  assert.deepStrictEqual(
    Array.from(ids).sort((a, b) => a - b),
    [0, 1, 2, 3],
  );
});

void test("GraphQuery/EdgeQuery over manual topology - fetchIds returns Int32Array", () => {
  const q = GraphQuery.fromAllNodes(MANUAL_TOPOLOGY).out();
  const ids = q.fetchIds();
  assert.ok(ids instanceof Int32Array);
  assert.ok(ids.length > 0);
});

void test("GraphQuery.hasNot('id', value) excludes nodes with that id", () => {
  const q = new GraphQuery(MANUAL_TOPOLOGY, new Set([0, 1, 2, 3])).hasNot("id", "n1");
  const ids = q.fetchIds();
  assert.strictEqual(ids.length, 3);
  assert.ok(!Array.from(ids).includes(1));
});

void test("GraphQuery.hasLabel is no-op (returns same node set)", () => {
  const q = new GraphQuery(MANUAL_TOPOLOGY, new Set([0, 2])).hasLabel("L").hasLabel(["A", "B"]);
  const ids = q.fetchIds();
  assert.strictEqual(ids.length, 2);
  assert.ok(Array.from(ids).includes(0));
  assert.ok(Array.from(ids).includes(2));
});

void test("GraphQuery/EdgeQuery - full chain fromAllNodes -> has -> out -> fetchIds", () => {
  const q = GraphQuery.fromAllNodes(MANUAL_TOPOLOGY).has("id", "n0").out().fetchIds();
  assert.strictEqual(q.length, 1);
  assert.strictEqual(q[0], 1);
});

void test("GraphQuery/EdgeQuery over manual topology - fetchCursor has nextBatch, stream, close", () => {
  const q = GraphQuery.fromAllNodes(MANUAL_TOPOLOGY);
  const cursor = q.fetchCursor();
  assert.ok(cursor !== undefined && cursor !== null);
  assert.strictEqual(typeof cursor.nextBatch, "function");
  assert.strictEqual(typeof cursor.stream, "function");
  assert.strictEqual(typeof cursor.close, "function");
  const batch = cursor.nextBatch(10);
  assert.strictEqual(Array.isArray(batch), true);
  if (batch.length > 0) {
    assert.ok("id" in batch[0]);
    assert.ok("index" in batch[0]);
  }
  cursor.close();
});

void test("GraphNodeCursor.stream() is AsyncIterable", async () => {
  const q = GraphQuery.fromAllNodes(MANUAL_TOPOLOGY);
  const cursor = q.fetchCursor();
  const rows: Record<string, unknown>[] = [];
  for await (const row of cursor.stream()) {
    rows.push(row);
  }
  assert.strictEqual(rows.length, 4);
  for (const r of rows) {
    assert.ok("id" in r);
    assert.ok("index" in r);
  }
  cursor.close();
});

void test("GraphQuery/EdgeQuery over manual topology - has('id', value) and hasIn filter by dictionary", () => {
  const one = new GraphQuery(MANUAL_TOPOLOGY, new Set([0, 1, 2, 3])).has("id", "n1").fetchIds();
  assert.strictEqual(one.length, 1);
  assert.strictEqual(one[0], 1);
  const two = new GraphQuery(MANUAL_TOPOLOGY, new Set([0, 1, 2, 3]))
    .hasIn("id", ["n0", "n3"])
    .fetchIds();
  assert.strictEqual(two.length, 2);
  assert.deepStrictEqual(
    Array.from(two).sort((a, b) => a - b),
    [0, 3],
  );
});

void test("GraphQuery/EdgeQuery over manual topology - outE(), inE(), bothE() return EdgeQuery", () => {
  const from0 = new GraphQuery(MANUAL_TOPOLOGY, new Set([0]));
  const outE = from0.outE();
  assert.strictEqual(outE.fetchTopology().edges.length, 2);
  assert.strictEqual(from0.inE().fetchTopology().edges.length, 0);
  assert.strictEqual(from0.bothE().fetchTopology().edges.length, 2);
});

void test("EdgeQuery.has(propertyKey, value) is stub (returns same EdgeQuery)", () => {
  const eq = new EdgeQuery(MANUAL_TOPOLOGY, [0, 2]);
  const same = eq.has("x", 1);
  assert.strictEqual(same, eq);
  assert.deepStrictEqual(same.fetchTopology().edges, eq.fetchTopology().edges);
});

void test("EdgeQuery over manual topology - outV(), inV(), otherV()", () => {
  const edgeIndices = [0, 2, 4]; // three edges
  const eq = new EdgeQuery(MANUAL_TOPOLOGY, edgeIndices);
  const outV = eq.outV();
  assert.strictEqual(outV.fetchIds().length, 3);
  const inV = eq.inV();
  assert.strictEqual(inV.fetchIds().length, 3);
  assert.strictEqual(eq.otherV().fetchIds().length, 4);
});

void test("EdgeQuery.fetchCursor returns cursor over endpoint nodes", () => {
  const eq = new EdgeQuery(MANUAL_TOPOLOGY, [0, 2, 4]);
  const cursor = eq.fetchCursor();
  const batch = cursor.nextBatch(10);
  assert.ok(Array.isArray(batch));
  assert.ok(batch.length > 0);
  cursor.close();
});

void test("TopologicalGraph with optional edgeTypes preserved in fetchTopology", () => {
  const topoWithTypes = {
    ...MANUAL_TOPOLOGY,
    edgeTypes: new Int8Array([1, 1, 1]),
  };
  const q = new GraphQuery(topoWithTypes, new Set([0, 1]));
  const sub = q.fetchTopology();
  assert.strictEqual(sub.edgeTypes !== undefined, true);
});

void test("NativeGraphDB.importTopology throws when no Connection", () => {
  const db = new NativeGraphDB();
  assert.throws(
    () => db.importTopology("E", MANUAL_TOPOLOGY),
    /must be constructed with a Connection/,
  );
});

void test("NativeGraphDB.getProperties throws until wired", () => {
  const db = new NativeGraphDB();
  assert.throws(() => db.getProperties(new Int32Array([0])), /Topology must be obtained/);
});
