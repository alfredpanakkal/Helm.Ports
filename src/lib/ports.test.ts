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
 * They run against the real data file through the same loader the API
 * uses, so they double as dataset-integrity checks:
 *  - records with an invalid wpi_port_id are never served
 *  - search invariants: name / alternate name / country / state / POI /
 *    WPI ID, case-insensitive
 *  - soundings are quantized to 0.1 m and min <= max per facility pair
 *    (portsv2 records one sounding per facility, so min === max)
 *  - metadata describes the served records
 *
 * Live totals verified 2026-11-02 against the legacy dataset with a
 * corrected probe method (beyond-last-page requests, which return a tiny
 * body carrying the true total): q=ham 107, q=hamburg 4, q=germany 41,
 * q=netherlands 41, q=jebel ali 2. Against the Updated Pub 150 export
 * (portsv2), recomputed 2026-11-03 from the source CSV: q=ham 74,
 * q=hamburg 2, q=germany 35, q=netherlands 22, q=jebel ali 1 (matched via
 * alternate_port_name — state and point_of_interest are always null in
 * portsv2). Thresholds below are deliberately lower than both observed
 * sets so routine data refreshes do not break them.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, "..", "..", "data");
// Mirror the engine's data-file choice (src/lib/ports.ts resolveDataFile):
// portsv2.json, then the pushed "portsv2-117 field.json", then the legacy
// ports.json backup — so these assertions always target the served file.
const dataFile = [
  "portsv2.json",
  "portsv2-117 field.json",
  "ports.json",
].map((name) => path.join(dataDir, name)).find((p) => fs.existsSync(p));
if (!dataFile) throw new Error("No port data file found in data/");
const raw = JSON.parse(
  fs.readFileSync(dataFile, "utf-8")
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

test("dataset search regressions (live totals verified 2026-11-02/03)", () => {
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
    "q=jebel ali matched nothing (alternate-name search in portsv2)"
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
  // record_count is derived from the served records and always present;
  // the portsv2 metadata block centers on its data dictionary, so the
  // legacy last_updated/source strings may be absent — only assert the
  // fields the UI depends on across both files.
  assert.ok(meta.schema_version.length > 0);
});

test("soundings are quantized to 0.1 m (source precision invariant)", () => {
  // portsv2 depths are native 0.1 m single soundings; the legacy
  // ports.json was feet-derived but also rounded to 0.1 m — this
  // invariant holds for both files.
  const violations: string[] = [];
  for (const p of getPorts()) {
    for (const field of SOUNDING_FIELDS) {
      const v = p[field];
      if (v == null) continue;
      if (v < 0 || Math.abs(v * 10 - Math.round(v * 10)) > 1e-6) {
        violations.push(p.wpi_port_id + " " + field + ": " + v);
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
