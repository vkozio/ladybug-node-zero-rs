# API specification

Single structural description of the Node.js ↔ Rust/C++ graph and DB API. Checkbox: [x] implemented, [ ] not implemented.

**Principles**

- **Real async:** Methods returning `Promise` run heavy work off the main thread (addon worker or libuv pool). No `Promise.resolve(syncCall())` on the main thread.
- **Sync = blocking:** Sync methods block the calling thread; they are documented as such.
- **Zero-copy where possible:** Topology and bulk data are exposed as TypedArrays (External/Shared when the native layer supports it). Arrow chunks are the single result path; no row-by-row string parsing on the hot path.

---

## 1. Types

- [x] **NodeID** — Dense integer node identifier (graph overlay). `type NodeID = number`.
- [x] **LbugValue** — Value from Ladybug (scalar or composite). Currently `unknown` (type-level stub).
- [x] **QueryOptions** — `{ timeoutMs?: number; signal?: AbortSignal; progressCallback?: (progress: unknown) => void }`. Reserved; not yet wired.
- [x] **PoolOptions** — `{ databasePath: string; maxSize?: number; numThreads?: number; initRetries?: number; initBackoffMs?: number; initBackoffMaxMs?: number; idleTimeoutMs?: number }`.
- [x] **QuerySummary** — `{ numTuples?: number }`. Filled from `QueryResult.getNumTuples()`.
- [x] **IngestColumnType** — `"STRING" | "INT64" | "INT32" | "DOUBLE" | "BOOL"`.
- [x] **IngestColumnSchema** — `{ name: string; type: IngestColumnType }`.
- [x] **IngestColumnBatch** — `{ name: string; values: (string | number | boolean | null)[] }`.
- [x] **LoadArrowOptions** — `{ table: string; columns: IngestColumnSchema[] }`.
- [x] **TopologicalGraph** — Topology snapshot: `nodeCount: number`, `edges: Int32Array` (flat `[from, to, ...]`), `edgeTypes?: Int8Array`, `dictionary: string[]`. New code should prefer split `sources: Int32Array`, `targets: Int32Array` as the canonical representation when topology comes from the native layer; `edges` can be derived or kept for in-memory GraphQuery.
- [x] **ZeroCopyTopology** — Disposable topology backed by native-owned buffers: `{ sources: Int32Array; targets: Int32Array; edgeTypes?: Int8Array; dictionary: string[]; [Symbol.dispose](): void }`.
- [x] **GraphNodeCursor** — Mapping-backed node cursor: yields `{ id, index }` for dense node IDs via `nextBatch(batchSize)`, `stream()`, `close()`, `[Symbol.dispose]()` (alias of `close()` for Explicit Resource Management).
- [x] **DatabaseOptions** — `{ path: string }` (and optional future fields).

---

## 2. Graph adapter (NativeGraphDB)

High-level graph-first API for Overlay/Build. Builds on top of the addon (Database, Connection, QueryResult, Arrow).

- [x] **NativeGraphDB** — Class; single entry for graph operations.
  - [x] **exportTopology(edgeLabels: string[], filterIds?: Int32Array): TopologicalGraph** — Derives a topology snapshot from the underlying DB via Cypher/Arrow; current implementation ignores labels and filters until Ladybug graph API is wired.
  - [x] **fetchTopology(): TopologicalGraph** — Convenience wrapper returning the current topology snapshot as `TopologicalGraph` for traversal in user code.
  - [x] **importTopology(edgeLabel: string, graph: TopologicalGraph): void** — Bulk import of topology via Cypher `UNWIND` batches using a `Connection`.
  - [x] **getProperties(ids: Int32Array | string[], properties?: string[]): GraphNodeCursor** — Mapping-backed cursor over node ids. Accepts dense indices (Int32Array) or original string ids (string[]); `properties` is currently ignored and only `id`/`index` are exposed.
  - [x] **V(label?: string | string[]): GraphQuery** — Starts a vertex query over the exported topology; labels currently ignored until Ladybug graph API is wired.
  - [x] **E(label?: string | string[]): EdgeQuery** — Starts an edge query over the exported topology; labels currently ignored until Ladybug graph API is wired.
  - [x] **readTransaction(): GraphTransaction** — Returns a transaction-like handle for Fluent graph queries; commit/rollback are no-ops until native transactions are available.
  - [x] **writeTransaction(): GraphTransaction** — Same as readTransaction; placeholder for future write semantics.

