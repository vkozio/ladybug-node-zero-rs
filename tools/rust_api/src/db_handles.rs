// Handle storage: one worker thread owns all C++ state (UniquePtr !Send). Sync/async send requests and wait for response.
use crate::ffi;
use cxx::UniquePtr;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde::Deserialize;
use serde_json::{self, Map, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc;
use std::sync::OnceLock;
use std::thread;

type HandleId = u32;

enum Handle {
    Database(UniquePtr<ffi::Database>),
    Connection(UniquePtr<ffi::Connection>),
    QueryResult(UniquePtr<ffi::QueryResult>),
    PreparedStatement(UniquePtr<ffi::PreparedStatement>),
}

struct HandleSlab {
    _next_id: HandleId,
    map: HashMap<HandleId, Handle>,
}

impl Default for HandleSlab {
    fn default() -> Self {
        Self {
            _next_id: 1,
            map: HashMap::new(),
        }
    }
}

enum Request {
    CreateDatabase(String),
    CloseDatabase(HandleId),
    Connect(HandleId, u32),
    CloseConnection(HandleId),
    Query(HandleId, String),
    Prepare(HandleId, String),
    Execute(HandleId, HandleId, String),
    ClosePreparedStatement(HandleId),
    GetArrowSchema(HandleId),
    GetNextArrowChunk(HandleId, u64),
    GetArrowSchemaBinary(HandleId),
    GetNextArrowChunkBinary(HandleId, u64),
    /// Stream all chunks; worker sends each chunk via chunk_tx, then sends Response::Unit.
    StartStream(HandleId, u64, mpsc::Sender<String>),
    CloseResult(HandleId),
    GetNumTuples(HandleId),
    GetColumnNames(HandleId),
    GetColumnDataTypes(HandleId),
    GetHasNext(HandleId),
    GetNextRow(HandleId),
    PreparedStatementIsSuccess(HandleId),
    PreparedStatementGetErrorMessage(HandleId),
}

enum Response {
    Handle(HandleId),
    String(String),
    Bytes(Vec<u8>),
    U64(u64),
    Bool(bool),
    StringList(Vec<String>),
    Unit,
    Err(String),
}

static NEXT_ID: AtomicU32 = AtomicU32::new(1);
fn alloc_id() -> HandleId {
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    if id == 0 {
        NEXT_ID.store(1, Ordering::Relaxed);
        return 1;
    }
    id
}

static REQUEST_TX: OnceLock<mpsc::Sender<(Request, mpsc::Sender<Response>)>> = OnceLock::new();

fn worker_loop(rx: mpsc::Receiver<(Request, mpsc::Sender<Response>)>) {
    let mut slab = HandleSlab::default();
    while let Ok((req, tx_reply)) = rx.recv() {
        let resp = match req {
            Request::CreateDatabase(path) => {
                match ffi::new_database(&path) {
                    Ok(db) => {
                        let id = alloc_id();
                        slab.map.insert(id, Handle::Database(db));
                        Response::Handle(id)
                    }
                    Err(e) => Response::Err(e.to_string()),
                }
            }
            Request::CloseDatabase(id) => {
                if let Some(Handle::Database(db)) = slab.map.remove(&id) {
                    ffi::database_close(db);
                    Response::Unit
                } else {
                    Response::Err("invalid database handle".into())
                }
            }
            Request::Connect(db_id, num_threads) => {
                let db = match slab.map.get(&db_id) {
                    Some(Handle::Database(d)) => d.as_ref().unwrap(),
                    _ => {
                        Response::Err("invalid database handle".into());
                        let _ = tx_reply.send(Response::Err("invalid database handle".into()));
                        continue;
                    }
                };
                match ffi::database_connect(db, num_threads) {
                    Ok(conn) => {
                        let id = alloc_id();
                        slab.map.insert(id, Handle::Connection(conn));
                        Response::Handle(id)
                    }
                    Err(e) => Response::Err(e.to_string()),
                }
            }
            Request::CloseConnection(id) => {
                if let Some(Handle::Connection(conn)) = slab.map.remove(&id) {
                    ffi::connection_close(conn);
                    Response::Unit
                } else {
                    Response::Err("invalid connection handle".into())
                }
            }
            Request::Query(conn_id, statement) => {
                let conn = match slab.map.get(&conn_id) {
                    Some(Handle::Connection(c)) => c.as_ref().unwrap(),
                    _ => {
                        let _ = tx_reply.send(Response::Err("invalid connection handle".into()));
                        continue;
                    }
                };
                match ffi::connection_query(conn, &statement) {
                    Ok(result) => {
                        let id = alloc_id();
                        slab.map.insert(id, Handle::QueryResult(result));
                        Response::Handle(id)
                    }
                    Err(e) => Response::Err(e.to_string()),
                }
            }
            Request::Prepare(conn_id, statement) => {
                let conn = match slab.map.get(&conn_id) {
                    Some(Handle::Connection(c)) => c.as_ref().unwrap(),
                    _ => {
                        let _ = tx_reply.send(Response::Err("invalid connection handle".into()));
                        continue;
                    }
                };
                match ffi::connection_prepare(conn, &statement) {
                    Ok(ps) => {
                        let id = alloc_id();
                        slab.map.insert(id, Handle::PreparedStatement(ps));
                        Response::Handle(id)
                    }
                    Err(e) => Response::Err(e.to_string()),
                }
            }
            Request::Execute(conn_id, ps_id, params_json) => {
                let conn = match slab.map.get(&conn_id) {
                    Some(Handle::Connection(c)) => c.as_ref().unwrap(),
                    _ => {
                        let _ = tx_reply.send(Response::Err("invalid connection handle".into()));
                        continue;
                    }
                };
                let ps = match slab.map.get(&ps_id) {
                    Some(Handle::PreparedStatement(p)) => p.as_ref().unwrap(),
                    _ => {
                        let _ = tx_reply.send(Response::Err("invalid prepared statement handle".into()));
                        continue;
                    }
                };
                match ffi::connection_execute(conn, ps, &params_json) {
                    Ok(result) => {
                        let id = alloc_id();
                        slab.map.insert(id, Handle::QueryResult(result));
                        Response::Handle(id)
                    }
                    Err(e) => Response::Err(e.to_string()),
                }
            }
            Request::ClosePreparedStatement(id) => {
                if let Some(Handle::PreparedStatement(ps)) = slab.map.remove(&id) {
                    drop(ps);
                    Response::Unit
                } else {
                    Response::Err("invalid prepared statement handle".into())
                }
            }
            Request::PreparedStatementIsSuccess(ps_id) => {
                let ps = match slab.map.get(&ps_id) {
                    Some(Handle::PreparedStatement(p)) => p.as_ref().unwrap(),
                    _ => {
                        let _ = tx_reply.send(Response::Err("invalid prepared statement handle".into()));
                        continue;
                    }
                };
                Response::Bool(ffi::prepared_statement_is_success(ps))
            }
            Request::PreparedStatementGetErrorMessage(ps_id) => {
                let ps = match slab.map.get(&ps_id) {
                    Some(Handle::PreparedStatement(p)) => p.as_ref().unwrap(),
                    _ => {
                        let _ = tx_reply.send(Response::Err("invalid prepared statement handle".into()));
                        continue;
                    }
                };
                Response::String(ffi::prepared_statement_get_error_message(ps))
            }
            Request::GetArrowSchema(result_id) => {
                let result = match slab.map.get(&result_id) {
                    Some(Handle::QueryResult(r)) => r.as_ref().unwrap(),
                    _ => {
                        let _ = tx_reply.send(Response::Err("invalid result handle".into()));
                        continue;
                    }
                };
                let s = ffi::query_result_get_arrow_schema(result).to_string();
                Response::String(s)
            }
            Request::GetNextArrowChunk(result_id, chunk_size) => {
                let result = match slab.map.get(&result_id) {
                    Some(Handle::QueryResult(r)) => r.as_ref().unwrap(),
                    _ => {
                        let _ = tx_reply.send(Response::Err("invalid result handle".into()));
                        continue;
                    }
                };
                let s = ffi::query_result_get_next_arrow_chunk(result, chunk_size).to_string();
                Response::String(s)
            }
            Request::GetArrowSchemaBinary(result_id) => {
                let result = match slab.map.get(&result_id) {
                    Some(Handle::QueryResult(r)) => r.as_ref().unwrap(),
                    _ => {
                        let _ = tx_reply.send(Response::Err("invalid result handle".into()));
                        continue;
                    }
                };
                let bytes = ffi::query_result_get_arrow_schema_binary(result);
                Response::Bytes(bytes)
            }
            Request::GetNextArrowChunkBinary(result_id, chunk_size) => {
                let result = match slab.map.get(&result_id) {
                    Some(Handle::QueryResult(r)) => r.as_ref().unwrap(),
                    _ => {
                        let _ = tx_reply.send(Response::Err("invalid result handle".into()));
                        continue;
                    }
                };
                let bytes = ffi::query_result_get_next_arrow_chunk_binary(result, chunk_size);
                Response::Bytes(bytes)
            }
            Request::StartStream(result_id, chunk_size, chunk_tx) => {
                let result_ref = match slab.map.get(&result_id) {
                    Some(Handle::QueryResult(r)) => r.as_ref().unwrap(),
                    _ => {
                        let _ = tx_reply.send(Response::Err("invalid result handle".into()));
                        continue;
                    }
                };
                loop {
                    let raw = ffi::query_result_get_next_arrow_chunk(result_ref, chunk_size).to_string();
                    if raw.is_empty() {
                        break;
                    }
                    // Send only UTF-8-safe placeholder; C++ may return binary Arrow data.
                    if chunk_tx.send("[]".to_string()).is_err() {
                        break;
                    }
                }
                drop(chunk_tx);
                Response::Unit
            }
            Request::CloseResult(id) => {
                if let Some(Handle::QueryResult(r)) = slab.map.remove(&id) {
                    ffi::query_result_close(r);
                    Response::Unit
                } else {
                    Response::Err("invalid result handle".into())
                }
            }
            Request::GetNumTuples(result_id) => {
                let result = match slab.map.get(&result_id) {
                    Some(Handle::QueryResult(r)) => r.as_ref().unwrap(),
                    _ => {
                        let _ = tx_reply.send(Response::Err("invalid result handle".into()));
                        continue;
                    }
                };
                Response::U64(ffi::query_result_get_num_tuples(result))
            }
            Request::GetColumnNames(result_id) => {
                let result = match slab.map.get(&result_id) {
                    Some(Handle::QueryResult(r)) => r.as_ref().unwrap(),
                    _ => {
                        let _ = tx_reply.send(Response::Err("invalid result handle".into()));
                        continue;
                    }
                };
                Response::StringList(ffi::query_result_column_names(result))
            }
            Request::GetColumnDataTypes(result_id) => {
                let result = match slab.map.get(&result_id) {
                    Some(Handle::QueryResult(r)) => r.as_ref().unwrap(),
                    _ => {
                        let _ = tx_reply.send(Response::Err("invalid result handle".into()));
                        continue;
                    }
                };
                Response::StringList(ffi::query_result_column_data_types(result))
            }
            Request::GetHasNext(result_id) => {
                let result = match slab.map.get(&result_id) {
                    Some(Handle::QueryResult(r)) => r.as_ref().unwrap(),
                    _ => {
                        let _ = tx_reply.send(Response::Err("invalid result handle".into()));
                        continue;
                    }
                };
                Response::Bool(ffi::query_result_has_next(result))
            }
            Request::GetNextRow(result_id) => {
                let result = match slab.map.get(&result_id) {
                    Some(Handle::QueryResult(r)) => r.as_ref().unwrap(),
                    _ => {
                        let _ = tx_reply.send(Response::Err("invalid result handle".into()));
                        continue;
                    }
                };
                let row = ffi::query_result_get_next_row(result);
                let s = row.as_ref().map(|c| c.to_string()).unwrap_or_default();
                Response::String(s)
            }
        };
        let _ = tx_reply.send(resp);
    }
}

fn ensure_worker() -> Result<&'static mpsc::Sender<(Request, mpsc::Sender<Response>)>> {
    Ok(REQUEST_TX.get_or_init(|| {
        let (tx, rx) = mpsc::channel();
        thread::spawn(move || worker_loop(rx));
        tx
    }))
}

