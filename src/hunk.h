#ifndef HUNK_H_
#define HUNK_H_

#include <ostream>
#include "point.h"

class Hunk {
public:
  Point old_start;
  Point old_end;
  Point new_start;
  Point new_end;
  uint16_t *text;
};

inline std::ostream &operator<<(std::ostream &stream, const Hunk &hunk) {
  stream <<
    "{Hunk old: " << hunk.old_start << " - " << hunk.old_end <<
    ", new: " << hunk.new_start << " - " << hunk.new_end <<
    ", text: ";
  if (hunk.text) {
    stream << "'";
    for (uint16_t *c = hunk.text; *c; c++) {
      stream << (char)*c;
    }
    stream << "'";
  } else {
    stream << "null";
  }
  return stream << "}";
}

#endif // HUNK_H_
