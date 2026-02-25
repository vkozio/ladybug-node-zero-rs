// Type definitions for cxx bridge. Opaque pointers to C API types; when LADYBUG_LINKED, cast in .cpp.
#pragma once

#include <cstddef>
#include <string>

namespace lbug {

struct Database {
  void* ptr = nullptr;
  ~Database();
};
struct Connection {
  void* ptr = nullptr;
  ~Connection();
};
struct QueryResult {
  void* ptr = nullptr;
  size_t row_index = 0;
  size_t num_tuples = 0;
  size_t num_columns = 0;
  ~QueryResult();
};
struct PreparedStatement {
  void* ptr = nullptr;
  bool success = false;
  std::string error_message;
  ~PreparedStatement();
};

}  // namespace lbug