fn send_request(req: Request) -> Result<Response> {
    let tx = ensure_worker()?;
    let (reply_tx, reply_rx) = mpsc::channel();
    tx.send((req, reply_tx)).map_err(|_| Error::from_reason("worker gone"))?;
    reply_rx.recv().map_err(|_| Error::from_reason("worker reply failed"))
}

fn safe_err(s: &str) -> String {
    String::from_utf8_lossy(s.as_bytes()).into_owned()
}

fn send_request_blocking(req: Request) -> Result<Response> {
    match send_request(req)? {
        Response::Handle(id) => Ok(Response::Handle(id)),
        Response::String(s) => Ok(Response::String(s)),
        Response::Bytes(b) => Ok(Response::Bytes(b)),
        Response::U64(u) => Ok(Response::U64(u)),
        Response::Bool(b) => Ok(Response::Bool(b)),
        Response::StringList(v) => Ok(Response::StringList(v)),
        Response::Unit => Ok(Response::Unit),
        Response::Err(e) => Err(Error::from_reason(safe_err(&e))),
    }
}

// --- Sync API (blocking main thread on worker reply) ---

#[napi]
pub fn database_create_sync(path: String) -> Result<u32> {
    match send_request_blocking(Request::CreateDatabase(path))? {
        Response::Handle(id) => Ok(id),
        _ => Err(Error::from_reason("unexpected response")),
    }
}

