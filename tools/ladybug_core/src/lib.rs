//! Rust core for Ladybug: Database, Connection, QueryResult over lbug crate; Arrow IPC output.
//! Native only (lbug uses cxx/cmake); WASM path uses lbug-wasm (npm).

mod storage;

pub use storage::Storage;

#[cfg(feature = "std")]
pub use storage::StdStorage;

pub mod db;
pub use db::CoreError;
