//! Database, Connection, QueryResult API over lbug; Arrow IPC bytes output.

use arrow_ipc::writer::StreamWriter;
use lbug::{Connection, Database, Error as LbugError, QueryResult, SystemConfig};
use std::io::Cursor;

/// Error from DB or Arrow IPC operations.
#[derive(Debug)]
pub enum CoreError {
    Lbug(LbugError),
    Arrow(String),
}

impl std::fmt::Display for CoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CoreError::Lbug(e) => write!(f, "{}", e),
            CoreError::Arrow(e) => write!(f, "arrow: {}", e),
        }
    }
}

impl std::error::Error for CoreError {}

impl From<LbugError> for CoreError {
    fn from(e: LbugError) -> Self {
        CoreError::Lbug(e)
    }
}

/// Open a database at the given path (filesystem path when using StdStorage).
pub fn database_new(path: &str) -> Result<Database, CoreError> {
    Ok(Database::new(path, SystemConfig::default())?)
}

/// Create a connection for the database.
pub fn connection_new(db: &Database) -> Result<Connection, CoreError> {
    Ok(Connection::new(db)?)
}

/// Execute a Cypher statement and return a query result.
pub fn connection_query(conn: &Connection, statement: &str) -> Result<QueryResult<'_>, CoreError> {
    Ok(conn.query(statement)?)
}

/// Return Arrow IPC schema message bytes for the query result.
/// Builds schema from column names and data types (does not consume the result iterator).
pub fn query_result_get_arrow_schema_ipc(result: &QueryResult<'_>) -> Result<Vec<u8>, CoreError> {
    let names = result.get_column_names();
    let types = result.get_column_data_types();
    let fields: Vec<_> = names
        .iter()
        .zip(types.iter())
        .map(|(name, lt)| {
            let dt = logical_type_to_arrow(lt);
            arrow::datatypes::Field::new(name.as_str(), dt, true)
        })
        .collect();
    let schema = arrow::datatypes::Schema::new(fields);
    let mut buf = Vec::new();
    let mut writer = StreamWriter::try_new(Cursor::new(&mut buf), &schema)
        .map_err(|e| CoreError::Arrow(e.to_string()))?;
    writer.finish().map_err(|e| CoreError::Arrow(e.to_string()))?;
    drop(writer);
    Ok(buf)
}

/// Return the next Arrow IPC record batch message bytes; empty vec when no more data.
/// Each chunk is written as schema + one batch (stream-compatible).
pub fn query_result_get_next_arrow_chunk_ipc(
    result: &mut QueryResult<'_>,
    chunk_size: usize,
) -> Result<Vec<u8>, CoreError> {
    let mut iter = result.iter_arrow(chunk_size)?;
    let batch = match iter.next().transpose()? {
        Some(b) => b,
        None => return Ok(Vec::new()),
    };
    let schema = batch.schema();
    let mut buf = Vec::new();
    let mut writer = StreamWriter::try_new(Cursor::new(&mut buf), schema.as_ref())
        .map_err(|e| CoreError::Arrow(e.to_string()))?;
    writer
        .write(&batch)
        .map_err(|e| CoreError::Arrow(e.to_string()))?;
    writer.finish().map_err(|e| CoreError::Arrow(e.to_string()))?;
    drop(writer);
    Ok(buf)
}

fn logical_type_to_arrow(lt: &lbug::LogicalType) -> arrow::datatypes::DataType {
    use arrow::datatypes::DataType;
    use lbug::LogicalType;
    match lt {
        LogicalType::Int64 => DataType::Int64,
        LogicalType::Int32 => DataType::Int32,
        LogicalType::Int16 => DataType::Int16,
        LogicalType::Int8 => DataType::Int8,
        LogicalType::Double => DataType::Float64,
        LogicalType::Float => DataType::Float32,
        LogicalType::Bool => DataType::Boolean,
        LogicalType::String => DataType::Utf8,
        LogicalType::Date => DataType::Date32,
        LogicalType::Timestamp => DataType::Timestamp(arrow::datatypes::TimeUnit::Microsecond, None),
        LogicalType::Interval => DataType::Interval(arrow::datatypes::IntervalUnit::DayTime),
        LogicalType::Blob => DataType::Binary,
        LogicalType::List { .. } => DataType::Utf8, // simplify for IPC
        LogicalType::InternalID => DataType::Int64,
        _ => DataType::Utf8,
    }
}
