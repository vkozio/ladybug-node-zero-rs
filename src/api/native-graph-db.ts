import type { Connection } from "./connection.ts";
import type { TopologicalGraph, GraphNodeCursor, Disposable } from "./types.ts";
import { GraphQuery, EdgeQuery } from "./graph-query.ts";
import { GraphNodeCursorImpl } from "./graph-node-cursor.ts";

const NOT_IMPLEMENTED_MSG =
  "Topology must be obtained from Database/Connection (e.g. Cypher/Arrow). Implement on the client or wire adapter to DB.";

const IMPORT_BATCH_SIZE = 500;

export interface GraphTransaction extends Disposable {
  V(label?: string | string[]): GraphQuery;
  E(label?: string | string[]): EdgeQuery;
  commit(): void;
  rollback(): void;
  fetchTopology(): TopologicalGraph;
  fetchCursor(): GraphNodeCursor;
}

class NativeGraphTransaction implements GraphTransaction {
  private readonly db: NativeGraphDB;
  private readonly mode: "read" | "write";

  constructor(db: NativeGraphDB, mode: "read" | "write") {
    this.db = db;
    this.mode = mode;
  }

  V(label?: string | string[]): GraphQuery {
    return this.db.V(label);
  }

  E(label?: string | string[]): EdgeQuery {
    return this.db.E(label);
  }

  fetchTopology(): TopologicalGraph {
    return this.db.V().fetchTopology();
  }

  fetchCursor(): GraphNodeCursor {
    return this.db.V().fetchCursor();
  }

  commit(): void {
    // Transaction semantics not yet wired; placeholder for future Ladybug graph API.
  }

  rollback(): void {
    // Transaction semantics not yet wired.
  }

  [Symbol.dispose](): void {
    this.rollback();
  }
}

function escapeCypherString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * NativeGraphDB: high-level graph adapter API.
 * When constructed with a Connection, importTopology writes edges via Cypher UNWIND.
 */
export class NativeGraphDB {
  private _conn: Connection | null = null;

  constructor(connection?: Connection) {
    this._conn = connection ?? null;
  }

  private ensureConnection(): Connection {
    if (this._conn == null) {
      throw new Error(NOT_IMPLEMENTED_MSG);
    }
    return this._conn;
  }

  readTransaction(): GraphTransaction {
    return new NativeGraphTransaction(this, "read");
  }

  writeTransaction(): GraphTransaction {
    return new NativeGraphTransaction(this, "write");
  }

  /**
   * Fetch current topology snapshot as TopologicalGraph.
   * Implementation derives it from Cypher/Arrow via the underlying Connection.
   */
  fetchTopology(): TopologicalGraph {
    return this.exportTopology([]);
  }

  /**
   * Export graph topology as TopologicalGraph, derived from the underlying DB via Cypher/Arrow.
   * edgeLabels and filterIds are currently accepted but ignored.
   */
  exportTopology(_edgeLabels: string[], _filterIds?: Int32Array): TopologicalGraph {
    const conn = this.ensureConnection();
    const result = conn.querySync("MATCH (a)-[r]->(b) RETURN id(a) AS src, id(b) AS dst");

    const srcIds: number[] = [];
    const dstIds: number[] = [];

    // Use Arrow-style chunk path; each chunk is JSON array of rows.
    for (;;) {
      const chunk = result.getNextArrowChunkSync(1024);
      if (!chunk) break;
      let rows: unknown;
      try {
        rows = JSON.parse(chunk);
      } catch {
        continue;
      }
      if (!Array.isArray(rows)) continue;
      for (const row of rows as any[]) {
        if (!row || typeof row !== "object") continue;
        const src = (row as { src?: unknown }).src;
        const dst = (row as { dst?: unknown }).dst;
        if (typeof src === "number" && typeof dst === "number") {
          srcIds.push(src);
          dstIds.push(dst);
        }
      }
    }

    result.closeSync();

    const idToDense = new Map<number, number>();
    const denseToId: number[] = [];

    const mapId = (id: number): number => {
      let idx = idToDense.get(id);
      if (idx === undefined) {
        idx = denseToId.length;
        idToDense.set(id, idx);
        denseToId.push(id);
      }
      return idx;
    };

    const edgeCount = srcIds.length;
    const sources = new Int32Array(edgeCount);
    const targets = new Int32Array(edgeCount);
    for (let i = 0; i < edgeCount; i++) {
      sources[i] = mapId(srcIds[i]!);
      targets[i] = mapId(dstIds[i]!);
    }

    const edges = new Int32Array(edgeCount * 2);
    for (let i = 0; i < edgeCount; i++) {
      edges[2 * i] = sources[i]!;
      edges[2 * i + 1] = targets[i]!;
    }

    const dictionary = denseToId.map((id) => String(id));

    return {
      nodeCount: dictionary.length,
      edges,
      dictionary,
      sources,
      targets,
    };
  }

