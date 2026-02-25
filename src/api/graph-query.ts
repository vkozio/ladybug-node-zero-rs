import type { TopologicalGraph, GraphNodeCursor } from "./types.ts";
import { GraphNodeCursorImpl } from "./graph-node-cursor.ts";

export class GraphQuery {
  private readonly topology: TopologicalGraph;
  private readonly nodeIds: Set<number>;

  constructor(topology: TopologicalGraph, nodeIds: Set<number>) {
    this.topology = topology;
    this.nodeIds = nodeIds;
  }

  static fromAllNodes(topology: TopologicalGraph): GraphQuery {
    const ids = new Set<number>();
    for (let i = 0; i < topology.nodeCount; i++) {
      ids.add(i);
    }
    return new GraphQuery(topology, ids);
  }

  /** Filter by property. Only "id" is supported (mapping-backed); others no-op. */
  has(propertyKey: string, value: unknown): GraphQuery {
    if (propertyKey !== "id") return this;
    if (typeof value !== "string") return this;
    const dict = this.topology.dictionary;
    const val = value;
    const next = new Set<number>();
    for (const i of this.nodeIds) {
      if (dict[i] === val) next.add(i);
    }
    return new GraphQuery(this.topology, next);
  }

  /** Exclude nodes that have the property. Only "id" supported; exclude where dictionary[i] === value. No value: exclude nodes with that key (no-op for id). */
  hasNot(propertyKey: string, value?: unknown): GraphQuery {
    if (propertyKey !== "id") return this;
    if (value === undefined) return this;
    if (typeof value !== "string") return this;
    const dict = this.topology.dictionary;
    const val = value;
    const next = new Set<number>();
    for (const i of this.nodeIds) {
      if (dict[i] !== val) next.add(i);
    }
    return new GraphQuery(this.topology, next);
  }

  /** Filter where property in values. Only "id" supported. */
  hasIn(propertyKey: string, values: unknown[]): GraphQuery {
    if (propertyKey !== "id") return this;
    const set = new Set(values.filter((v): v is string => typeof v === "string"));
    const dict = this.topology.dictionary;
    const next = new Set<number>();
    for (const i of this.nodeIds) {
      if (set.has(dict[i])) next.add(i);
    }
    return new GraphQuery(this.topology, next);
  }

  /** No-op: node labels not in mapping topology. */
  hasLabel(_label: string | string[]): GraphQuery {
    return this;
  }

  out(_edgeLabel?: string | string[]): GraphQuery {
    const edges = this.topology.edges;
    const next = new Set<number>();
    for (let i = 0; i < edges.length; i += 2) {
      const from = edges[i];
      const to = edges[i + 1];
      if (this.nodeIds.has(from)) {
        next.add(to);
      }
    }
    return new GraphQuery(this.topology, next);
  }

  in(_edgeLabel?: string | string[]): GraphQuery {
    const edges = this.topology.edges;
    const next = new Set<number>();
    for (let i = 0; i < edges.length; i += 2) {
      const from = edges[i];
      const to = edges[i + 1];
      if (this.nodeIds.has(to)) {
        next.add(from);
      }
    }
    return new GraphQuery(this.topology, next);
  }

  both(edgeLabel?: string | string[]): GraphQuery {
    const outQ = this.out(edgeLabel);
    const inQ = this.in(edgeLabel);
    const next = new Set<number>();
    for (const id of outQ.nodeIds) next.add(id);
    for (const id of inQ.nodeIds) next.add(id);
    return new GraphQuery(this.topology, next);
  }

  outE(_edgeLabel?: string | string[]): EdgeQuery {
    const edges = this.topology.edges;
    const selected: number[] = [];
    for (let i = 0; i < edges.length; i += 2) {
      const from = edges[i];
      if (this.nodeIds.has(from)) {
        selected.push(i);
      }
    }
    return new EdgeQuery(this.topology, selected);
  }

