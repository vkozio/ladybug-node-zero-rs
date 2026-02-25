/** Dense node ID (graph overlay). */
export type NodeID = number;

/** Stub: value from Ladybug (scalar or composite). */
export type LbugValue = unknown;

/** Options for query execution (stub). */
export interface QueryOptions {
  timeoutMs?: number;
  /** Reserved: cancellation via AbortSignal. */
  signal?: AbortSignal;
  /** Reserved: progress during execution. */
  progressCallback?: (progress: unknown) => void;
}

/** Options for connection pool. */
export interface PoolOptions {
  maxSize?: number;
  databasePath: string;
  numThreads?: number;
  /** Max retry attempts when init fails with lock or transient error (default 5). */
  initRetries?: number;
  /** Initial backoff ms before retry (default 10). */
  initBackoffMs?: number;
  /** Max backoff ms (default 2000). */
  initBackoffMaxMs?: number;
  /** Ms of no activity after last release before closing DB (default 5000). 0 = disable. */
  idleTimeoutMs?: number;
}

/** Stub: summary after query execution. */
export interface QuerySummary {
  numTuples?: number;
}

/** Column type for simple ingest/Arrow-like payloads. */
export type IngestColumnType = "STRING" | "INT64" | "INT32" | "DOUBLE" | "BOOL";

/** Schema entry for a single ingest column. */
export interface IngestColumnSchema {
  name: string;
  type: IngestColumnType;
}

/** One column of values for ingest. All columns in a batch must have equal length. */
export interface IngestColumnBatch {
  name: string;
  values: (string | number | boolean | null)[];
}

/** Options for loadArrow-style bulk ingest on Connection. */
export interface LoadArrowOptions {
  table: string;
  columns: IngestColumnSchema[];
}

/** Minimal Disposable contract for Explicit Resource Management. */
export interface Disposable {
  [Symbol.dispose](): void;
}

/** Topology view: dense node indices and dictionary. */
export interface TopologicalGraph {
  nodeCount: number;
  /**
   * Flat Int32Array of edges: [from0, to0, from1, to1, ...].
   * Used by existing in-memory GraphQuery/EdgeQuery.
   */
  edges: Int32Array;
  /** Dense index to original ID (for example, 128-bit hex). */
  dictionary: string[];
  /** Optional edge type per edge index (labels compressed to small integers). */
  edgeTypes?: Int8Array;
  /**
   * Optional zero-copy split representation when topology comes from native:
   * sources[i] -> targets[i] corresponds to edgeTypes?[i].
   */
  sources?: Int32Array;
  targets?: Int32Array;
}

/** Zero-copy topology backed by native-owned buffers and Explicit Resource Management. */
export interface ZeroCopyTopology extends Disposable {
  sources: Int32Array;
  targets: Int32Array;
  edgeTypes?: Int8Array;
  dictionary: string[];
}

/** Lazy cursor for graph node properties (heavy objects, fetched on demand). */
export interface GraphNodeCursor {
  nextBatch(batchSize: number): Record<string, any>[];
  stream(): AsyncIterable<Record<string, any>>;
  close(): void;
}