- [x] **GraphQuery** — Fluent builder over an in-memory `TopologicalGraph`; execution only on terminators.
  - Filtering: [x] **has(propertyKey, value)** (id only), [x] **hasNot(propertyKey, value?)** (id only), [x] **hasIn(propertyKey, values)** (id only), [x] **hasLabel(label)** (no-op).
  - Navigation: [x] **out(edgeLabel?)**, [x] **in(edgeLabel?)**, [x] **both(edgeLabel?)**, [x] **outE(edgeLabel?)**, [x] **inE(edgeLabel?)**, [x] **bothE(edgeLabel?)** (edge labels are currently ignored).
  - Terminators: [x] **fetchTopology(): TopologicalGraph**, [x] **fetchIds(): Int32Array**, [x] **fetchCursor(): GraphNodeCursor**.

- [x] **EdgeQuery** — Fluent builder for edge context over an in-memory `TopologicalGraph`.

### 2.1 GraphTransaction

- [x] **GraphTransaction** — Disposable transaction-like handle for graph operations.
  - `V(label?: string | string[]): GraphQuery` — Start a vertex query within the transaction.
  - `E(label?: string | string[]): EdgeQuery` — Start an edge query within the transaction.
  - `commit(): void` — Placeholder for commit semantics (no-op until native transactions are available).
  - `rollback(): void` — Placeholder for rollback semantics (no-op until native transactions are available).
  - `[Symbol.dispose](): void` — Calls `rollback()`; enables `using tx = db.readTransaction();` pattern.
  - [x] **has(propertyKey, value): EdgeQuery** — Implemented for `propertyKey = "id"`; filters edges where either endpoint node has the given id.
  - [x] **outV(): GraphQuery**, [x] **inV(): GraphQuery**, [x] **otherV(): GraphQuery**
  - Terminators: [x] **fetchTopology(): TopologicalGraph**, [x] **fetchCursor(): GraphNodeCursor**.

---

## 3. Low-level DB API (Ladybug-style)

Handle-based Database, Connection, QueryResult, Pool. Result path is Arrow-only (schema + chunks).

### 3.0 Connecting to a database (quick example)

```ts
import { Database, Connection } from "ladybug-node-zero-rs";

// 1) Open or create a database (file path or :memory:)
const db = new Database("example.lbug");
db.initSync(); // or: await db.initAsync();

// 2) Open a connection
const conn = new Connection(db, 1);
conn.initSync(); // or: await conn.initAsync();

// 3) Run a Cypher query
const result = conn.querySync("RETURN 1 AS value");
console.log(result.getNumTuples()); // 1
result.closeSync();

// 4) Close connection and database
conn.closeSync();
db.closeSync();
```

Using the pool:

```ts
import { createPool } from "ladybug-node-zero-rs";

const pool = createPool({ databasePath: "example.lbug", maxSize: 4 });
await pool.initAsync();

const value = await pool.runAsync(async (conn) => {
  const result = await conn.queryAsync("RETURN 1 AS value");
  const all = result.getAllSync();
  result.closeSync();
  return all;
});

console.log(value);
pool.closeSync();
```

### 3.1 Database

- [x] **Database** — Class. Handle to native DB; must be initialized before use.
  - [x] **constructor(path: string, options?: DatabaseOptions)**
  - [x] **path: string** (readonly)
  - [x] **handle: number | null**
  - [x] **initAsync(): Promise<void>** — Real async: addon runs create off main thread.
  - [x] **initSync(): void** — Blocking.
  - [x] **closeAsync(): Promise<void>** — Currently delegates to closeSync (implementation is sync).
  - [x] **closeSync(): void**

### 3.2 Connection

