//! Storage abstraction: DB path and file access. Node = std::fs; browser = IndexedDB later.

use std::path::Path;

/// Abstraction for opening a DB at a path and file access.
/// Node impl uses std::fs; browser impl can use IndexedDB/OPFS.
pub trait Storage: Send + Sync {
    /// Returns true if a database exists at the given path (e.g. directory or file exists).
    fn exists(&self, path: &Path) -> bool;

    /// Path is valid for opening or creating a database (e.g. absolute path, or virtual path for browser).
    fn path_for_db(&self, path: &str) -> std::path::PathBuf;
}

#[cfg(feature = "std")]
/// Node/filesystem: use real paths and std::fs.
pub struct StdStorage;

#[cfg(feature = "std")]
impl Storage for StdStorage {
    fn exists(&self, path: &Path) -> bool {
        path.exists()
    }

    fn path_for_db(&self, path: &str) -> std::path::PathBuf {
        path.into()
    }
}
