import { tableFromIPC } from "apache-arrow";
import type { RecordBatch } from "apache-arrow";
import { getAddon } from "./addon.ts";

const DEFAULT_CHUNK_SIZE = 8192;

/**
 * Wraps addon result handle. Schema and chunks as JSON strings (Arrow schema/chunk representation).
 */
export class QueryResult {
  private _handle: number;
  private _closed = false;

  constructor(resultHandle: number) {
    this._handle = resultHandle;
  }

  get handle(): number {
    return this._handle;
  }

  /** Arrow schema as JSON string. */
  getArrowSchemaSync(): string {
    if (this._closed) throw new Error("QueryResult already closed");
    return getAddon().queryResultGetArrowSchemaSync(this._handle);
  }

  /** Next Arrow chunk as JSON string; empty string when no more data. */
  getNextArrowChunkSync(chunkSize: number = DEFAULT_CHUNK_SIZE): string {
    if (this._closed) throw new Error("QueryResult already closed");
    return getAddon().queryResultGetNextArrowChunkSync(this._handle, chunkSize);
  }

  /** Arrow IPC schema message as binary. */
  getArrowSchemaBinarySync(): Uint8Array {
    if (this._closed) throw new Error("QueryResult already closed");
    const buf = getAddon().queryResultGetArrowSchemaBinarySync(this._handle);
    return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  }

  /** Next Arrow IPC chunk (schema + one record batch); empty when no more data. */
  getNextArrowChunkBinarySync(chunkSize: number = DEFAULT_CHUNK_SIZE): Uint8Array {
    if (this._closed) throw new Error("QueryResult already closed");
    const buf = getAddon().queryResultGetNextArrowChunkBinarySync(this._handle, chunkSize);
    return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  }

  /** Async: all Arrow IPC chunks as binary. */
  async getAllChunksBinaryAsync(chunkSize: number = DEFAULT_CHUNK_SIZE): Promise<Uint8Array[]> {
    if (this._closed) throw new Error("QueryResult already closed");
    const chunks = await getAddon().getAllArrowChunksBinaryAsync(this._handle, chunkSize);
    return chunks.map((c) => (c instanceof Uint8Array ? c : new Uint8Array(c)));
  }

  getNumTuples(): number {
    if (this._closed) throw new Error("QueryResult already closed");
    return getAddon().queryResultGetNumTuplesSync(this._handle);
  }

  getColumnNames(): string[] {
    if (this._closed) throw new Error("QueryResult already closed");
    return getAddon().queryResultGetColumnNamesSync(this._handle);
  }

  getColumnDataTypes(): string[] {
    if (this._closed) throw new Error("QueryResult already closed");
    return getAddon().queryResultGetColumnDataTypesSync(this._handle);
  }

  getQuerySummary(): { numTuples?: number } {
    if (this._closed) throw new Error("QueryResult already closed");
    return { numTuples: this.getNumTuples() };
  }

  /** Row API: whether another row is available. */
  get hasNext(): boolean {
    if (this._closed) throw new Error("QueryResult already closed");
    return getAddon().queryResultHasNextSync(this._handle);
  }

  /** Row API: next row as string (JSON or raw per addon). */
  getNextSync(): string {
    if (this._closed) throw new Error("QueryResult already closed");
    return getAddon().queryResultGetNextRowSync(this._handle);
  }

  /** Row API: collect all rows via getNextSync. */
  getAllSync(): string[] {
    if (this._closed) throw new Error("QueryResult already closed");
    const rows: string[] = [];
    while (getAddon().queryResultHasNextSync(this._handle)) {
      rows.push(getAddon().queryResultGetNextRowSync(this._handle));
    }
    return rows;
  }

  /** Stub: reset row iterator (not in addon yet). */
  resetIterator(): void {
    throw new Error("resetIterator not implemented");
  }

  toString(): string {
    if (this._closed) return "QueryResult(closed)";
    const n = this.getNumTuples();
    const cols = this.getColumnNames();
    return `QueryResult(${n} rows, ${cols.length} cols)`;
  }

  /** Async chunks via sync addon in setImmediate to avoid addon async UTF-8 boundary issue. */
  async getAllChunksAsync(chunkSize: number = DEFAULT_CHUNK_SIZE): Promise<string[]> {
    if (this._closed) throw new Error("QueryResult already closed");
    const addon = getAddon();
    return new Promise((resolve, reject) => {
      const chunks: string[] = [];
      const step = () => {
        setImmediate(() => {
          try {
            const c = addon.queryResultGetNextArrowChunkSync(this._handle, chunkSize);
            if (c === "") {
              resolve(chunks);
              return;
            }
            chunks.push(c);
            step();
          } catch (e) {
            reject(e);
          }
        });
      };
      step();
    });
  }

  /**
   * Async iterable over chunks: uses getAllChunksAsync then yields each chunk.
   */
  async *[Symbol.asyncIterator](): AsyncGenerator<string> {
    const chunks = await this.getAllChunksAsync();
    for (const chunk of chunks) {
      yield chunk;
    }
  }

  /**
   * ReadableStream of chunks (from getAllChunksAsync then iterate).
   */
  toStream(chunkSize: number = DEFAULT_CHUNK_SIZE): ReadableStream<string> {
    return new ReadableStream({
      start: async (controller) => {
        const chunks = await this.getAllChunksAsync(chunkSize);
        for (const c of chunks) {
          controller.enqueue(c);
        }
        controller.close();
      },
    });
  }

  /**
   * Async iterable over Arrow RecordBatches parsed from IPC binary chunks.
   * Each chunk (schema + one record batch) is parsed with apache-arrow; batches are yielded.
   * Enables columnar access without manual parse.
   */
  async *recordBatches(chunkSize: number = DEFAULT_CHUNK_SIZE): AsyncGenerator<RecordBatch> {
    if (this._closed) throw new Error("QueryResult already closed");
    for (;;) {
      const chunk = this.getNextArrowChunkBinarySync(chunkSize);
      if (chunk.length === 0) break;
      const table = tableFromIPC(chunk);
      for (const batch of table.batches) {
        yield batch;
      }
    }
  }

  closeSync(): void {
    if (this._closed) return;
    getAddon().queryResultCloseSync(this._handle);
    this._closed = true;
  }
}
