// Function declarations for cxx bridge. Uses rust/cxx.h (Str, Vec, String) and std::unique_ptr.
#pragma once

#include "rust/cxx.h"
#include "cxx/lbug_impl.h"
#include <cstdint>
#include <memory>
#include <string>

namespace lbug {

std::unique_ptr<Database> new_database(rust::Str path);
std::unique_ptr<Connection> database_connect(const Database& db, std::uint32_t num_threads);
void database_close(std::unique_ptr<Database> db);

std::unique_ptr<QueryResult> connection_query(const Connection& conn, rust::Str statement);
std::unique_ptr<PreparedStatement> connection_prepare(const Connection& conn, rust::Str statement);
std::unique_ptr<QueryResult> connection_execute(const Connection& conn,
                                                 const PreparedStatement& ps,
                                                 rust::Str params_json);
void connection_close(std::unique_ptr<Connection> conn);

bool query_result_has_next(const QueryResult& result);
std::unique_ptr<std::string> query_result_get_next_row(const QueryResult& result);
std::uint64_t query_result_get_num_tuples(const QueryResult& result);
std::uint32_t query_result_get_num_columns(const QueryResult& result);
rust::Vec<rust::String> query_result_column_names(const QueryResult& result);
rust::Vec<rust::String> query_result_column_data_types(const QueryResult& result);
void query_result_close(std::unique_ptr<QueryResult> result);

rust::String query_result_get_arrow_schema(const QueryResult& result);
rust::String query_result_get_next_arrow_chunk(const QueryResult& result, std::uint64_t chunk_size);

rust::Vec<std::uint8_t> query_result_get_arrow_schema_binary(const QueryResult& result);
rust::Vec<std::uint8_t> query_result_get_next_arrow_chunk_binary(const QueryResult& result,
                                                                  std::uint64_t chunk_size);

bool prepared_statement_is_success(const PreparedStatement& ps);
rust::String prepared_statement_get_error_message(const PreparedStatement& ps);

}  // namespace lbug
