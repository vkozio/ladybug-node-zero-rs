// Native addon: DB handle API only (cxx bridge). All exports are universal (database, connection, query result, topology, etc.). Domain-specific names and use cases belong in the Node/client layer.
#![deny(clippy::all)]

mod arrow_ipc_conv;
mod db_handles;
mod ffi;


// Re-export DB handle API so napi-rs includes it in the addon binary.
pub use db_handles::{
    connection_close_sync, connection_execute_sync, connection_load_arrow_async, connection_load_arrow_sync,
    connection_prepare_sync, connection_query_async, connection_query_sync, database_close_sync,
    database_connect_sync, database_create_async, database_create_sync, get_all_arrow_chunks_async,
    get_all_arrow_chunks_binary_async,
    prepared_statement_close_sync,
    prepared_statement_get_error_message_sync, prepared_statement_is_success_sync,
    query_result_close_sync, query_result_get_arrow_schema_binary_sync, query_result_get_arrow_schema_sync,
    query_result_get_column_data_types_sync, query_result_get_column_names_sync,
    query_result_get_next_arrow_chunk_binary_sync, query_result_get_next_arrow_chunk_sync,
    query_result_get_next_row_sync, query_result_get_num_tuples_sync, query_result_has_next_sync,
};

use napi::bindgen_prelude::Int32Array;
use napi_derive::napi;

#[napi(object)]
pub struct NativeTopology {
    pub sources: Int32Array,
    pub targets: Int32Array,
    pub dictionary: Vec<String>,
}

/// Simple placeholder function used by tests to verify that the addon loads.
#[napi]
pub fn placeholder() -> i32 {
    0
}

/// Temporary stub topology export for zero-copy bridge wiring.
///
/// Returns an empty topology shape; real data will be provided once
/// Ladybug exposes a graph/topology API.
#[napi]
pub fn get_topology() -> NativeTopology {
    let sources_vec: Vec<i32> = Vec::new();
    let targets_vec: Vec<i32> = Vec::new();
    let dictionary: Vec<String> = Vec::new();

    NativeTopology {
        sources: sources_vec.into(),
        targets: targets_vec.into(),
        dictionary,
    }
}
