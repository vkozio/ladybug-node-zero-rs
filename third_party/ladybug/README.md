# Ladybug prebuilt C library

Binaries are **not** committed. Download once with:

```powershell
npm run download:ladybug
```

Or from repo root:

```powershell
./scripts/download-ladybug.ps1
```

**Source:** [vkozio/ladybug](https://github.com/vkozio/ladybug) releases (override with LADYBUG_REPO, e.g. LadybugDB/ladybug).

**Version:** vkozio/ladybug default `v0.14.2-bindings.0`; override with `LADYBUG_VERSION`.  
**Asset (Windows x64):** `liblbug-windows-x86_64.zip`.

After download, this directory contains: `lbug_shared.dll`, `lbug_shared.lib`, `lbug.h`, `lbug.hpp`. The Rust addon’s `build.rs` should use env `LADYBUG_ROOT` or a path relative to the workspace pointing here (Phase 2–3).