  inE(_edgeLabel?: string | string[]): EdgeQuery {
    const edges = this.topology.edges;
    const selected: number[] = [];
    for (let i = 0; i < edges.length; i += 2) {
      const to = edges[i + 1];
      if (this.nodeIds.has(to)) {
        selected.push(i);
      }
    }
    return new EdgeQuery(this.topology, selected);
  }

  bothE(edgeLabel?: string | string[]): EdgeQuery {
    const out = this.outE(edgeLabel);
    const incoming = this.inE(edgeLabel);
    const seen = new Set<number>(out.edgeIndices);
    const combined: number[] = [...out.edgeIndices];
    for (const idx of incoming.edgeIndices) {
      if (!seen.has(idx)) {
        seen.add(idx);
        combined.push(idx);
      }
    }
    return new EdgeQuery(this.topology, combined);
  }

  fetchTopology(): TopologicalGraph {
    const edges = this.topology.edges;
    const filtered: number[] = [];
    for (let i = 0; i < edges.length; i += 2) {
      const from = edges[i];
      const to = edges[i + 1];
      if (this.nodeIds.has(from) || this.nodeIds.has(to)) {
        filtered.push(from, to);
      }
    }
    return {
      nodeCount: this.topology.nodeCount,
      edges: new Int32Array(filtered),
      dictionary: this.topology.dictionary,
      edgeTypes: this.topology.edgeTypes,
    };
  }

  fetchIds(): Int32Array {
    return new Int32Array(this.nodeIds);
  }

  fetchCursor(): GraphNodeCursor {
    return new GraphNodeCursorImpl(this.fetchIds(), this.topology.dictionary);
  }
}

export class EdgeQuery {
  readonly edgeIndices: number[];
  private readonly topology: TopologicalGraph;

  constructor(topology: TopologicalGraph, edgeIndices: number[]) {
    this.topology = topology;
    this.edgeIndices = edgeIndices;
  }

  has(propertyKey: string, value: unknown): EdgeQuery {
    if (propertyKey !== "id" || typeof value !== "string") {
      return this;
    }
    const dict = this.topology.dictionary;
    const filtered: number[] = [];
    const edges = this.topology.edges;
    const targetId = value;
    for (const idx of this.edgeIndices) {
      const from = edges[idx];
      const to = edges[idx + 1];
      if (dict[from] === targetId || dict[to] === targetId) {
        filtered.push(idx);
      }
    }
    return new EdgeQuery(this.topology, filtered);
  }

  outV(): GraphQuery {
    const edges = this.topology.edges;
    const nodes = new Set<number>();
    for (const idx of this.edgeIndices) {
      const to = edges[idx + 1];
      nodes.add(to);
    }
    return new GraphQuery(this.topology, nodes);
  }

  inV(): GraphQuery {
    const edges = this.topology.edges;
    const nodes = new Set<number>();
    for (const idx of this.edgeIndices) {
      const from = edges[idx];
      nodes.add(from);
    }
    return new GraphQuery(this.topology, nodes);
  }

  otherV(): GraphQuery {
    const edges = this.topology.edges;
    const nodes = new Set<number>();
    for (const idx of this.edgeIndices) {
      nodes.add(edges[idx]);
      nodes.add(edges[idx + 1]);
    }
    return new GraphQuery(this.topology, nodes);
  }

  fetchTopology(): TopologicalGraph {
    const edges = this.topology.edges;
    const flat: number[] = [];
    for (const idx of this.edgeIndices) {
      flat.push(edges[idx], edges[idx + 1]);
    }
    return {
      nodeCount: this.topology.nodeCount,
      edges: new Int32Array(flat),
      dictionary: this.topology.dictionary,
      edgeTypes: this.topology.edgeTypes,
    };
  }

  fetchCursor(): GraphNodeCursor {
    const nodeIds = new Set<number>();
    const edges = this.topology.edges;
    for (const idx of this.edgeIndices) {
      nodeIds.add(edges[idx]);
      nodeIds.add(edges[idx + 1]);
    }
    return new GraphNodeCursorImpl(new Int32Array(nodeIds), this.topology.dictionary);
  }
}
