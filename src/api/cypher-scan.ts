/**
 * Safe Cypher identifier handling for scan APIs. Rejects or escapes input to prevent injection.
 */

const SAFE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function assertSafeIdentifier(name: string, kind: string): void {
  if (typeof name !== "string" || name.length === 0) {
    throw new Error(`Invalid ${kind}: must be a non-empty string`);
  }
  if (!SAFE_IDENT.test(name)) {
    throw new Error(`Invalid ${kind}: "${name}" must match [A-Za-z_][A-Za-z0-9_]*`);
  }
}

export function assertSafeIdentifiers(names: string[], kind: string): void {
  for (const n of names) {
    assertSafeIdentifier(n, kind);
  }
}

/** Build MATCH (n:Label) RETURN n.col1, n.col2, ... with safe identifiers. */
export function buildScanNodeTableCypher(nodeLabel: string, columns: string[]): string {
  assertSafeIdentifier(nodeLabel, "node label");
  assertSafeIdentifiers(columns, "column");
  if (columns.length === 0) {
    throw new Error("At least one column is required");
  }
  const returns = columns.map((c) => `n.${c}`).join(", ");
  return `MATCH (n:${nodeLabel}) RETURN ${returns}`;
}

const DEFAULT_REL_COLUMNS = ["source", "target"];

/** Build MATCH (a)-[r:RelType]->(b) RETURN ... with safe identifiers. Default: source, target (e.g. id(a), id(b) or a/b props). */
export function buildScanRelCypher(relType: string, columns?: string[]): string {
  assertSafeIdentifier(relType, "relationship type");
  const cols = columns?.length ? columns : DEFAULT_REL_COLUMNS;
  assertSafeIdentifiers(cols, "column");
  const returns = cols
    .map((c) => {
      if (c === "source") return "id(a) AS source";
      if (c === "target") return "id(b) AS target";
      if (c.startsWith("a.")) return c;
      if (c.startsWith("b.")) return c;
      if (c.startsWith("r.")) return c;
      return `r.${c}`;
    })
    .join(", ");
  return `MATCH (a)-[r:${relType}]->(b) RETURN ${returns}`;
}

/**
 * Build one Cypher with UNION of MATCH (a)-[r:RelType]->(b) RETURN ... for each rel type.
 * Same column list for all segments (required for UNION). Ladybug Cypher must support UNION.
 */
export function buildScanRelsCypher(relTypes: string[], columns?: string[]): string {
  if (relTypes.length === 0) throw new Error("At least one relationship type is required");
  for (const t of relTypes) assertSafeIdentifier(t, "relationship type");
  const cols = columns?.length ? columns : DEFAULT_REL_COLUMNS;
  assertSafeIdentifiers(cols, "column");
  const returns = cols
    .map((c) => {
      if (c === "source") return "id(a) AS source";
      if (c === "target") return "id(b) AS target";
      if (c.startsWith("a.")) return c;
      if (c.startsWith("b.")) return c;
      if (c.startsWith("r.")) return c;
      return `r.${c}`;
    })
    .join(", ");
  const parts = relTypes.map((t) => `MATCH (a)-[r:${t}]->(b) RETURN ${returns}`);
  return parts.join(" UNION ");
}
