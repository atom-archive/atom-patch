#include "helpers/test_helper.h"

uint16_t *str(const char *text) {
  size_t length = strlen(text);
  auto result = new uint16_t[length + 1];
  for (size_t i = 0; i < length; i++) {
    result[i] = text[i];
  }
  result[length] = 0;
  return result;
}

TEST_CASE("Records simple non-overlapping splices") {
  Patch patch;

  patch.Splice(Point{0, 5}, Point{0, 3}, Point{0, 4}, str("abcd"), 4);
  patch.Splice(Point{0, 10}, Point{0, 3}, Point{0, 4}, str("efgh"), 4);
  REQUIRE(patch.GetHunks() == vector<Hunk>({
    Hunk{
      Point{0, 5}, Point{0, 8},
      Point{0, 5}, Point{0, 9},
      str("abcd")
    },
    Hunk{
      Point{0, 9}, Point{0, 12},
      Point{0, 10}, Point{0, 14},
      str("efgh")
    }
  }));

  patch.Splice(Point{0, 2}, Point{0, 2}, Point{0, 1});
  REQUIRE(patch.GetHunks() == vector<Hunk>({
    Hunk{
      Point{0, 2}, Point{0, 4},
      Point{0, 2}, Point{0, 3}
    },
    Hunk{
      Point{0, 5}, Point{0, 8},
      Point{0, 4}, Point{0, 8},
      str("abcd")
    },
    Hunk{
      Point{0, 9}, Point{0, 12},
      Point{0, 9}, Point{0, 13},
      str("efgh")
    }
  }));

  patch.Splice(Point{0, 0}, Point{0, 0}, Point{0, 10});
  REQUIRE(patch.GetHunks() == vector<Hunk>({
    Hunk{
      Point{0, 0}, Point{0, 0},
      Point{0, 0}, Point{0, 10}
    },
    Hunk{
      Point{0, 2}, Point{0, 4},
      Point{0, 12}, Point{0, 13}
    },
    Hunk{
      Point{0, 5}, Point{0, 8},
      Point{0, 14}, Point{0, 18},
      str("abcd")
    },
    Hunk{
      Point{0, 9}, Point{0, 12},
      Point{0, 19}, Point{0, 23},
      str("efgh")
    }
  }));
}

TEST_CASE("Records simple overlapping splices") {
  Patch patch;

  patch.Splice(Point{0, 5}, Point{0, 3}, Point{0, 4}, str("abcd"), 4);
  patch.Splice(Point{0, 7}, Point{0, 3}, Point{0, 4}, str("efgh"), 4);
  REQUIRE(patch.GetHunks() == vector<Hunk>({
    Hunk{
      Point{0, 5}, Point{0, 9},
      Point{0, 5}, Point{0, 11},
      str("abefgh")
    }
  }));
}

TEST_CASE("Serializes and deserializes") {
  Patch patch;

  patch.Splice(Point{0, 5}, Point{0, 3}, Point{0, 4});
  patch.Splice(Point{0, 10}, Point{0, 3}, Point{0, 4});
  patch.Splice(Point{0, 2}, Point{0, 2}, Point{0, 1});
  patch.Splice(Point{0, 0}, Point{0, 0}, Point{0, 10});
  patch.HunkForOldPosition(Point{0, 5}); // splay the middle
  REQUIRE(patch.GetHunks() == vector<Hunk>({
    Hunk{
      Point{0, 0}, Point{0, 0},
      Point{0, 0}, Point{0, 10}
    },
    Hunk{
      Point{0, 2}, Point{0, 4},
      Point{0, 12}, Point{0, 13}
    },
    Hunk{
      Point{0, 5}, Point{0, 8},
      Point{0, 14}, Point{0, 18},
    },
    Hunk{
      Point{0, 9}, Point{0, 12},
      Point{0, 19}, Point{0, 23},
    }
  }));

  vector<uint8_t> serialization_vector;
  patch.Serialize(&serialization_vector);
  Patch patch_copy(serialization_vector);
  REQUIRE(patch_copy.GetHunks() == vector<Hunk>({
    Hunk{
      Point{0, 0}, Point{0, 0},
      Point{0, 0}, Point{0, 10}
    },
    Hunk{
      Point{0, 2}, Point{0, 4},
      Point{0, 12}, Point{0, 13}
    },
    Hunk{
      Point{0, 5}, Point{0, 8},
      Point{0, 14}, Point{0, 18},
    },
    Hunk{
      Point{0, 9}, Point{0, 12},
      Point{0, 19}, Point{0, 23},
    }
  }));

  REQUIRE(patch_copy.Splice(Point{0, 1}, Point{0, 1}, Point{0, 2}) == false);
}
