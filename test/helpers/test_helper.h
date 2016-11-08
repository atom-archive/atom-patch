#include <catch.hpp>
#include "patch.h"
#include <ostream>

using std::vector;
using std::string;

string to_string(const uint16_t *text) {
  string result;
  if (text) {
    for (const uint16_t *c = text; c && *c; c++) {
      result += (char)*c;
    }
  }
  return result;
}

bool operator==(const Hunk&left, const Hunk &right) {
  return
    left.old_start == right.old_start &&
    left.new_start == right.new_start &&
    left.old_end == right.old_end &&
    left.new_end == right.new_end &&
    to_string(left.text) == to_string(right.text);
}
