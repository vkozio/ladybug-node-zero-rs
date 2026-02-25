/**
 * Browser entry: same API as index.ts but WASM-only (no native addon). No Node APIs (fs, path).
 * Call initAddon() before using getAddon() / Database / Connection.
 */
export { Database } from "./database.ts";
export type { DatabaseOptions } from "./database.ts";
export { Connection } from "./connection.ts";
export { PreparedStatement } from "./prepared-statement.ts";
export { QueryResult } from "./query-result.ts";
export { Pool, createPool } from "./pool.ts";
export {
  type NodeID,
  type LbugValue,
  type QueryOptions,
  type PoolOptions,
  type QuerySummary,
  type IngestColumnType,
  type IngestColumnSchema,
  type IngestColumnBatch,
  type LoadArrowOptions,
  type TopologicalGraph,
  type GraphNodeCursor,
  type ZeroCopyTopology,
  type Disposable,
} from "./types.ts";
export { NativeGraphDB } from "./native-graph-db.ts";
export { GraphQuery, EdgeQuery } from "./graph-query.ts";
export { getAddon, getNativeTopology, initAddon } from "./addon-browser.ts";
export type { AddonBinding } from "./addon-types.ts";

export const LBUG_DATABASE_LOCKED = "LBUG_DATABASE_LOCKED";
export const LADYBUG_NOT_LINKED_MESSAGE =
  "Ladybug not linked. In browser use @lbug/lbug-wasm (WASM path only).";
export const NATIVE_BINDING_NOT_FOUND_MESSAGE =
  "Browser build: native binding not available. Use initAddon() then getAddon().";

export const VERSION = "0.1.0";
export const STORAGE_VERSION = 0;
