/**
 * Browser demo: init WASM, create DB, run query. Uses in-memory FS (default lbug-wasm/sync).
 */
import { initAddon, Database, Connection } from "../../src/api/index-browser.ts";

const out = document.getElementById("out") as HTMLPreElement;

async function run(): Promise<void> {
  try {
    out.textContent = "Initializing WASM…";
    await initAddon();
    out.textContent = "Creating database (in-memory)…";
    const db = new Database("/mem/db");
    db.initSync();
    const conn = new Connection(db);
    conn.initSync();
    out.textContent = "Running: CREATE (n:Node {id: 1}) RETURN n.id AS id";
    const result = conn.querySync("CREATE (n:Node {id: 1}) RETURN n.id AS id");
    const rows = result.getAllSync();
    result.closeSync();
    conn.closeSync();
    db.closeSync();
    out.textContent = `Done. Rows: ${rows.join(", ") || "(none)"}`;
  } catch (e) {
    out.textContent = `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

run();
