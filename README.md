# ladybug-node-zero-rs

Node.js addon (napi-rs, Rust) for LadybugDB. initially based on [@vkozio](https://github.com/vkozio/ladybug) fork. 

**Cypher queries**, **Arrow results**, and a fluent **graph API** with zero-copy topology. In-process, no network.

**Quick start**

```ts
import { createPool } from "ladybug-node-zero-rs";

const pool = createPool({ databasePath: "example.lbug", maxSize: 4 });
await pool.initAsync();

const value = await pool.runAsync(async (conn) => {
  const result = await conn.queryAsync("RETURN 1 AS value");
  const all = result.getAllSync();
  result.closeSync();
  return all;
});

console.log(value);
pool.closeSync();
```

**What you get**

- **Low-level:** `Database`, `Connection`, `QueryResult`, `Pool` — Cypher, prepared statements, Arrow schema + binary chunks, bulk ingest (`loadArrowSync` / `loadArrowAsync`).
- **Graph:** `NativeGraphDB` — `exportTopology` / `importTopology`, fluent `V()` / `E()` queries, `GraphTransaction`, `GraphNodeCursor`.
- **Async:** Heavy work (query, init, loadArrow) runs off the main thread; sync APIs are explicitly blocking.

Full API: [docs/api.md](docs/api.md).

---

**Addon build:** `npm install` runs postinstall and builds the native addon in `tools/rust_api/`. No Rust? Install continues; run `npm run build:addon` when ready. For publish, build on target OS (or use CI prebuilds) so consumers get binaries.

**Windows + npm link:** Addon loads `lbug_shared.dll` from `tools/rust_api/`. If you see "Cannot find native binding" after linking, run once: `npm run copy:dll`. Then run your app from the project that has `npm link ladybug-node-zero-rs`.

- [Dev setup and toolchain](docs/dev-setup.md) — Node, Rust, napi-rs, optional Ladybug build
