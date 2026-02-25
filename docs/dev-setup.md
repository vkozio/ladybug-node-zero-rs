# Development setup and toolchain

What you need to build the addon and run the pipeline on Windows. For other OS, adjust package names and paths; toolchain list stays the same.

---

## 1. Toolchain overview

| Layer                 | What                       | Purpose                                                                                |
| --------------------- | -------------------------- | -------------------------------------------------------------------------------------- |
| Node.js               | 18+ (LTS or 24)            | Run pipeline and load .node addon                                                      |
| Rust                  | stable (1.75+ recommended) | Build napi-rs addon                                                                    |
| C++ (Windows)         | MSVC 19.20+ (VS 2022)      | Build Ladybug from source _or_ use prebuilt; napi-rs links with same toolchain as Node |
| CMake                 | 3.15+                      | If building Ladybug from source                                                        |
| Python                | 3.9+                       | If building Ladybug from source (their Makefile)                                       |
| Build utils (Windows) | make, ninja                | If building Ladybug from source                                                        |

The addon itself (Phase 1) only needs **Node + Rust + napi-rs CLI**. C++/CMake/Ladybug are needed once you link the addon to Ladybug (Phase 2–3).

---

## 2. Install steps (Windows)

### 2.1 Node.js

- Install from [nodejs.org](https://nodejs.org/) (LTS or 24).
- Confirm: `node -v`, `npm -v`.

### 2.2 Rust

- Install [rustup](https://rustup.rs/).
- Confirm: `rustc -V`, `cargo -V` (stable, 1.75+).

### 2.3 napi-rs (addon build)

From repo root:

```powershell
npm install
```

This installs `@napi-rs/cli` as devDependency. Build the addon:

```powershell
npm run build:addon
```

Binary and types go to `tools/rust_api/` (e.g. `ladybug-native.win32-x64-msvc.node`, `index.d.ts`).

### 2.4 Optional: C++ and Ladybug (for linking addon to DB)

When you implement the cxx bridge to Ladybug (Phase 2–3), you need one of:

**Option A — Prebuilt Ladybug (recommended)**

- From repo root run: npm run download:ladybug. This downloads the C++ library for your platform into third_party/ladybug/ (see [third_party/ladybug/README.md](third_party/ladybug/README.md)). Binaries are gitignored; only the README is committed.
- Optional env: LADYBUG_VERSION (default v0.14.1), LADYBUG_REPO (default LadybugDB/ladybug), LADYBUG_ASSET (override asset filename).
- After download, third_party/ladybug/ contains the library (e.g. lbug.dll, lbug.lib) and headers (with Arrow). The Rust addon build.rs uses either LADYBUG_ROOT (single root for lib + include) or LBUG_LIBRARY_DIR and LBUG_INCLUDE_DIR.

**Option B — Build Ladybug from source (CMake / lbug-src)**

- [Build from source (Ladybug)](https://docs.ladybugdb.com/developer-guide/): CMake 3.15+, Python 3.9+, C++20 (MSVC 19.20 on Windows).
- Windows: install Visual Studio 2022 with C++ workload, CMake, Windows SDK; then Chocolatey: choco install -y python3 make ninja.
- Open Developer Command Prompt for VS 2022, then from Ladybug repo: make release NUM_THREADS=$env:NUMBER_OF_PROCESSORS.
- Point build.rs at the built lib and include dir (e.g. via LBUG_LIBRARY_DIR and LBUG_INCLUDE_DIR, or LADYBUG_ROOT).

---

## 3. Prebuilt Ladybug: where and how

| Practice   | Choice                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Where      | third_party/ladybug/ (fixed path; addon and scripts assume this)                                                                            |
| In git     | Only third_party/ladybug/README.md; binaries and headers are in .gitignore                                                                  |
| How to get | npm run download:ladybug (calls scripts/download-ladybug.ps1)                                                                               |
| Config     | Version/URL via script defaults plus env: LADYBUG_VERSION, LADYBUG_REPO, LADYBUG_ASSET                                                      |
| Build env  | build.rs uses LADYBUG_ROOT (single root) or LBUG_LIBRARY_DIR and LBUG_INCLUDE_DIR. Run npm run download:ladybug first when linking Ladybug. |

You don’t need to add this download to a Makefile or to the addon’s build step by default: one-time (or per-version) run of `download:ladybug` is enough. Optionally, in CI or a “full setup” script, run `npm run download:ladybug` before `npm run build:addon` when the addon is built with Ladybug linked.

---

## 4. Repo layout and what to build

```
ladybug-node-zero-rs (this repo)
  tools/rust_api/     <- Rust addon (napi-rs). Build here.
  specs/              <- Gherkin acceptance
  docs/               <- Design, this setup
  src/                <- Node/TS pipeline (when added)
```

- **Addon only (Phase 1):** `npm run build:addon` in repo root (runs `napi build` in `tools/rust_api`). Output: `.node` + `.d.ts` under `tools/rust_api/`.
- **With Ladybug linked (later):** set env or config so Rust can find Ladybug lib and includes (see above); same `npm run build:addon`.

---

## 5. Libraries and crates (Rust)

| Crate               | Role                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------ |
| napi, napi-derive   | Node-API bindings, export JS-callable functions                                      |
| napi-build          | build.rs hook for napi-rs                                                            |
| cxx                 | Rust to C++ bridge to Ladybug C++ library; single stack for result path (Arrow only) |
| (later) cc or cmake | Optional: build or link Ladybug from source (lbug-src) inside Rust build             |

No extra Rust libs needed for Phase 1 (placeholder addon).

---

## 6. Async and streaming (addon behavior)

- Blocking work (query, get_next_arrow_chunk, init, close) runs off the main thread: use napi spawn_blocking, napi-rs async worker, or Node worker_threads.
- Streaming: Arrow chunks are produced on a worker or thread pool (get_next_arrow_chunk) and pushed to Node as for-await or ReadableStream; main thread only consumes. See docs/bulk-api-feasibility.md and docs/design-native-bridge.md.

---

## 7. Development workflow

1. **One-time:** Install Node, Rust, run npm install.
2. **Build addon:** npm run build:addon (release) or npm run build:addon:debug.
3. **Load in Node:** From tools/rust_api/ or from root with correct path, require the .node binary (or the generated index.js that loads the right binary).
4. **Acceptance:** Use specs/\*.feature as checklist; wire a BDD runner later if desired.
5. **When you add Ladybug:** Put prebuilt lib and headers in third_party/ladybug/ and extend build.rs with LADYBUG_ROOT or LBUG_LIBRARY_DIR and LBUG_INCLUDE_DIR; or use CMake/FetchContent and link the Ladybug target.

---

## 8. References

- [Ladybug build from source](https://docs.ladybugdb.com/developer-guide/)
- [Ladybug client APIs](https://docs.ladybugdb.com/client-apis/c/)
- [Ladybug installation (prebuilt)](https://docs.ladybugdb.com/installation/)
- [napi-rs getting started](https://napi.rs/docs/introduction/getting-started)
- [napi-rs build](https://napi.rs/docs/cli/build)
