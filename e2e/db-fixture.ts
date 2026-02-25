/**
 * E2E fixture: create Ladybug DB (in-memory by default), run DDL and insert fixture data.
 * Use in test.before(); if DB/create fails, the suite fails (no skip).
 * No temp files: Ladybug supports :memory: for in-memory DB.
 */
import {
  Database,
  Connection,
  type IngestColumnBatch,
  type LoadArrowOptions,
} from "../src/api/index.ts";

const DDL = [
  "CREATE NODE TABLE User(name STRING PRIMARY KEY, age INT64)",
  "CREATE REL TABLE Follows(FROM User TO User, since INT64)",
] as const;

/** Run schema + fixture data on an open connection. */
export function runSchemaAndFixture(conn: Connection): void {
  for (const stmt of DDL) {
    const r = conn.querySync(stmt);
    r.closeSync();
  }

  // Bulk ingest Users via loadArrow-style API.
  const userBatches: IngestColumnBatch[] = [
    { name: "name", values: ["A", "B", "C", "D"] },
    { name: "age", values: [1, 2, 3, 4] },
  ];
  const userOptions: LoadArrowOptions = {
    table: "User",
    columns: [
      { name: "name", type: "STRING" },
      { name: "age", type: "INT64" },
    ],
  };
  conn.loadArrowSync(userBatches, userOptions);

  // Edges still loaded via Cypher for now.
  const edgeInserts = [
    "MATCH (u1:User), (u2:User) WHERE u1.name = 'A' AND u2.name = 'B' CREATE (u1)-[:Follows {since: 2020}]->(u2)",
    "MATCH (u1:User), (u2:User) WHERE u1.name = 'B' AND u2.name = 'C' CREATE (u1)-[:Follows {since: 2021}]->(u2)",
    "MATCH (u1:User), (u2:User) WHERE u1.name = 'C' AND u2.name = 'D' CREATE (u1)-[:Follows {since: 2022}]->(u2)",
  ] as const;
  for (const stmt of edgeInserts) {
    const r = conn.querySync(stmt);
    r.closeSync();
  }
}

export interface DbFixture {
  db: Database;
  conn: Connection;
  dbPath: string;
}

/**
 * Create a new DB, open connection, run DDL and fixture data.
 * Default :memory: — no file on disk; data loaded via Cypher on the connection.
 * Throws if addon/DB unavailable (no skip).
 */
export function createDbWithFixture(dbPath: string = ":memory:"): DbFixture {
  const db = new Database(dbPath);
  db.initSync();
  const conn = new Connection(db, 1);
  conn.initSync();
  runSchemaAndFixture(conn);
  return { db, conn, dbPath };
}

/** Open an existing DB (no DDL). Use after closing a fixture to reuse the same path. */
export function openExistingDb(dbPath: string): DbFixture {
  const db = new Database(dbPath);
  db.initSync();
  const conn = new Connection(db, 1);
  conn.initSync();
  return { db, conn, dbPath };
}