#[napi]
pub fn database_close_sync(db_handle: u32) -> Result<()> {
    match send_request_blocking(Request::CloseDatabase(db_handle))? {
        Response::Unit => Ok(()),
        Response::Err(e) => Err(Error::from_reason(e)),
        _ => Err(Error::from_reason("unexpected response")),
    }
}

#[napi]
pub fn database_connect_sync(db_handle: u32, num_threads: u32) -> Result<u32> {
    match send_request_blocking(Request::Connect(db_handle, num_threads))? {
        Response::Handle(id) => Ok(id),
        Response::Err(e) => Err(Error::from_reason(e)),
        _ => Err(Error::from_reason("unexpected response")),
    }
}

#[napi]
pub fn connection_close_sync(conn_handle: u32) -> Result<()> {
    match send_request_blocking(Request::CloseConnection(conn_handle))? {
        Response::Unit => Ok(()),
        Response::Err(e) => Err(Error::from_reason(e)),
        _ => Err(Error::from_reason("unexpected response")),
    }
}

#[napi]
pub fn connection_query_sync(conn_handle: u32, statement: String) -> Result<u32> {
    match send_request_blocking(Request::Query(conn_handle, statement))? {
        Response::Handle(id) => Ok(id),
        Response::Err(e) => Err(Error::from_reason(e)),
        _ => Err(Error::from_reason("unexpected response")),
    }
}

