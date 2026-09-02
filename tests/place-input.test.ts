import assert from "node:assert/strict";
import test from "node:test";

import { InputError } from "../src/input-error.js";
import { parsePlaceFilters } from "../src/places/place-input.js";

test("식당 필터의 지역, 카테고리, 예산을 변환한다", () => {
  assert.deepEqual(parsePlaceFilters({ area: " 을지로 ", category: " 한식 ", budget: "30000" }), {
    area: "을지로",
    category: "한식",
    budget: 30_000,
  });
});

test("예산이 정수가 아니면 거부한다", () => {
  assert.throws(() => parsePlaceFilters({ budget: "3만원" }), InputError);
});
