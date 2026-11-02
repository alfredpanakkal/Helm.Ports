import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPorts, getMetadata, type PortRecord } from "./ports.ts";
import { matchesQuery } from "./apiApp.ts";

/**
 * Data-truth regression tests (restyle plan, Phase 0).
 *
 * They run against the real data/ports.json through the same loader the
 * API uses, so they double as dataset-integrity checks:
 *  - records with an invalid wpi_port_id are never served
 *  - search invariants: name / country / state / POI / WPI ID, case-insensitive
 *  - soundings are feet-quantized (the WPI source records whole feet;
 *    the _m fields are converted to metres and rounded to 0.1 m) and
 *    min <= max per facility pair
 *  - metadata describes the served records
 *
 * Live totals verified 2026-11-02 with a corrected probe method
 * (beyond-last-page requests, which return a tiny body carrying the true
 * total): q=ham 107, q=hamburg 4, q=germany 41, q=netherlands 41,
 * q=jebel ali 2. Thresholds below are deliberately lower than the observed
 * values so routine data refreshes do not break them.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(
  fs.readFileSync(path.join(here, "..", "..", "data", "ports.json"), "utf-8")
) as { ports: Record<string, unknown>[] };

const SOUNDING_FIELDS = [
  "channel_depth_min_m",
  "channel_depth_max_m",
  "anchorage_depth_min_m",
  "anchorage_depth_max_m",
  "cargo_pier_depth_min_m",
  "cargo_pier_depth_max_m",
  "oil_terminal_depth_min_m",
  "oil_terminal_depth_max_m",
] as const;

function countMatches(q: string): number {
  return getPorts().filter((p) => matchesQuery(p, q)).length;
}

const fixture: PortRecord = {
  wpi_port_id: 48276,
  wpi_port_name: "MINA JABAL ALI",
  state: "Dubai",
  country: "United Arab Emirates",
  latitude: 25.02,
  longitude: 55.05,
  channel_depth_min_m: 20.1,
  channel_depth_max_m: 23.8,
  anchorage_depth_min_m: 5.5,
  anchorage_depth_max_m: 9.1,
  cargo_pier_depth_min_m: 31.1,
  cargo_pier_depth_max_m: 34.7,
  oil_terminal_depth_min_m: 23.8,
  oil_terminal_depth_max_m: 27.4,
  mean_tidal_range_m: 1,
  entrance_restriction_tide: false,
  entrance_restriction_heavy_swell: false,
  entrance_restriction_ice: false,
  entrance_restriction_other: true,
  max_vessel_size: "large vessels",
  point_of_interest: "Jebel Ali",
  port_size: "Major",
  unlocode: null,
};

test("matchesQuery searches name, country, state, POI and WPI ID", () => {
  assert.ok(matchesQuery(fixture, "mina"));
  assert.ok(matchesQuery(fixture, "united arab emirates"));
  assert.ok(matchesQuery(fixture, "dubai"));
  assert.ok(matchesQuery(fixture, "jebel ali"));
  assert.ok(matchesQuery(fixture, "48276"));
  assert.ok(!matchesQuery(fixture, "rotterdam"));
  // An empty needle matches everything; callers guard with if (q && ...).
  assert.ok(matchesQuery(fixture, ""));
});

test("dataset search regressions (live totals verified 2026-11-02)", () => {
  assert.ok(countMatches("ham") >= 50, "q=ham matched only " + countMatches("ham"));
  assert.ok(countMatches("hamburg") >= 1, "q=hamburg matched nothing");
  assert.ok(
    countMatches("germany") >= 30,
    "q=germany matched only " + countMatches("germany")
  );
  assert.ok(
    countMatches("netherlands") >= 10,
    "q=netherlands matched only " + countMatches("netherlands")
  );
  assert.ok(
    countMatches("jebel ali") >= 1,
    "q=jebel ali matched nothing (POI search)"
  );
  assert.equal(countMatches("HAM"), countMatches("ham"));
});

test("country names are searchable and filterable", () => {
  const germany = getPorts().filter((p) => p.country === "Germany").length;
  assert.ok(germany >= 30, "only " + germany + " German ports served");
});

test("every served port has a positive integer WPI ID", () => {
  for (const p of getPorts()) {
    assert.ok(
      Number.isInteger(p.wpi_port_id) && p.wpi_port_id > 0,
      "invalid wpi_port_id served: " + p.wpi_port_id + " (" + p.wpi_port_name + ")"
    );
  }
});

test("source rows with an invalid WPI ID are excluded exactly once each", () => {
  const invalid = raw.ports.filter((r) => {
    const id = Number(r.wpi_port_id);
    return !Number.isInteger(id) || id <= 0;
  }).length;
  const served = getPorts().length;
  assert.equal(served, raw.ports.length - invalid);
  assert.equal(getPorts().find((p) => p.wpi_port_id === 0), undefined);
});

test("metadata describes the served dataset", () => {
  const meta = getMetadata();
  assert.equal(meta.record_count, getPorts().length);
  assert.ok(meta.source.length > 0);
  assert.ok(meta.last_updated.length > 0);
});

test("soundings are whole-feet quantized (ft to m conversion invariant)", () => {
  const violations: string[] = [];
  for (const p of getPorts()) {
    for (const field of SOUNDING_FIELDS) {
      const v = p[field];
      if (v == null) continue;
      if (v < 0) {
        violations.push(p.wpi_port_id + " " + field + " negative: " + v);
        continue;
      }
      const ft = v / 0.3048;
      if (Math.abs(ft - Math.round(ft)) > 0.35) {
        violations.push(
          p.wpi_port_id + " " + field + ": " + v + " m = " + ft.toFixed(2) + " ft"
        );
      }
    }
  }
  assert.deepEqual(
    violations.slice(0, 5),
    [],
    "non-quantized soundings, first 5 of " + violations.length + ": " + violations.slice(0, 5).join("; ")
  );
});

test("sounding min <= max for every facility pair", () => {
  const bad: string[] = [];
  const pairs: [string, string][] = [
    ["channel_depth_min_m", "channel_depth_max_m"],
    ["anchorage_depth_min_m", "anchorage_depth_max_m"],
    ["cargo_pier_depth_min_m", "cargo_pier_depth_max_m"],
    ["oil_terminal_depth_min_m", "oil_terminal_depth_max_m"],
  ];
  for (const p of getPorts()) {
    for (const [minField, maxField] of pairs) {
      const min = p[minField as keyof PortRecord] as number | null;
      const max = p[maxField as keyof PortRecord] as number | null;
      if (min != null && max != null && min > max) {
        bad.push(p.wpi_port_id + ": " + minField + " " + min + " > " + maxField + " " + max);
      }
    }
  }
  assert.deepEqual(
    bad.slice(0, 5),
    [],
    "inverted sounding pairs, first 5 of " + bad.length + ": " + bad.slice(0, 5).join("; ")
  );
});

test("unlocode, when present, is a well-formed UN/LOCODE", () => {
  const bad: string[] = [];
  for (const p of getPorts()) {
    if (p.unlocode == null) continue;
    if (!/^[A-Z]{2}[A-Z0-9]{3}$/.test(p.unlocode)) {
      bad.push(p.wpi_port_id + ": " + p.unlocode);
    }
  }
  assert.deepEqual(bad.slice(0, 5), []);
});