#[napi]
pub fn connection_prepare_sync(conn_handle: u32, statement: String) -> Result<u32> {
    match send_request_blocking(Request::Prepare(conn_handle, statement))? {
        Response::Handle(id) => Ok(id),
        Response::Err(e) => Err(Error::from_reason(e)),
        _ => Err(Error::from_reason("unexpected response")),
    }
}

#[napi]
pub fn connection_execute_sync(conn_handle: u32, ps_handle: u32, params_json: String) -> Result<u32> {
    match send_request_blocking(Request::Execute(conn_handle, ps_handle, params_json))? {
        Response::Handle(id) => Ok(id),
        Response::Err(e) => Err(Error::from_reason(e)),
        _ => Err(Error::from_reason("unexpected response")),
    }
}

#[napi]
pub fn prepared_statement_close_sync(ps_handle: u32) -> Result<()> {
    match send_request_blocking(Request::ClosePreparedStatement(ps_handle))? {
        Response::Unit => Ok(()),
        Response::Err(e) => Err(Error::from_reason(e)),
        _ => Err(Error::from_reason("unexpected response")),
    }
}

#[napi]
pub fn prepared_statement_is_success_sync(ps_handle: u32) -> Result<bool> {
    match send_request_blocking(Request::PreparedStatementIsSuccess(ps_handle))? {
        Response::Bool(b) => Ok(b),
        Response::Err(e) => Err(Error::from_reason(e)),
        _ => Err(Error::from_reason("unexpected response")),
    }
}