  V(label?: string | string[]): GraphQuery {
    const topo = this.exportTopology(Array.isArray(label) ? label : label ? [label] : []);
    return GraphQuery.fromAllNodes(topo);
  }

  E(label?: string | string[]): EdgeQuery {
    const topo = this.exportTopology(Array.isArray(label) ? label : label ? [label] : []);
    const edgeIndices: number[] = [];
    for (let i = 0; i < topo.edges.length; i += 2) {
      edgeIndices.push(i);
    }
    return new EdgeQuery(topo, edgeIndices);
  }

  /**
   * Import topology: bulk create relationships via UNWIND + MATCH + CREATE.
   * Requires NativeGraphDB(connection). Batches edges to avoid huge Cypher strings.
   */
  importTopology(edgeLabel: string, graph: TopologicalGraph): void {
    const conn = this._conn;
    if (conn == null) {
      throw new Error("NativeGraphDB must be constructed with a Connection to use importTopology");
    }
    const dict = graph.dictionary;
    const edges = graph.edges;
    const n = edges.length >> 1;
    if (n === 0) return;
    const labelEscaped = edgeLabel.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
    for (let start = 0; start < n; start += IMPORT_BATCH_SIZE) {
      const end = Math.min(start + IMPORT_BATCH_SIZE, n);
      const parts: string[] = [];
      for (let i = start; i < end; i++) {
        const fromIdx = edges[2 * i]!;
        const toIdx = edges[2 * i + 1]!;
        const fromId = dict[fromIdx] ?? "";
        const toId = dict[toIdx] ?? "";
        parts.push(
          `{ from_id: '${escapeCypherString(fromId)}', to_id: '${escapeCypherString(toId)}' }`,
        );
      }
      const listLiteral = parts.join(", ");
      const cypher = `UNWIND [ ${listLiteral} ] AS row MATCH (a {id: row.from_id}), (b {id: row.to_id}) CREATE (a)-[r:\`${labelEscaped}\`]->(b)`;
      const result = conn.querySync(cypher);
      result.closeSync();
    }
  }

  /**
   * Lazy cursor over node properties over the exported topology.
   * Currently exposes only {id, index} based on the topology dictionary.
   */
  getProperties(ids: Int32Array | string[], _properties?: string[]): GraphNodeCursor {
    const topo = this.exportTopology([]);
    let nodeIndices: Int32Array;
    if (ids instanceof Int32Array) {
      nodeIndices = ids;
    } else {
      const dict = topo.dictionary;
      const indices: number[] = [];
      for (const id of ids) {
        if (typeof id !== "string") continue;
        const idx = dict.indexOf(id);
        if (idx >= 0) indices.push(idx);
      }
      nodeIndices = new Int32Array(indices);
    }
    return new GraphNodeCursorImpl(nodeIndices, topo.dictionary);
  }
}
