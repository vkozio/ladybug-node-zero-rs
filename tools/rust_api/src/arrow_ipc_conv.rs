// Convert Arrow C Data Interface (schema/array) to Arrow IPC bytes.
// Called from C++ with raw pointers; we take ownership via from_raw and release on drop.

use arrow::array::{Array, StructArray};
use arrow::ffi::{from_ffi, FFI_ArrowArray, FFI_ArrowSchema};
use arrow::ipc::writer::StreamWriter;
use arrow::record_batch::RecordBatch;
use arrow_schema::Schema;
use std::io::Cursor;
use std::sync::Arc;

/// Convert C ArrowSchema to IPC schema message bytes. ptr = ArrowSchema* as usize. Takes ownership (release on drop).
pub fn arrow_schema_to_ipc(ptr: usize) -> Vec<u8> {
    if ptr == 0 {
        return Vec::new();
    }
    let ptr = ptr as *mut FFI_ArrowSchema;
    let ffi_schema = unsafe { FFI_ArrowSchema::from_raw(ptr) };
    let schema: Schema = match Schema::try_from(&ffi_schema) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let mut writer = match StreamWriter::try_new(Cursor::new(Vec::new()), &schema) {
        Ok(w) => w,
        Err(_) => return Vec::new(),
    };
    let _ = writer.finish();
    if let Ok(cursor) = writer.into_inner() {
        return cursor.into_inner();
    }
    Vec::new()
}

/// Convert C ArrowSchema + ArrowArray (one record batch) to IPC stream bytes (schema + one batch).
/// schema_ptr/array_ptr = ArrowSchema*/ArrowArray* as usize. Takes ownership (release on drop).
pub fn arrow_chunk_to_ipc(schema_ptr: usize, array_ptr: usize) -> Vec<u8> {
    if schema_ptr == 0 || array_ptr == 0 {
        return Vec::new();
    }
    let schema_ptr = schema_ptr as *mut FFI_ArrowSchema;
    let array_ptr = array_ptr as *mut FFI_ArrowArray;
    let ffi_schema = unsafe { FFI_ArrowSchema::from_raw(schema_ptr) };
    let ffi_array = unsafe { FFI_ArrowArray::from_raw(array_ptr) };
    let array_data = match unsafe { from_ffi(ffi_array, &ffi_schema) } {
        Ok(d) => d,
        Err(_) => return Vec::new(),
    };
    let schema: Schema = match Schema::try_from(&ffi_schema) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let struct_array = StructArray::from(array_data);
    let columns: Vec<Arc<dyn Array>> = struct_array.columns().iter().map(Arc::clone).collect();
    let batch = match RecordBatch::try_new(Arc::new(schema.clone()), columns) {
        Ok(b) => b,
        Err(_) => return Vec::new(),
    };
    let mut writer = match StreamWriter::try_new(Cursor::new(Vec::new()), &schema) {
        Ok(w) => w,
        Err(_) => return Vec::new(),
    };
    let _ = writer.write(&batch);
    let _ = writer.finish();
    if let Ok(cursor) = writer.into_inner() {
        return cursor.into_inner();
    }
    Vec::new()
}