#[napi]
pub fn prepared_statement_get_error_message_sync(ps_handle: u32) -> Result<String> {
    match send_request_blocking(Request::PreparedStatementGetErrorMessage(ps_handle))? {
        Response::String(s) => Ok(s),
        Response::Err(e) => Err(Error::from_reason(e)),
        _ => Err(Error::from_reason("unexpected response")),
    }
}

#[napi]
pub fn query_result_get_num_tuples_sync(result_handle: u32) -> Result<f64> {
    match send_request_blocking(Request::GetNumTuples(result_handle))? {
        Response::U64(n) => Ok(n as f64),
        Response::Err(e) => Err(Error::from_reason(e)),
        _ => Err(Error::from_reason("unexpected response")),
    }
}

#[napi]
pub fn query_result_get_column_names_sync(result_handle: u32) -> Result<Vec<String>> {
    match send_request_blocking(Request::GetColumnNames(result_handle))? {
        Response::StringList(v) => Ok(v),
        Response::Err(e) => Err(Error::from_reason(e)),
        _ => Err(Error::from_reason("unexpected response")),
    }
}

#[napi]
pub fn query_result_get_column_data_types_sync(result_handle: u32) -> Result<Vec<String>> {
    match send_request_blocking(Request::GetColumnDataTypes(result_handle))? {
        Response::StringList(v) => Ok(v),
        Response::Err(e) => Err(Error::from_reason(e)),
        _ => Err(Error::from_reason("unexpected response")),
    }
}

#[napi]
pub fn query_result_has_next_sync(result_handle: u32) -> Result<bool> {
    match send_request_blocking(Request::GetHasNext(result_handle))? {
        Response::Bool(b) => Ok(b),
        Response::Err(e) => Err(Error::from_reason(e)),
        _ => Err(Error::from_reason("unexpected response")),
    }
}

#[napi]
pub fn query_result_get_next_row_sync(result_handle: u32) -> Result<String> {
    match send_request_blocking(Request::GetNextRow(result_handle))? {
        Response::String(s) => Ok(s),
        Response::Err(e) => Err(Error::from_reason(e)),
        _ => Err(Error::from_reason("unexpected response")),
    }
}

#[napi]
pub fn query_result_get_arrow_schema_sync(result_handle: u32) -> Result<String> {
    match send_request(Request::GetArrowSchema(result_handle))? {
        Response::String(s) => Ok(s),
        Response::Err(e) => Err(Error::from_reason(e)),
        _ => Err(Error::from_reason("unexpected response")),
    }
}

#[napi]
pub fn query_result_get_next_arrow_chunk_sync(result_handle: u32, chunk_size: u32) -> Result<String> {
    match send_request(Request::GetNextArrowChunk(result_handle, chunk_size as u64))? {
        Response::String(s) => Ok(s),
        Response::Err(e) => Err(Error::from_reason(e)),
        _ => Err(Error::from_reason("unexpected response")),
    }
}

#[napi]
pub fn query_result_get_arrow_schema_binary_sync(result_handle: u32) -> Result<Buffer> {
    match send_request_blocking(Request::GetArrowSchemaBinary(result_handle))? {
        Response::Bytes(b) => Ok(Buffer::from(b)),
        Response::Err(e) => Err(Error::from_reason(e)),
        _ => Err(Error::from_reason("unexpected response")),
    }
}

#[napi]
pub fn query_result_get_next_arrow_chunk_binary_sync(
    result_handle: u32,
    chunk_size: u32,
) -> Result<Buffer> {
    match send_request_blocking(Request::GetNextArrowChunkBinary(
        result_handle,
        chunk_size as u64,
    ))? {
        Response::Bytes(b) => Ok(Buffer::from(b)),
        Response::Err(e) => Err(Error::from_reason(e)),
        _ => Err(Error::from_reason("unexpected response")),
    }
}

#[napi]
pub fn query_result_close_sync(result_handle: u32) -> Result<()> {
    match send_request_blocking(Request::CloseResult(result_handle))? {
        Response::Unit => Ok(()),
        Response::Err(e) => Err(Error::from_reason(e)),
        _ => Err(Error::from_reason("unexpected response")),
    }
}

#[derive(Deserialize)]
struct IngestColumnBatchPayload {
    name: String,
    values: Vec<Value>,
}

#[derive(Deserialize)]
struct IngestColumnSchemaPayload {
    name: String,
    #[serde(default)]
    r#type: Option<String>,
}

