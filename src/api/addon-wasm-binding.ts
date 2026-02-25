/**
 * Shared WASM binding: maps @lbug/lbug-wasm sync API to AddonBinding. No Node/browser APIs; used by addon-wasm.ts and addon-wasm-browser.ts.
 */
import type { AddonBinding, NativeTopology } from "./addon-types.ts";

export interface LbugWasmSync {
  Database: new (path: string) => { destroy?: () => void };
  Connection: new (db: unknown) => { destroy?: () => void; query: (stmt: string) => unknown };
  setWorkerPath?: (path: string) => void;
}

export interface LbugQueryResult {
  getSchema?: () => Uint8Array;
  getNextChunk?: (size: number) => Uint8Array;
  getNumTuples?: () => number;
  getColumnNames?: () => string[];
  getColumnDataTypes?: () => string[];
  hasNext?: () => boolean;
  getNextRow?: () => string;
  close?: () => void;
}

function wrapQueryResult(raw: unknown): LbugQueryResult {
  const r = raw as Record<string, unknown>;
  const fn = <T>(name: string, cast: (x: unknown) => T) =>
    typeof r[name] === "function"
      ? () => cast((r[name] as (...args: unknown[]) => unknown)())
      : undefined;
  return {
    getSchema: fn("getArrowSchemaIPC", (x) => x as Uint8Array),
    getNextChunk:
      typeof r.getNextArrowChunkIPC === "function"
        ? (size: number) => (r.getNextArrowChunkIPC as (n: number) => Uint8Array)(size)
        : undefined,
    getNumTuples: fn("getNumTuples", (x) => x as number),
    getColumnNames: fn("getColumnNames", (x) => x as string[]),
    getColumnDataTypes: fn("getColumnDataTypes", (x) => x as string[]),
    hasNext: typeof r.hasNext === "function" ? () => (r.hasNext as () => boolean)() : undefined,
    getNextRow: fn("getNextRow", (x) => x as string),
    close: typeof r.close === "function" ? () => (r.close as () => void)() : undefined,
  };
}

let nextHandle = 1;
const emptyTopology: NativeTopology = {
  sources: new Int32Array(0),
  targets: new Int32Array(0),
  dictionary: [],
};

