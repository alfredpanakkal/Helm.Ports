import assert from "node:assert/strict";
import { test } from "node:test";
import { countryGeometry } from "./bounds.ts";

test("bounds of a compact country stay contiguous", () => {
  const geo = countryGeometry([
    { latitude: 8, longitude: 76 },
    { latitude: 28, longitude: 77 },
    { latitude: 34, longitude: 68 },
  ])!;
  assert.deepEqual(geo.bounds, [
    [68, 8],
    [77, 34],
  ]);
  assert.ok(Math.abs(geo.center[0] - 73.667) < 0.01);
});

test("countries crossing the antimeridian wrap instead of spanning the globe", () => {
  // Fiji-style: ports at 178 E and just west of 180 (-179 is 181 E).
  const geo = countryGeometry([
    { latitude: -18, longitude: 178 },
    { latitude: -16, longitude: -179 },
  ])!;
  assert.deepEqual(geo.bounds, [
    [178, -18],
    [181, -16],
  ]);
  assert.equal(geo.center[0], 179.5);
});

test("a single-port country yields a point box", () => {
  const geo = countryGeometry([{ latitude: 35.9, longitude: 14.5 }])!;
  assert.deepEqual(geo.bounds, [
    [14.5, 35.9],
    [14.5, 35.9],
  ]);
  assert.deepEqual(geo.center, [14.5, 35.9]);
});

test("empty input returns null", () => {
  assert.equal(countryGeometry([]), null);
});
