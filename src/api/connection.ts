import { getAddon } from "./addon.ts";
import { buildScanNodeTableCypher, buildScanRelCypher, buildScanRelsCypher } from "./cypher-scan.ts";
import type { Database } from "./database.ts";
import type { QueryOptions, IngestColumnBatch, LoadArrowOptions } from "./types.ts";
import { PreparedStatement } from "./prepared-statement.ts";
import { QueryResult } from "./query-result.ts";

const STATEMENT_SNIPPET_MAX_LEN = 300;

function statementSnippet(statement: string): string {
  const one = statement.replace(/\s+/g, " ").trim();
  if (one.length <= STATEMENT_SNIPPET_MAX_LEN) return one;
  return one.slice(0, STATEMENT_SNIPPET_MAX_LEN) + "...";
}

function enrichQueryError(err: unknown, statement: string, callerStack?: string): Error {
  const msg = err instanceof Error ? err.message : String(err);
  const snippet = statementSnippet(statement);
  const code = err instanceof Error && "code" in err ? (err as { code?: string }).code : undefined;
  const enriched = new Error(`${msg}\nStatement snippet: ${snippet}`, {
    cause: err instanceof Error ? err : undefined,
  });
  if (code !== undefined) (enriched as { code?: string }).code = code;
  if (callerStack) enriched.stack = `${enriched.name}: ${enriched.message}\n${callerStack}`;
  return enriched;
}

/**
 * Connection handle. init()/initSync() create from Database; query returns QueryResult.
 */
export class Connection {
  private _db: Database;
  private _numThreads: number;
  private _handle: number | null = null;

  constructor(database: Database, numThreads: number = 1) {
    this._db = database;
    this._numThreads = numThreads;
  }

  get handle(): number | null {
    return this._handle;
  }

  /** Async init: database_connect_sync runs in caller context (use from worker or accept blocking). */
  async initAsync(): Promise<void> {
    this.initSync();
  }

  /** Sync init: databaseConnectSync. */
  initSync(): void {
    const dbHandle = this._db.handle;
    if (dbHandle === null) throw new Error("Database not initialized");
    const addon = getAddon();
    this._handle = addon.databaseConnectSync(dbHandle, this._numThreads);
  }