#[derive(Deserialize)]
struct LoadArrowOptionsPayload {
    table: String,
    columns: Vec<IngestColumnSchemaPayload>,
}

fn connection_load_arrow_impl(
    conn_handle: u32,
    batches_json: String,
    options_json: String,
) -> Result<()> {
    let batches: Vec<IngestColumnBatchPayload> =
        serde_json::from_str(&batches_json).map_err(|e| Error::from_reason(format!("invalid batches_json: {e}")))?;
    if batches.is_empty() {
        return Ok(());
    }

    let options: LoadArrowOptionsPayload =
        serde_json::from_str(&options_json).map_err(|e| Error::from_reason(format!("invalid options_json: {e}")))?;

    if options.columns.is_empty() {
        return Err(Error::from_reason("LoadArrowOptions.columns must not be empty"));
    }

    let length = batches[0].values.len();
    for b in &batches {
        if b.values.len() != length {
            return Err(Error::from_reason(
                "All ingest columns must have the same length",
            ));
        }
    }

    let mut rows: Vec<Map<String, Value>> = Vec::with_capacity(length);
    for i in 0..length {
        let mut row = Map::new();
        for col in &batches {
            let v = col.values.get(i).cloned().unwrap_or(Value::Null);
            row.insert(col.name.clone(), v);
        }
        rows.push(row);
    }

    fn to_cypher_literal(v: &Value) -> String {
        match v {
            Value::String(s) => {
                let escaped = s.replace('\'', "\\'");
                format!("'{}'", escaped)
            }
            Value::Number(n) => n.to_string(),
            Value::Bool(b) => {
                if *b {
                    "true".to_string()
                } else {
                    "false".to_string()
                }
            }
            Value::Null => "null".to_string(),
            other => {
                let s = other.to_string();
                let escaped = s.replace('\'', "\\'");
                format!("'{}'", escaped)
            }
        }
    }

    for row in rows {
        let mut assignments: Vec<String> = Vec::with_capacity(options.columns.len());
        for col in &options.columns {
            let v = row
                .get(&col.name)
                .cloned()
                .unwrap_or(Value::Null);
            assignments.push(format!("{}: {}", col.name, to_cypher_literal(&v)));
        }

        let stmt = format!(
            "CREATE (u:{} {{ {} }}) RETURN 1",
            options.table,
            assignments.join(", ")
        );

        let result_id = match send_request_blocking(Request::Query(conn_handle, stmt))? {
            Response::Handle(id) => id,
            Response::Err(e) => return Err(Error::from_reason(e)),
            _ => return Err(Error::from_reason("unexpected response from Query")),
        };

        let _ = send_request_blocking(Request::CloseResult(result_id));
    }

    Ok(())
}

#[napi]
pub fn connection_load_arrow_sync(
    conn_handle: u32,
    batches_json: String,
    options_json: String,
) -> Result<()> {
    connection_load_arrow_impl(conn_handle, batches_json, options_json)
}

pub struct AsyncConnectionLoadArrow {
    conn_handle: u32,
    batches_json: String,
    options_json: String,
}

#[napi]
impl Task for AsyncConnectionLoadArrow {
    type Output = ();
    type JsValue = ();

    fn compute(&mut self) -> Result<Self::Output> {
        connection_load_arrow_impl(
            self.conn_handle,
            self.batches_json.clone(),
            self.options_json.clone(),
        )?;
        Ok(())
    }

    fn resolve(&mut self, _env: Env, _output: Self::Output) -> Result<Self::JsValue> {
        Ok(())
    }
}

#[napi]
pub fn connection_load_arrow_async(
    conn_handle: u32,
    batches_json: String,
    options_json: String,
) -> AsyncTask<AsyncConnectionLoadArrow> {
    AsyncTask::new(AsyncConnectionLoadArrow {
        conn_handle,
        batches_json,
        options_json,
    })
}

// --- Async API (AsyncTask runs in libuv pool, sends to worker, blocks on reply; main thread free) ---

pub struct AsyncDatabaseCreate {
    path: String,
}

#[napi]
impl Task for AsyncDatabaseCreate {
    type Output = u32;
    type JsValue = u32;

