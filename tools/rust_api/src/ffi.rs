// cxx bridge: Rust <-> C++ Ladybug. Result path is Arrow only; row API for compatibility.
#![allow(clippy::missing_safety_doc)]
#![allow(dead_code)] // bridge fns used by napi wrappers (008)

#[cxx::bridge(namespace = "lbug")]
mod ffi {
        unsafe extern "C++" {
        include!("cxx/lbug_impl.h");
        include!("ladybug_native/src/ffi.rs.h");
        include!("cxx/lbug_api.h");

        type Database;
        type Connection;
        type QueryResult;
        type PreparedStatement;

        fn new_database(path: &str) -> Result<UniquePtr<Database>>;
        fn database_connect(db: &Database, num_threads: u32) -> Result<UniquePtr<Connection>>;
        fn database_close(db: UniquePtr<Database>);

        fn connection_query(conn: &Connection, statement: &str) -> Result<UniquePtr<QueryResult>>;
        fn connection_prepare(conn: &Connection, statement: &str)
            -> Result<UniquePtr<PreparedStatement>>;
        fn connection_execute(
            conn: &Connection,
            ps: &PreparedStatement,
            params_json: &str,
        ) -> Result<UniquePtr<QueryResult>>;
        fn connection_close(conn: UniquePtr<Connection>);

        fn query_result_has_next(result: &QueryResult) -> bool;
        fn query_result_get_next_row(result: &QueryResult) -> UniquePtr<CxxString>;
        fn query_result_get_num_tuples(result: &QueryResult) -> u64;
        fn query_result_get_num_columns(result: &QueryResult) -> u32;
        fn query_result_column_names(result: &QueryResult) -> Vec<String>;
        fn query_result_column_data_types(result: &QueryResult) -> Vec<String>;
        fn query_result_close(result: UniquePtr<QueryResult>);

        /// Arrow path: schema as JSON string.
        fn query_result_get_arrow_schema(result: &QueryResult) -> String;
        /// Arrow path: next chunk as JSON rows array; empty when no more data.
        fn query_result_get_next_arrow_chunk(result: &QueryResult, chunk_size: u64) -> String;

        /// Arrow IPC: schema as binary (IPC schema message).
        fn query_result_get_arrow_schema_binary(result: &QueryResult) -> Vec<u8>;
        /// Arrow IPC: next chunk as binary (IPC stream: schema + one record batch); empty when no more.
        fn query_result_get_next_arrow_chunk_binary(result: &QueryResult, chunk_size: u64) -> Vec<u8>;

        fn prepared_statement_is_success(ps: &PreparedStatement) -> bool;
        fn prepared_statement_get_error_message(ps: &PreparedStatement) -> String;
    }

    #[namespace = "lbug"]
    extern "Rust" {
        fn arrow_schema_to_ipc(ptr: usize) -> Vec<u8>;
        fn arrow_chunk_to_ipc(schema_ptr: usize, array_ptr: usize) -> Vec<u8>;
    }
}

pub use ffi::*;

pub fn arrow_schema_to_ipc(ptr: usize) -> Vec<u8> {
    crate::arrow_ipc_conv::arrow_schema_to_ipc(ptr)
}
pub fn arrow_chunk_to_ipc(schema_ptr: usize, array_ptr: usize) -> Vec<u8> {
    crate::arrow_ipc_conv::arrow_chunk_to_ipc(schema_ptr, array_ptr)
}
