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
export { getAddon, getNativeTopology } from "./addon.ts";
export type { AddonBinding } from "./addon.ts";

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readPackageVersion(): string | undefined {
  try {
    const pkgJsonPath = path.join(__dirname, "..", "..", "package.json");
    const raw = readFileSync(pkgJsonPath, "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}

/** Error code when DB file is locked (Ladybug). */
export const LBUG_DATABASE_LOCKED = "LBUG_DATABASE_LOCKED";

/** Full message to throw when addon fails to load (e.g. Ladybug not linked). Use: throw new Error(LADYBUG_NOT_LINKED_MESSAGE). */
export const LADYBUG_NOT_LINKED_MESSAGE =
  "Ladybug not linked. Set LBUG_LIBRARY_DIR and LBUG_INCLUDE_DIR to your Ladybug build, or use FalkorDB: --db falkor://localhost:6379 (and run FalkorDB).";

/** Full message when require of native addon throws (optional deps / binding not found). Use: throw new Error(NATIVE_BINDING_NOT_FOUND_MESSAGE). */
export const NATIVE_BINDING_NOT_FOUND_MESSAGE =
  "Ladybug Zero adapter requires ladybug-node-zero-rs. Cannot find native binding. npm has a bug related to optional dependencies (https://github.com/npm/cli/issues/4828). Try `npm i` again after removing package-lock.json and node_modules, or from project root: pnpm link ladybug-node-zero-rs (or use --db falkor://... for FalkorDB).";

/** Library version, derived from package.json; falls back to stub when unavailable. */
export const VERSION = readPackageVersion() ?? "0.1.0";

/** Storage format version (stub until addon exposes). */
export const STORAGE_VERSION = 0;
