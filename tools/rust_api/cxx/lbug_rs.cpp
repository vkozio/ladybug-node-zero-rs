// C++ side of cxx bridge. When LADYBUG_LINKED, calls Ladybug C API; else throws.
#include "ladybug_native/src/ffi.rs.h"
#include "cxx/lbug_impl.h"
#include "cxx/lbug_api.h"
#include <cstdint>
#include <cstring>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

#ifdef LADYBUG_LINKED
#include "lbug.h"
#endif

namespace lbug {

static const char kNotLinked[] =
    "Ladybug not linked: set LBUG_LIBRARY_DIR and LBUG_INCLUDE_DIR";

#ifdef LADYBUG_LINKED

static inline lbug_database* db_ptr(Database& d) {
  return static_cast<lbug_database*>(d.ptr);
}
static inline lbug_connection* conn_ptr(Connection& c) {
  return static_cast<lbug_connection*>(c.ptr);
}
static inline lbug_query_result* result_ptr(QueryResult& r) {
  return static_cast<lbug_query_result*>(r.ptr);
}
static inline lbug_prepared_statement* ps_ptr(PreparedStatement& ps) {
  return static_cast<lbug_prepared_statement*>(ps.ptr);
}

Database::~Database() {
  if (ptr) {
    lbug_database_destroy(static_cast<lbug_database*>(ptr));
    delete static_cast<lbug_database*>(ptr);
    ptr = nullptr;
  }
}
Connection::~Connection() {
  if (ptr) {
    lbug_connection_destroy(static_cast<lbug_connection*>(ptr));
    delete static_cast<lbug_connection*>(ptr);
    ptr = nullptr;
  }
}
QueryResult::~QueryResult() {
  if (ptr) {
    lbug_query_result_destroy(static_cast<lbug_query_result*>(ptr));
    delete static_cast<lbug_query_result*>(ptr);
    ptr = nullptr;
  }
}
PreparedStatement::~PreparedStatement() {
  if (ptr) {
    lbug_prepared_statement_destroy(static_cast<lbug_prepared_statement*>(ptr));
    delete static_cast<lbug_prepared_statement*>(ptr);
    ptr = nullptr;
  }
}

std::unique_ptr<Database> new_database(rust::Str path) {
  std::string path_str(path.data(), path.size());
  lbug_database* raw = new lbug_database();
  lbug_system_config config = lbug_default_system_config();
  lbug_state st = lbug_database_init(path_str.c_str(), config, raw);
  if (st != LbugSuccess) {
    lbug_database_destroy(raw);
    delete raw;
    throw std::runtime_error("lbug_database_init failed");
  }
  Database* d = new Database();
  d->ptr = raw;
  return std::unique_ptr<Database>(d);
}

void database_close(std::unique_ptr<Database> db) {
  if (db && db->ptr) {
    lbug_database_destroy(db_ptr(*db));
    delete static_cast<lbug_database*>(db->ptr);
    db->ptr = nullptr;
  }
}

std::unique_ptr<Connection> database_connect(const Database& db,
                                             std::uint32_t num_threads) {
  lbug_connection* raw = new lbug_connection();
  lbug_state st = lbug_connection_init(db_ptr(const_cast<Database&>(db)), raw);
  if (st != LbugSuccess) {
    delete raw;
    throw std::runtime_error("lbug_connection_init failed");
  }
  Connection* c = new Connection();
  c->ptr = raw;
  return std::unique_ptr<Connection>(c);
}

void connection_close(std::unique_ptr<Connection> conn) {
  if (conn && conn->ptr) {
    lbug_connection_destroy(conn_ptr(*conn));
    delete static_cast<lbug_connection*>(conn->ptr);
    conn->ptr = nullptr;
  }
}

std::unique_ptr<QueryResult> connection_query(const Connection& conn,
                                              rust::Str statement) {
  std::string stmt_str(statement.data(), statement.size());
  lbug_query_result* raw = new lbug_query_result();
  raw->_query_result = nullptr;
  raw->_is_owned_by_cpp = false;
  lbug_state st = lbug_connection_query(
      conn_ptr(const_cast<Connection&>(conn)), stmt_str.c_str(), raw);
  if (st != LbugSuccess) {
    char* err = (raw->_query_result) ? lbug_query_result_get_error_message(raw) : nullptr;
    std::string msg = err ? err : "lbug_connection_query failed";
    if (err) lbug_destroy_string(err);
    lbug_query_result_destroy(raw);
    delete raw;
    throw std::runtime_error(msg);
  }
  if (!lbug_query_result_is_success(raw)) {
    char* err = lbug_query_result_get_error_message(raw);
    std::string msg = err ? err : "query failed";
    if (err) lbug_destroy_string(err);
    lbug_query_result_destroy(raw);
    delete raw;
    throw std::runtime_error(msg);
  }
  QueryResult* r = new QueryResult();
  r->ptr = raw;
  r->num_tuples = lbug_query_result_get_num_tuples(raw);
  r->num_columns = static_cast<size_t>(lbug_query_result_get_num_columns(raw));
  return std::unique_ptr<QueryResult>(r);
}

std::unique_ptr<PreparedStatement> connection_prepare(const Connection& conn,
                                                      rust::Str statement) {
  std::string stmt_str(statement.data(), statement.size());
  lbug_prepared_statement* raw = new lbug_prepared_statement();
  raw->_prepared_statement = nullptr;
  raw->_bound_values = nullptr;
  lbug_state st = lbug_connection_prepare(
      conn_ptr(const_cast<Connection&>(conn)), stmt_str.c_str(), raw);
  PreparedStatement* ps = new PreparedStatement();
  ps->ptr = raw;
  ps->success = lbug_prepared_statement_is_success(raw);
  char* err = lbug_prepared_statement_get_error_message(raw);
  if (err) {
    ps->error_message = err;
    lbug_destroy_string(err);
  }
  return std::unique_ptr<PreparedStatement>(ps);
}

std::unique_ptr<QueryResult> connection_execute(const Connection& conn,
                                                const PreparedStatement& ps,
                                                rust::Str params_json) {
  (void)params_json;
  lbug_query_result* raw = new lbug_query_result();
  raw->_query_result = nullptr;
  raw->_is_owned_by_cpp = false;
  lbug_state st = lbug_connection_execute(
      conn_ptr(const_cast<Connection&>(conn)), ps_ptr(const_cast<PreparedStatement&>(ps)), raw);
  if (st != LbugSuccess) {
    delete raw;
    throw std::runtime_error("lbug_connection_execute failed");
  }
  QueryResult* r = new QueryResult();
  r->ptr = raw;
  r->num_tuples = lbug_query_result_get_num_tuples(raw);
  r->num_columns = static_cast<size_t>(lbug_query_result_get_num_columns(raw));
  return std::unique_ptr<QueryResult>(r);
}

bool query_result_has_next(const QueryResult& result) {
  return lbug_query_result_has_next(result_ptr(const_cast<QueryResult&>(result)));
}

std::unique_ptr<std::string> query_result_get_next_row(const QueryResult& result) {
  lbug_flat_tuple flat{};
  flat._flat_tuple = nullptr;
  flat._is_owned_by_cpp = false;
  lbug_state st = lbug_query_result_get_next(
      result_ptr(const_cast<QueryResult&>(result)), &flat);
  if (st != LbugSuccess) {
    return nullptr;
  }
  char* str = lbug_flat_tuple_to_string(&flat);
  if (!str) {
    lbug_flat_tuple_destroy(&flat);
    return nullptr;
  }
  auto out = std::make_unique<std::string>(str);
  lbug_destroy_string(str);
  lbug_flat_tuple_destroy(&flat);
  return out;
}

std::uint64_t query_result_get_num_tuples(const QueryResult& result) {
  return result.num_tuples;
}

std::uint32_t query_result_get_num_columns(const QueryResult& result) {
  return static_cast<std::uint32_t>(result.num_columns);
}

rust::Vec<rust::String> query_result_column_names(const QueryResult& result) {
  rust::Vec<rust::String> out;
  lbug_query_result* r = result_ptr(const_cast<QueryResult&>(result));
  uint64_t n = lbug_query_result_get_num_columns(r);
  for (uint64_t i = 0; i < n; i++) {
    char* name = nullptr;
    if (lbug_query_result_get_column_name(r, i, &name) == LbugSuccess && name) {
      out.push_back(rust::String(name));
      lbug_destroy_string(name);
    } else {
      out.push_back(rust::String(""));
    }
  }
  return out;
}

rust::Vec<rust::String> query_result_column_data_types(const QueryResult& result) {
  rust::Vec<rust::String> out;
  uint64_t n = result.num_columns;
  for (uint64_t i = 0; i < n; i++) {
    out.push_back(rust::String(""));
  }
  return out;
}

void query_result_close(std::unique_ptr<QueryResult> result) {
  if (result && result->ptr) {
    lbug_query_result_destroy(result_ptr(*result));
    delete static_cast<lbug_query_result*>(result->ptr);
    result->ptr = nullptr;
  }
}

rust::String query_result_get_arrow_schema(const QueryResult& result) {
  // Produce a lightweight JSON schema based on column names and data types.
  // This avoids depending on Arrow JSON here and reuses the existing row API.
  rust::Vec<rust::String> names = query_result_column_names(result);
  rust::Vec<rust::String> types = query_result_column_data_types(result);
  std::string json = "[";
  std::size_t n = names.size();
  for (std::size_t i = 0; i < n; ++i) {
    if (i > 0) json += ",";
    // types[i] may be empty (not implemented in Ladybug C API yet); keep it as "".
    const std::string name = std::string(names[i].c_str());
    const std::string type = std::string(types.size() > i ? types[i].c_str() : "");
    json += "{\"name\":\"";
    for (char c : name) {
      if (c == '\"' || c == '\\') json += '\\';
      json += c;
    }
    json += "\",\"type\":\"";
    for (char c : type) {
      if (c == '\"' || c == '\\') json += '\\';
      json += c;
    }
    json += "\"}";
  }
  json += "]";
  return rust::String(json);
}

rust::String query_result_get_next_arrow_chunk(const QueryResult& result,
                                               std::uint64_t chunk_size) {
  // Fallback implementation: build a JSON array of per-row JSON values
  // using the flat-tuple row API. This keeps semantics simple for the
  // Node layer while avoiding a hard dependency on Arrow JSON here.
  if (chunk_size == 0) {
    chunk_size = 8192;
  }
  std::string json = "[";
  bool first = true;
  for (std::uint64_t i = 0; i < chunk_size; ++i) {
    if (!lbug_query_result_has_next(result_ptr(const_cast<QueryResult&>(result)))) {
      break;
    }
    auto row = query_result_get_next_row(result);
    if (!row) {
      break;
    }
    if (!first) {
      json += ",";
    }
    first = false;
    // row-> is expected to be a JSON object or value; insert as-is.
    json += *row;
  }
  json += "]";
  // When there were no rows in this chunk, signal end with empty string.
  if (first) {
    return rust::String("");
  }
  return rust::String(json);
}

rust::Vec<std::uint8_t> query_result_get_arrow_schema_binary(const QueryResult& result) {
  struct ArrowSchema schema;
  std::memset(&schema, 0, sizeof(schema));
  lbug_query_result_get_arrow_schema(result_ptr(const_cast<QueryResult&>(result)), &schema);
  return arrow_schema_to_ipc(reinterpret_cast<std::uintptr_t>(&schema));
}

rust::Vec<std::uint8_t> query_result_get_next_arrow_chunk_binary(const QueryResult& result,
                                                                  std::uint64_t chunk_size) {
  struct ArrowSchema schema;
  struct ArrowArray array;
  std::memset(&schema, 0, sizeof(schema));
  std::memset(&array, 0, sizeof(array));
  int64_t size = static_cast<int64_t>(chunk_size > 0 ? chunk_size : 8192);
  int err = lbug_query_result_get_next_arrow_chunk(
      result_ptr(const_cast<QueryResult&>(result)), size, &array);
  if (err != 0 || array.release == nullptr) {
    return rust::Vec<std::uint8_t>();
  }
  lbug_query_result_get_arrow_schema(result_ptr(const_cast<QueryResult&>(result)), &schema);
  return arrow_chunk_to_ipc(
      reinterpret_cast<std::uintptr_t>(&schema),
      reinterpret_cast<std::uintptr_t>(&array));
}

bool prepared_statement_is_success(const PreparedStatement& ps) {
  return ps.success;
}

rust::String prepared_statement_get_error_message(const PreparedStatement& ps) {
  return rust::String(ps.error_message);
}

#else  // !LADYBUG_LINKED

Database::~Database() {}
Connection::~Connection() {}
QueryResult::~QueryResult() {}
PreparedStatement::~PreparedStatement() {}

std::unique_ptr<Database> new_database(rust::Str path) {
  (void)path;
  throw std::runtime_error(kNotLinked);
}

std::unique_ptr<Connection> database_connect(const Database& db,
                                             std::uint32_t num_threads) {
  (void)db;
  (void)num_threads;
  throw std::runtime_error(kNotLinked);
}

void database_close(std::unique_ptr<Database> db) { (void)db; }

std::unique_ptr<QueryResult> connection_query(const Connection& conn,
                                              rust::Str statement) {
  (void)conn;
  (void)statement;
  throw std::runtime_error(kNotLinked);
}

std::unique_ptr<PreparedStatement> connection_prepare(const Connection& conn,
                                                      rust::Str statement) {
  (void)conn;
  (void)statement;
  throw std::runtime_error(kNotLinked);
}

std::unique_ptr<QueryResult> connection_execute(const Connection& conn,
                                                const PreparedStatement& ps,
                                                rust::Str params_json) {
  (void)conn;
  (void)ps;
  (void)params_json;
  throw std::runtime_error(kNotLinked);
}

void connection_close(std::unique_ptr<Connection> conn) { (void)conn; }

bool query_result_has_next(const QueryResult& result) {
  (void)result;
  return false;
}

std::unique_ptr<std::string> query_result_get_next_row(const QueryResult& result) {
  (void)result;
  return nullptr;
}

std::uint64_t query_result_get_num_tuples(const QueryResult& result) {
  return result.num_tuples;
}

std::uint32_t query_result_get_num_columns(const QueryResult& result) {
  return static_cast<std::uint32_t>(result.num_columns);
}

rust::Vec<rust::String> query_result_column_names(const QueryResult& result) {
  (void)result;
  return {};
}

rust::Vec<rust::String> query_result_column_data_types(const QueryResult& result) {
  (void)result;
  return {};
}

void query_result_close(std::unique_ptr<QueryResult> result) { (void)result; }

rust::String query_result_get_arrow_schema(const QueryResult& result) {
  (void)result;
  return rust::String("[]");
}

rust::String query_result_get_next_arrow_chunk(const QueryResult& result,
                                               std::uint64_t chunk_size) {
  (void)result;
  (void)chunk_size;
  return rust::String("");
}

rust::Vec<std::uint8_t> query_result_get_arrow_schema_binary(const QueryResult& result) {
  (void)result;
  return rust::Vec<std::uint8_t>();
}

rust::Vec<std::uint8_t> query_result_get_next_arrow_chunk_binary(const QueryResult& result,
                                                                  std::uint64_t chunk_size) {
  (void)result;
  (void)chunk_size;
  return rust::Vec<std::uint8_t>();
}

bool prepared_statement_is_success(const PreparedStatement& ps) {
  return ps.success;
}

rust::String prepared_statement_get_error_message(const PreparedStatement& ps) {
  return rust::String(ps.error_message);
}

#endif  // LADYBUG_LINKED

}  // namespace lbug