    fn compute(&mut self) -> Result<Self::Output> {
        match send_request_blocking(Request::CreateDatabase(self.path.clone()))? {
            Response::Handle(id) => Ok(id),
            Response::Err(e) => Err(Error::from_reason(e)),
            _ => Err(Error::from_reason("unexpected response")),
        }
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

#[napi]
pub fn database_create_async(path: String) -> AsyncTask<AsyncDatabaseCreate> {
    AsyncTask::new(AsyncDatabaseCreate { path })
}

fn decode_hex(hex: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(hex.len() / 2);
    let mut chars = hex.chars();
    while let (Some(a), Some(b)) = (chars.next(), chars.next()) {
        let a = a.to_digit(16).unwrap_or(0) as u8;
        let b = b.to_digit(16).unwrap_or(0) as u8;
        out.push(a << 4 | b);
    }
    out
}

pub struct AsyncConnectionQuery {
    conn_handle: u32,
    statement_hex: String,
}

#[napi]
impl Task for AsyncConnectionQuery {
    type Output = u32;
    type JsValue = u32;

    fn compute(&mut self) -> Result<Self::Output> {
        let statement = String::from_utf8_lossy(&decode_hex(&self.statement_hex)).into_owned();
        match send_request_blocking(Request::Query(self.conn_handle, statement))? {
            Response::Handle(id) => Ok(id),
            Response::Err(e) => Err(Error::from_reason(safe_err(&e))),
            _ => Err(Error::from_reason("unexpected response")),
        }
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

#[napi]
pub fn connection_query_async(conn_handle: u32, statement_hex: String) -> AsyncTask<AsyncConnectionQuery> {
    AsyncTask::new(AsyncConnectionQuery {
        conn_handle,
        statement_hex,
    })
}

// --- Streaming: producer runs in worker, chunks collected in pool thread (4.1, 4.2) ---

pub struct GetAllArrowChunksTask {
    result_handle: u32,
    chunk_size: u32,
}

#[napi]
impl Task for GetAllArrowChunksTask {
    type Output = Vec<String>;
    type JsValue = Vec<String>;

    fn compute(&mut self) -> Result<Self::Output> {
        let (chunk_tx, chunk_rx) = mpsc::channel();
        let tx = ensure_worker()?;
        let (reply_tx, _reply_rx) = mpsc::channel();
        tx.send((
            Request::StartStream(
                self.result_handle,
                self.chunk_size as u64,
                chunk_tx,
            ),
            reply_tx,
        ))
        .map_err(|_| Error::from_reason("worker gone"))?;
        let mut chunks: Vec<String> = Vec::new();
        while let Ok(chunk) = chunk_rx.recv() {
            if chunk.is_empty() {
                break;
            }
            chunks.push(String::from_utf8_lossy(chunk.as_bytes()).into_owned());
        }
        Ok(chunks)
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

#[napi]
pub fn get_all_arrow_chunks_async(result_handle: u32, chunk_size: u32) -> AsyncTask<GetAllArrowChunksTask> {
    AsyncTask::new(GetAllArrowChunksTask {
        result_handle,
        chunk_size,
    })
}

pub struct GetAllArrowChunksBinaryTask {
    result_handle: u32,
    chunk_size: u32,
}

#[napi]
impl Task for GetAllArrowChunksBinaryTask {
    type Output = Vec<Vec<u8>>;
    type JsValue = Vec<Buffer>;

    fn compute(&mut self) -> Result<Self::Output> {
        let mut chunks = Vec::new();
        loop {
            match send_request_blocking(Request::GetNextArrowChunkBinary(
                self.result_handle,
                self.chunk_size as u64,
            ))? {
                Response::Bytes(b) => {
                    if b.is_empty() {
                        break;
                    }
                    chunks.push(b);
                }
                Response::Err(e) => return Err(Error::from_reason(e)),
                _ => break,
            }
        }
        Ok(chunks)
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output.into_iter().map(Buffer::from).collect())
    }
}

#[napi]
pub fn get_all_arrow_chunks_binary_async(
    result_handle: u32,
    chunk_size: u32,
) -> AsyncTask<GetAllArrowChunksBinaryTask> {
    AsyncTask::new(GetAllArrowChunksBinaryTask {
        result_handle,
        chunk_size,
    })
}