export function createWasmBinding(lbug: LbugWasmSync): AddonBinding {
  const dbs = new Map<number, InstanceType<LbugWasmSync["Database"]>>();
  const conns = new Map<number, InstanceType<LbugWasmSync["Connection"]>>();
  const results = new Map<number, LbugQueryResult>();

  function nextId(): number {
    const h = nextHandle++;
    return h;
  }

  return {
    databaseCreateSync(path: string): number {
      const db = new lbug.Database(path);
      const h = nextId();
      dbs.set(h, db);
      return h;
    },
    databaseCreateAsync(path: string): Promise<number> {
      return Promise.resolve(this.databaseCreateSync(path));
    },
    databaseCloseSync(dbHandle: number): void {
      const db = dbs.get(dbHandle);
      if (db) {
        if (typeof db.destroy === "function") db.destroy();
        dbs.delete(dbHandle);
      }
    },
    databaseConnectSync(dbHandle: number, _numThreads: number): number {
      const db = dbs.get(dbHandle);
      if (!db) throw new Error("Invalid database handle");
      const conn = new lbug.Connection(db);
      const h = nextId();
      conns.set(h, conn);
      return h;
    },
    connectionCloseSync(connHandle: number): void {
      const conn = conns.get(connHandle);
      if (conn) {
        if (typeof (conn as { destroy?: () => void }).destroy === "function")
          (conn as { destroy: () => void }).destroy();
        conns.delete(connHandle);
      }
    },
    connectionQuerySync(connHandle: number, statement: string): number {
      const conn = conns.get(connHandle);
      if (!conn) throw new Error("Invalid connection handle");
      const raw = conn.query(statement);
      const h = nextId();
      results.set(h, wrapQueryResult(raw));
      return h;
    },
    connectionQueryAsync(_connHandle: number, _statementHex: string): Promise<number> {
      return Promise.reject(new Error("WASM path: use connectionQuerySync"));
    },
    connectionPrepareSync(_connHandle: number, _statement: string): number {
      throw new Error("WASM path: prepared statements not implemented yet");
    },
    connectionExecuteSync(_connHandle: number, _psHandle: number, _paramsJson: string): number {
      throw new Error("WASM path: execute not implemented yet");
    },
    connectionLoadArrowSync(_connHandle: number, _batchesJson: string, _optionsJson: string): void {
      throw new Error("WASM path: loadArrow not implemented yet");
    },
    connectionLoadArrowAsync(
      _connHandle: number,
      _batchesJson: string,
      _optionsJson: string,
    ): Promise<void> {
      return Promise.reject(new Error("WASM path: loadArrow not implemented yet"));
    },
    preparedStatementCloseSync(_psHandle: number): void {},
    preparedStatementIsSuccessSync(_psHandle: number): boolean {
      return true;
    },
    preparedStatementGetErrorMessageSync(_psHandle: number): string {
      return "";
    },
    queryResultGetArrowSchemaSync(resultHandle: number): string {
      const r = results.get(resultHandle);
      if (!r) throw new Error("Invalid result handle");
      if (r.getSchema) {
        const buf = r.getSchema();
        return typeof TextDecoder !== "undefined"
          ? new TextDecoder().decode(buf)
          : String.fromCharCode(...buf);
      }
      return "[]";
    },
    queryResultGetNextArrowChunkSync(resultHandle: number, chunkSize: number): string {
      const r = results.get(resultHandle);
      if (!r) throw new Error("Invalid result handle");
      if (r.getNextChunk) {
        const buf = r.getNextChunk(chunkSize);
        if (buf.length === 0) return "";
        return typeof TextDecoder !== "undefined"
          ? new TextDecoder().decode(buf)
          : String.fromCharCode(...buf);
      }
      return "";
    },
    queryResultGetArrowSchemaBinarySync(resultHandle: number): Uint8Array {
      const r = results.get(resultHandle);
      if (!r) throw new Error("Invalid result handle");
      if (r.getSchema) return new Uint8Array(r.getSchema());
      return new Uint8Array(0);
    },
    queryResultGetNextArrowChunkBinarySync(resultHandle: number, chunkSize: number): Uint8Array {
      const r = results.get(resultHandle);
      if (!r) throw new Error("Invalid result handle");
      if (r.getNextChunk) return new Uint8Array(r.getNextChunk(chunkSize));
      return new Uint8Array(0);
    },
    getAllArrowChunksBinaryAsync(resultHandle: number, chunkSize: number): Promise<Uint8Array[]> {
      const chunks: Uint8Array[] = [];
      const r = results.get(resultHandle);
      if (!r) return Promise.reject(new Error("Invalid result handle"));
      if (!r.getNextChunk) return Promise.resolve(chunks);
      for (;;) {
        const buf = r.getNextChunk(chunkSize);
        if (buf.length === 0) break;
        chunks.push(new Uint8Array(buf));
      }
      return Promise.resolve(chunks);
    },
    queryResultCloseSync(resultHandle: number): void {
      const r = results.get(resultHandle);
      if (r?.close) r.close();
      results.delete(resultHandle);
    },
    queryResultGetNumTuplesSync(resultHandle: number): number {
      const r = results.get(resultHandle);
      return r?.getNumTuples?.() ?? 0;
    },
    queryResultGetColumnNamesSync(resultHandle: number): string[] {
      const r = results.get(resultHandle);
      return r?.getColumnNames?.() ?? [];
    },
    queryResultGetColumnDataTypesSync(resultHandle: number): string[] {
      const r = results.get(resultHandle);
      return r?.getColumnDataTypes?.() ?? [];
    },
    queryResultHasNextSync(resultHandle: number): boolean {
      const r = results.get(resultHandle);
      return r?.hasNext?.() ?? false;
    },
    queryResultGetNextRowSync(resultHandle: number): string {
      const r = results.get(resultHandle);
      return r?.getNextRow?.() ?? "";
    },
    getAllArrowChunksAsync(resultHandle: number, _chunkSize: number): Promise<string[]> {
      const r = results.get(resultHandle);
      if (!r) return Promise.reject(new Error("Invalid result handle"));
      const rows: string[] = [];
      while (r.hasNext?.()) {
        rows.push(r.getNextRow?.() ?? "");
      }
      return Promise.resolve(rows);
    },
    getTopology(): NativeTopology {
      return emptyTopology;
    },
  };
}