  /**
   * Async query: uses sync addon in setImmediate to avoid addon async UTF-8 boundary issue.
   */
  async queryAsync(statement: string): Promise<QueryResult> {
    if (this._handle === null) throw new Error("Connection not initialized");
    const callerStack = new Error().stack?.replace(/^Error\n/, "");
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        try {
          const result = this.querySync(statement);
          resolve(result);
        } catch (e) {
          reject(enrichQueryError(e, statement, callerStack));
        }
      });
    });
  }

  /** Sync query: connectionQuerySync. */
  querySync(statement: string): QueryResult {
    const addon = getAddon();
    if (this._handle === null) throw new Error("Connection not initialized");
    try {
      const resultHandle = addon.connectionQuerySync(this._handle, statement);
      return new QueryResult(resultHandle);
    } catch (e) {
      throw enrichQueryError(e, statement);
    }
  }

  /** Scan all nodes with the given label; returns same result handle as querySync. Safe identifiers only. */
  scanNodeTableSync(nodeLabel: string, columns: string[]): QueryResult {
    const statement = buildScanNodeTableCypher(nodeLabel, columns);
    return this.querySync(statement);
  }

  /** Scan all relationships of the given type; optional columns (default: source, target). Safe identifiers only. */
  scanRelSync(relType: string, columns?: string[]): QueryResult {
    const statement = buildScanRelCypher(relType, columns);
    return this.querySync(statement);
  }

  /**
   * Scan multiple relationship types in one query via Cypher UNION (same columns for all).
   * Returns a single result handle. Requires Ladybug to support UNION in Cypher.
   */
  scanRelsSync(relTypes: string[], columns?: string[]): QueryResult {
    const statement = buildScanRelsCypher(relTypes, columns);
    return this.querySync(statement);
  }

  /**
   * Async prepare: uses prepareSync in setImmediate to avoid blocking the event loop.
   */
  async prepareAsync(statement: string): Promise<PreparedStatement> {
    if (this._handle === null) throw new Error("Connection not initialized");
    const callerStack = new Error().stack?.replace(/^Error\n/, "");
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        try {
          const ps = this.prepareSync(statement);
          resolve(ps);
        } catch (e) {
          reject(enrichQueryError(e, statement, callerStack));
        }
      });
    });
  }

  /** Sync prepare. */
  prepareSync(statement: string): PreparedStatement {
    const addon = getAddon();
    if (this._handle === null) throw new Error("Connection not initialized");
    const psHandle = addon.connectionPrepareSync(this._handle, statement);
    return new PreparedStatement(this._handle, psHandle);
  }

  /** Sync execute prepared statement. params serialized as JSON; use {} if none. */
  executeSync(ps: PreparedStatement, params?: object): QueryResult {
    const paramsJson = params !== undefined ? JSON.stringify(params) : "{}";
    const resultHandle = ps.executeSyncInternal(paramsJson);
    return new QueryResult(resultHandle);
  }

  /**
   * Async execute: wraps executeSync in setImmediate.
   * QueryOptions (signal/progress) are accepted but currently ignored.
   */
  async executeAsync(
    ps: PreparedStatement,
    params?: object,
    _options?: QueryOptions,
  ): Promise<QueryResult> {
    if (this._handle === null) throw new Error("Connection not initialized");
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        try {
          const result = this.executeSync(ps, params);
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  /** Lightweight health check: runs a trivial Cypher statement. */
  ping(): void {
    const result = this.querySync("RETURN 1 AS _ping");
    result.closeSync();
  }

  /**
   * Explain a Cypher statement using Ladybug's EXPLAIN support.
   * Returns engine-specific textual/JSON plan.
   */
  explain(_statement: string): string {
    const stmt = `EXPLAIN ${_statement}`;
    const result = this.querySync(stmt);
    const rows = result.getAllSync();
    result.closeSync();
    return rows.join("\n");
  }

  /** Return number of nodes with the given label using a COUNT query. */
  getNumNodes(_nodeName: string): number {
    const label = _nodeName;
    const result = this.querySync(`MATCH (n:\`${label.replace(/`/g, "\\`")}\`) RETURN n`);
    const count = result.getNumTuples();
    result.closeSync();
    return count;
  }

  /** Return number of relationships with the given type using a COUNT query. */
  getNumRels(_relName: string): number {
    const rel = _relName;
    const result = this.querySync(`MATCH ()-[r:\`${rel.replace(/`/g, "\\`")}\`]->() RETURN r`);
    const count = result.getNumTuples();
    result.closeSync();
    return count;
  }

  /**
   * Bulk ingest using a simple Arrow-like columnar shape (sync helper).
   *
   * Implementation delegates to the native addon ingest path (connectionLoadArrowSync).
   * Intended for small to medium batches and test fixtures on the same thread.
   */
  loadArrowSync(batches: IngestColumnBatch[], options: LoadArrowOptions): void {
    if (this._handle === null) throw new Error("Connection not initialized");
    const addon = getAddon();
    addon.connectionLoadArrowSync(this._handle, JSON.stringify(batches), JSON.stringify(options));
  }

  /**
   * Async bulk ingest (does not block the Node.js event loop).
   *
   * Uses connectionLoadArrowAsync in the native addon (AsyncTask in libuv pool),
   * so heavy work runs off the main thread.
   */
  async loadArrowAsync(batches: IngestColumnBatch[], options: LoadArrowOptions): Promise<void> {
    if (this._handle === null) throw new Error("Connection not initialized");
    const addon = getAddon();
    await addon.connectionLoadArrowAsync(
      this._handle,
      JSON.stringify(batches),
      JSON.stringify(options),
    );
  }

  async closeAsync(): Promise<void> {
    this.closeSync();
  }

  closeSync(): void {
    if (this._handle === null) return;
    const addon = getAddon();
    addon.connectionCloseSync(this._handle);
    this._handle = null;
  }
}
