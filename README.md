# ladybug-node-zero-rs

Node.js addon via **napi-rs** (Rust) for [LadybugDB](https://github.com/vkozio/ladybug). Zero-Copy FFI for high-speed access to the graph DB from Node.

- **Core DB:** [vkozio/ladybug](https://github.com/vkozio/ladybug) (C++, in-process)
- **This repo:** addon (`tools/rust_api`), pipeline, docs, specs

- [Dev setup and toolchain](docs/dev-setup.md) — Node, Rust, napi-rs, optional Ladybug build

**Addon binary:** After `pnpm install`, `postinstall` builds the native addon for the current platform; the `.node` file lives in `tools/rust_api/`. If Rust is not installed, install continues and you can run `pnpm run build:addon` later. For npm publish, run `pnpm run build:addon` (or build on each OS in CI) so the package ships prebuilt binaries and consumers do not need Rust.

**pnpm link:** On Windows the addon loads `lbug_shared.dll` at runtime; the DLL must be next to the `.node` file. Postinstall copies it into `tools/rust_api/`. If you already built before that and see "Cannot find native binding", run once: `pnpm run copy:dll`. Then run your app from the project that has `pnpm link ladybug-node-zero-rs`.
