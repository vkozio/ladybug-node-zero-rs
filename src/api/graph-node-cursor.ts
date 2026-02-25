import type { GraphNodeCursor } from "./types.ts";

/**
 * Mapping-backed implementation of GraphNodeCursor.
 * Yields rows with id (original string from dictionary) and index (dense NodeID).
 * No real property store yet; properties parameter is ignored.
 */
export class GraphNodeCursorImpl implements GraphNodeCursor {
  private readonly ids: Int32Array;
  private readonly dictionary: string[];
  private offset = 0;
  private closed = false;

  constructor(ids: Int32Array, dictionary: string[]) {
    this.ids = ids;
    this.dictionary = dictionary;
  }

  nextBatch(batchSize: number): Record<string, unknown>[] {
    if (this.closed || batchSize <= 0) return [];
    const end = Math.min(this.offset + batchSize, this.ids.length);
    const out: Record<string, unknown>[] = [];
    for (let i = this.offset; i < end; i++) {
      const idx = this.ids[i];
      out.push({
        id: this.dictionary[idx] ?? String(idx),
        index: idx,
      });
    }
    this.offset = end;
    return out;
  }

  async *stream(): AsyncIterable<Record<string, unknown>> {
    const batchSize = 256;
    let batch: Record<string, unknown>[];
    do {
      batch = this.nextBatch(batchSize);
      for (const row of batch) yield row;
    } while (batch.length > 0);
  }

  close(): void {
    this.closed = true;
  }

  [Symbol.dispose](): void {
    this.close();
  }
}
