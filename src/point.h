#ifndef POINT_H_
#define POINT_H_

#include <ostream>

struct Point {
  unsigned row;
  unsigned column;

  static Point Zero();
  static Point Min(const Point &left, const Point &right);
  static Point Max(const Point &left, const Point &right);

  Point();
  Point(unsigned row, unsigned column);

  int Compare(const Point &other) const;
  bool IsZero() const;
  Point Traverse(const Point &other) const;
  Point Traversal(const Point &other) const;

  bool operator==(const Point &other) const;
  bool operator<(const Point &other) const;
  bool operator<=(const Point &other) const;
  bool operator>(const Point &other) const;
  bool operator>=(const Point &other) const;
};

inline std::ostream &operator<<(std::ostream &stream, const Point &point) {
  return stream << "(" << point.row << ", " << point.column << ")";
}

#endif // POINT_H_
