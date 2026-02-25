// napi-rs + cxx bridge to C++ Ladybug. No stub: requires Ladybug. Default: third_party/ladybug (flat dir).
use std::env;
use std::path::Path;

fn main() {
    napi_build::setup();

    cxx_build::CFG.include_prefix = "ladybug_native";

    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let target = env::var("TARGET").unwrap_or_default();
    let lib_name = if target.contains("windows") { "lbug_shared" } else { "lbug" };

    let (lib_dir, include_dir) = match (
        env::var("LBUG_LIBRARY_DIR").ok().filter(|s| !s.is_empty()),
        env::var("LBUG_INCLUDE_DIR").ok().filter(|s| !s.is_empty()),
        env::var("LADYBUG_ROOT").ok().filter(|s| !s.is_empty()),
    ) {
        (Some(lib), Some(inc), _) => (lib, inc),
        (_, _, Some(root)) => (format!("{}/lib", root), format!("{}/include", root)),
        _ => {
            let default = Path::new(&manifest_dir).join("../../third_party/ladybug");
            let default = default.canonicalize().unwrap_or(default);
            let s = default.to_string_lossy().into_owned();
            // MSVC cl.exe doesn't accept \\?\ prefix; strip it on Windows
            let s = s.strip_prefix(r"\\?\").unwrap_or(s.as_str()).to_string();
            (s.clone(), s)
        }
    };

    let lib_path = Path::new(&lib_dir);
    let include_path = Path::new(&include_dir);
    let has_header = include_path.join("lbug.h").exists() || lib_path.join("lbug.h").exists();
    let has_lib_file = (target.contains("windows") && (lib_path.join("lbug_shared.lib").exists() || lib_path.join("lbug_shared.dll").exists()))
        || (lib_path.join("liblbug.a").exists() || lib_path.join("liblbug.so").exists());

    if !has_header {
        panic!(
            "Ladybug not found. Run from repo root: pnpm run download:ladybug\n\
             Or set LBUG_LIBRARY_DIR and LBUG_INCLUDE_DIR (or LADYBUG_ROOT)."
        );
    }
    if !has_lib_file {
        panic!(
            "Ladybug library not found in {}. Run: pnpm run download:ladybug",
            lib_dir
        );
    }

    let mut build = cxx_build::bridge("src/ffi.rs");
    build.std("c++17");
    build.flag_if_supported("/W3");
    build.flag_if_supported("/EHsc");
    build.include(&manifest_dir);
    build.include(&include_dir);
    build.define("LADYBUG_LINKED", "1");
    build.file("cxx/lbug_rs.cpp");
    build.compile("ladybug_cxx");

    println!("cargo:rerun-if-changed=src/ffi.rs");
    println!("cargo:rerun-if-changed=cxx/lbug_rs.cpp");
    println!("cargo:rerun-if-env-changed=LBUG_LIBRARY_DIR");
    println!("cargo:rerun-if-env-changed=LBUG_INCLUDE_DIR");
    println!("cargo:rerun-if-env-changed=LADYBUG_ROOT");

    println!("cargo:rustc-link-search=native={}", lib_dir);
    println!("cargo:rustc-link-lib={}", lib_name);
}