- [x] **Connection** — Class. One connection per Database; used for Cypher execution.
  - [x] **constructor(database: Database, numThreads?: number)**
  - [x] **handle: number | null**
  - [x] **initAsync(): Promise<void>** — Currently delegates to initSync (implementation is sync).
  - [x] **initSync(): void** — Blocking.
  - [x] **queryAsync(statement: string): Promise<QueryResult>** — Async wrapper around sync query using `setImmediate` to avoid blocking the event loop.
  - [x] **querySync(statement: string): QueryResult** — Blocking.
  - [x] **scanNodeTableSync(nodeLabel: string, columns: string[]): QueryResult** — MATCH (n:Label) RETURN n.col1, ...; safe identifiers only.
  - [x] **scanRelSync(relType: string, columns?: string[]): QueryResult** — MATCH (a)-[r:RelType]->(b) RETURN ...; default columns source, target.
  - [x] **scanRelsSync(relTypes: string[], columns?: string[]): QueryResult** — One Cypher with UNION of MATCHes for each rel type; same columns for all. Requires Ladybug Cypher UNION support.
  - [x] **closeAsync(): Promise<void>** — Currently delegates to closeSync (implementation is sync).
  - [x] **closeSync(): void**
  - [x] **prepareAsync(statement): Promise<PreparedStatement>**, [x] **prepareSync(statement): PreparedStatement** — Async wrapper around `prepareSync` using `setImmediate`.
  - [x] **executeAsync(ps, params?, options?): Promise<QueryResult>**, [x] **executeSync(ps, params?): QueryResult** — Async wrapper around `executeSync` using `setImmediate`; `options` (QueryOptions) accepted but currently ignored.
  - [x] **ping()** — Health check; runs a trivial Cypher statement and throws on failure.
  - [x] **explain(statement)** — Returns engine-specific textual/JSON plan via `EXPLAIN statement`.
  - [x] **getNumNodes(nodeName)**, [x] **getNumRels(relName)** — Implemented via `COUNT` Cypher queries over node labels and relationship types.
  - [ ] **registerStream(name, source, options)**, [ ] **unregisterStream(name)** — Removed from the public API surface for now. Use `loadArrow` directly for ingest.
  - [x] **loadArrowSync(batches: IngestColumnBatch[], options: LoadArrowOptions): void** — Synchronous bulk ingest helper implemented in the native addon (`connectionLoadArrowSync`) via a batched `UNWIND` Cypher under the hood. Intended for fixtures and small/medium batches on the current thread.
  - [x] **loadArrowAsync(batches: IngestColumnBatch[], options: LoadArrowOptions): Promise<void>** — Async bulk ingest that runs work in the addon’s worker pool (`connectionLoadArrowAsync`); does not block the Node.js event loop and is recommended for large ingests.

### 3.3 QueryResult

- [x] **QueryResult** — Class. Wraps addon result handle; Arrow schema and chunks, plus basic row API.
  - [x] **constructor(resultHandle: number)** — Internal; from Connection.query / querySync.
  - [x] **handle: number**
  - [x] **getArrowSchemaSync(): string** — Arrow schema as JSON string (compatibility path).
  - [x] **getNextArrowChunkSync(chunkSize?: number): string** — Next chunk as JSON; empty string when done. Default chunkSize 8192.
  - [x] **getArrowSchemaBinarySync(): Uint8Array** — Arrow IPC schema message (binary).
  - [x] **getNextArrowChunkBinarySync(chunkSize?: number): Uint8Array** — Next Arrow IPC chunk (schema + one record batch); empty when done.
  - [x] **getAllChunksBinaryAsync(chunkSize?: number): Promise<Uint8Array[]>** — Async; all IPC chunks. Prefer over JSON for bulk/index builds.
  - [x] **recordBatches(chunkSize?: number): AsyncGenerator<RecordBatch>** — Parse IPC chunks with apache-arrow and yield RecordBatches; columnar access without manual parse. Depends on apache-arrow.
  - [x] **getAllChunksAsync(chunkSize?: number): Promise<string[]>** — Async wrapper around sync `getNextArrowChunkSync` using `setImmediate` (compatibility).
  - [x] **[Symbol.asyncIterator](): AsyncGenerator<string>** — for-await over chunks.
  - [x] **toStream(chunkSize?: number): ReadableStream<string>**
  - [x] **closeSync(): void**
  - [x] **getNumTuples()**, [x] **getColumnNames()**, [x] **getColumnDataTypes()**, [x] **getQuerySummary()**
  - [x] **hasNext**, [x] **getNextSync()**, [x] **getAllSync()**, [ ] **resetIterator()** — Not implemented; currently throws, no native iterator reset.
  - [x] **toString()**

### 3.4 PreparedStatement

- [x] **PreparedStatement** — From Connection.prepare / prepareSync.
  - [x] **isSuccess(): boolean**
  - [x] **getErrorMessage(): string**

### 3.5 Pool

- [x] **createPool(options: PoolOptions): Pool**
- [x] **Pool** — Class. One shared Database; up to maxSize Connection instances.
  - [x] **initSync(): void**, [x] **initAsync(): Promise<void>**
  - [x] **acquireAsync(): Promise<Connection>**
  - [x] **release(conn: Connection): void**
  - [x] **runAsync<T>(fn: (conn: Connection) => Promise<T>): Promise<T>**
  - [x] **closeSync(): void**
  - [x] **closeAsync(): Promise<void>** — Currently delegates to closeSync (implementation is sync).

### 3.6 Constants and errors

- [x] **LBUG_DATABASE_LOCKED** — Error code when DB file is locked.
- [x] **VERSION** — Adapter library version derived from package.json (Node layer). Currently reflects the NPM package version, not the underlying Ladybug C++ library version.
- [x] **QueryOptions.signal (AbortSignal)** — Reserved in type; not wired.
- [x] **QueryOptions.progressCallback** — Reserved in type; not wired.

---

## 4. Addon binding (low-level)

Direct use of the native addon (tools/rust_api). All sync addon methods block the calling thread; async addon methods run work in addon worker and do not block the main thread.

- [x] **getAddon(): AddonBinding**
- [x] **AddonBinding**
  - [x] **databaseCreateSync(path): number**
  - [x] **databaseCreateAsync(path): Promise<number>**
  - [x] **databaseCloseSync(dbHandle): void**
  - [x] **databaseConnectSync(dbHandle, numThreads): number**
  - [x] **connectionCloseSync(connHandle): void**
  - [x] **connectionQuerySync(connHandle, statement): number**
  - [x] **connectionQueryAsync(connHandle, statement): Promise<number>**
  - [x] **connectionPrepareSync(connHandle, statement): number**
  - [x] **connectionExecuteSync(connHandle, psHandle, paramsJson): number**
  - [x] **preparedStatementCloseSync(psHandle): void**
  - [x] **preparedStatementIsSuccessSync(psHandle): boolean**
  - [x] **preparedStatementGetErrorMessageSync(psHandle): string**
  - [x] **queryResultGetArrowSchemaSync(resultHandle): string**
  - [x] **queryResultGetNextArrowChunkSync(resultHandle, chunkSize): string**
  - [x] **queryResultGetArrowSchemaBinarySync(resultHandle): Uint8Array**
  - [x] **queryResultGetNextArrowChunkBinarySync(resultHandle, chunkSize): Uint8Array**
  - [x] **getAllArrowChunksBinaryAsync(resultHandle, chunkSize): Promise<Uint8Array[]>**
  - [x] **queryResultCloseSync(resultHandle): void**
  - [x] **queryResultGetNumTuplesSync(resultHandle): number**
  - [x] **queryResultGetColumnNamesSync(resultHandle): string[]**
  - [x] **queryResultGetColumnDataTypesSync(resultHandle): string[]**
  - [x] **queryResultHasNextSync(resultHandle): boolean**
  - [x] **queryResultGetNextRowSync(resultHandle): string**
  - [x] **getAllArrowChunksAsync(resultHandle, chunkSize): Promise<string[]>**

---

## 5. Package exports

- [x] **package.json** — main, types, exports pointing at the API entry.
- [x] **src/api/index.ts** (or entry) exports:
  - [x] Database, DatabaseOptions
  - [x] Connection, QueryResult, Pool, createPool
  - [x] NodeID, LbugValue, QueryOptions, PoolOptions, QuerySummary
  - [x] getAddon, AddonBinding
  - [x] PreparedStatement, LBUG_DATABASE_LOCKED, VERSION, STORAGE_VERSION
  - [x] NativeGraphDB, TopologicalGraph, GraphNodeCursor, GraphQuery, EdgeQuery

---

## Async contract summary

| Method                                 | Returns Promise | Work runs off main thread                                 |
| -------------------------------------- | --------------- | --------------------------------------------------------- |
| Database.initAsync                     | Yes             | Yes (addon)                                               |
| Database.closeAsync                    | Yes             | No (currently sync)                                       |
| Connection.initAsync                   | Yes             | No (currently sync)                                       |
| Connection.queryAsync                  | Yes             | Yes (addon)                                               |
| Connection.closeAsync                  | Yes             | No (currently sync)                                       |
| Connection.loadArrowAsync              | Yes             | Yes (addon AsyncTask)                                     |
| QueryResult.getAllChunksAsync          | Yes             | Yes (addon)                                               |
| Pool.initAsync, acquireAsync, runAsync | Yes             | acquire/run may block in pool thread; init currently sync |
| Pool.closeAsync                        | Yes             | No (currently sync)                                       |

Any method marked "currently sync" must not be documented as non-blocking; prefer adding real async later or renaming to make sync explicit.
