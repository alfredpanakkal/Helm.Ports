import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { countryGeometry } from "./bounds.ts";
import { getCountryIso2 } from "./countryCodes.ts";

export interface PortRecord {
  wpi_port_id: number;
  wpi_port_name: string;
  state: string | null;
  country: string;
  latitude: number;
  longitude: number;
  channel_depth_min_m: number | null;
  channel_depth_max_m: number | null;
  anchorage_depth_min_m: number | null;
  anchorage_depth_max_m: number | null;
  cargo_pier_depth_min_m: number | null;
  cargo_pier_depth_max_m: number | null;
  oil_terminal_depth_min_m: number | null;
  oil_terminal_depth_max_m: number | null;
  mean_tidal_range_m: number | null;
  entrance_restriction_tide: boolean;
  entrance_restriction_heavy_swell: boolean;
  entrance_restriction_ice: boolean;
  entrance_restriction_other: boolean;
  max_vessel_size: string | null;
  point_of_interest: string | null;
  port_size: string | null;
  unlocode: string | null;
  // portsv2 (Updated Pub 150) additions. Every field is optional so the
  // legacy ports.json fallback keeps typechecking, and the index signature
  // lets the 95 extra CSV variables pass through untouched: normalizePort
  // copies them verbatim, the API serves them, and PortDetailSheet renders
  // them in the "Full NGA Pub 150 record" section.
  [key: string]: unknown;
  un_locode?: string | null;
  alternate_port_name?: string | null;
  region_name?: string | null;
  harbor_type?: string | null;
  maximum_vessel_length_m?: number | null;
  maximum_vessel_draft_m?: number | null;
  maximum_vessel_beam_m?: number | null;
  pilotage_compulsory?: boolean | null;
  tugs_assistance?: boolean | null;
}

export interface PortsMetadata {
  schema_version: string;
  record_count: number;
  last_updated: string;
  source: string;
}

/** WPI-style abbreviations -> clean country names (merging variants). */
const COUNTRY_FIXES: Record<string, string> = {
  "U.S.A.": "United States",
  "U.K.": "United Kingdom",
  "U.A.E.": "United Arab Emirates",
  "Congo, D.R.": "DR Congo",
  "Cape Verde Is.": "Cape Verde",
  "Comoros Is.": "Comoros",
  "Cook Is.": "Cook Islands",
  "Marshall Is.": "Marshall Islands",
  "Pitcairn Is.": "Pitcairn Islands",
  "Turks and Caicos Is.": "Turks and Caicos Islands",
  "Virgin Is. (U.K.)": "British Virgin Islands",
  "Virgin Is. (U.S.A.)": "U.S. Virgin Islands",
  "St. Lucia": "Saint Lucia",
  "St. Vincent": "Saint Vincent and the Grenadines",
};

// Both label sets live here on purpose: portsv2 carries the raw CSV
// "Harbor Size" labels (Large / Medium), while the legacy ports.json
// fallback uses the 2019 dataset's Major / Minor labels. Dropping either
// side would break ranking, the LOD tiers or the legacy file.
const PORT_SIZE_ORDER: Record<string, number> = {
  Large: 5,
  Major: 5,
  Small: 4,
  Medium: 3,
  Minor: 3,
  "Very Small": 2,
  unknown: 1,
};

const VESSEL_SIZE_ORDER: Record<string, number> = {
  "large vessels": 3,
  "medium vessels": 2,
};

let cachedPorts: PortRecord[] | null = null;
let cachedMetadata: PortsMetadata | null = null;
let cachedCountryCounts: [string, number][] | null = null;
let cachedCountries: CountryEntry[] | null = null;

/**
 * Compact 5-character UN/LOCODE ("AU CCU" -> "AUCCU"), null when malformed.
 * The portsv2 source stores the raw spaced form, so the legacy unlocode
 * contract (^[A-Z]{2}[A-Z0-9]{3}$, asserted by ports.test.ts) is enforced
 * here at load time.
 */
function normalizeLocode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.toUpperCase().replace(/\s+/g, "");
  return /^[A-Z]{2}[A-Z0-9]{3}$/.test(code) ? code : null;
}

function normalizePort(raw: Record<string, unknown>): PortRecord {
  const country = COUNTRY_FIXES[String(raw.country)] ?? String(raw.country ?? "Unknown");
  const port: PortRecord = {
    wpi_port_id: Number(raw.wpi_port_id),
    wpi_port_name: String(raw.wpi_port_name ?? "Unknown"),
    state: (raw.state as string | null) ?? null,
    country,
    latitude: Number(raw.latitude),
    longitude: Number(raw.longitude),
    channel_depth_min_m: raw.channel_depth_min_m != null ? Number(raw.channel_depth_min_m) : null,
    channel_depth_max_m: raw.channel_depth_max_m != null ? Number(raw.channel_depth_max_m) : null,
    anchorage_depth_min_m: raw.anchorage_depth_min_m != null ? Number(raw.anchorage_depth_min_m) : null,
    anchorage_depth_max_m: raw.anchorage_depth_max_m != null ? Number(raw.anchorage_depth_max_m) : null,
    cargo_pier_depth_min_m: raw.cargo_pier_depth_min_m != null ? Number(raw.cargo_pier_depth_min_m) : null,
    cargo_pier_depth_max_m: raw.cargo_pier_depth_max_m != null ? Number(raw.cargo_pier_depth_max_m) : null,
    oil_terminal_depth_min_m: raw.oil_terminal_depth_min_m != null ? Number(raw.oil_terminal_depth_min_m) : null,
    oil_terminal_depth_max_m: raw.oil_terminal_depth_max_m != null ? Number(raw.oil_terminal_depth_max_m) : null,
    mean_tidal_range_m: raw.mean_tidal_range_m != null ? Number(raw.mean_tidal_range_m) : null,
    entrance_restriction_tide: Boolean(raw.entrance_restriction_tide),
    entrance_restriction_heavy_swell: Boolean(raw.entrance_restriction_heavy_swell),
    entrance_restriction_ice: Boolean(raw.entrance_restriction_ice),
    entrance_restriction_other: Boolean(raw.entrance_restriction_other),
    max_vessel_size: (raw.max_vessel_size as string | null) ?? null,
    point_of_interest: (raw.point_of_interest as string | null) ?? null,
    port_size: (raw.port_size as string | null) ?? null,
    // portsv2 stores the raw spaced LOCODE; normalize it for the legacy
    // key (map popups + regex invariant). un_locode passes through raw.
    unlocode: normalizeLocode(raw.unlocode ?? raw.un_locode),
    un_locode: (raw.un_locode as string | null) ?? null,
    alternate_port_name: (raw.alternate_port_name as string | null) ?? null,
    region_name: (raw.region_name as string | null) ?? null,
    harbor_type: (raw.harbor_type as string | null) ?? null,
    maximum_vessel_length_m:
      raw.maximum_vessel_length_m != null ? Number(raw.maximum_vessel_length_m) : null,
    maximum_vessel_draft_m:
      raw.maximum_vessel_draft_m != null ? Number(raw.maximum_vessel_draft_m) : null,
    maximum_vessel_beam_m:
      raw.maximum_vessel_beam_m != null ? Number(raw.maximum_vessel_beam_m) : null,
    pilotage_compulsory: (raw.pilotage_compulsory as boolean | null) ?? null,
    tugs_assistance: (raw.tugs_assistance as boolean | null) ?? null,
  };
  // Pass every remaining source key through verbatim so the API serves
  // the full record (portsv2 carries 95 extra CSV variables, from
  // facilities_* and services_* to the WKT geometry string).
  for (const [key, value] of Object.entries(raw)) {
    if (!(key in port)) port[key] = value ?? null;
  }
  return port;
}

/**
 * Locates the primary port database across runtimes:
 *  - local dev / node hosting: process.cwd() is the repo root
 *  - Vercel serverless: the file is bundled into the function via
 *    vercel.json "includeFiles"; cwd or the module-relative layout applies
 * data/portsv2.json (Updated Pub 150, 117 fields) is preferred, then the
 * pushed "data/portsv2-117 field.json", and the legacy data/ports.json is
 * the automatic fallback — the site keeps working on any branch state.
 */
function resolveDataFile(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const roots = [
    process.cwd(),
    path.join(here, "..", ".."),
    path.join(here, "..", "..", ".."),
  ];
  const names = ["portsv2.json", "portsv2-117 field.json", "ports.json"];
  const candidates: string[] = [];
  for (const name of names) {
    for (const root of roots) candidates.push(path.join(root, "data", name));
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    "No port database found (tried: " + candidates.join(", ") + ")"
  );
}

export function getPorts(): PortRecord[] {
  if (cachedPorts) return cachedPorts;
  const filePath = resolveDataFile();
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const normalized = (raw.ports as Record<string, unknown>[]).map((p) =>
    normalizePort(p)
  );
  // Data hygiene: the legacy source file contains a small number of rows
  // whose wpi_port_id is 0 or non-numeric - real places (Aalborg DK, Jebel
  // Ali AE) that are missing both the port name and the WPI number. They
  // are not identifiable: they all alias on GET /api/ports/0, cannot be
  // deep-linked or distinguished on the map, and carry no soundings.
  // Serve only records with a positive integer WPI ID. The exact count is
  // asserted by src/lib/ports.test.ts. (Note: wpi_port_id is not unique in
  // portsv2 - IDs 400, 9510, 49454 and 49460 each appear twice; the API
  // returns the first match for a duplicate id.)
  cachedPorts = normalized.filter(
    (p) => Number.isInteger(p.wpi_port_id) && p.wpi_port_id > 0
  );
  cachedMetadata = {
    schema_version: raw.metadata?.schema_version ?? "1.0",
    // Reflect the count actually served, not the raw file row count.
    record_count: cachedPorts.length,
    last_updated: raw.metadata?.last_updated ?? "",
    source: raw.metadata?.source ?? "",
  };
  return cachedPorts;
}

export function getMetadata(): PortsMetadata {
  getPorts();
  return cachedMetadata!;
}

export function getCountryCounts(): [string, number][] {
  if (cachedCountryCounts) return cachedCountryCounts;
  const counts = new Map<string, number>();
  for (const p of getPorts()) {
    counts.set(p.country, (counts.get(p.country) ?? 0) + 1);
  }
  cachedCountryCounts = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return cachedCountryCounts;
}

export interface CountryEntry {
  name: string;
  /** ISO 3166-1 alpha-2 code (null when unknown - URLs fall back to the name). */
  cc: string | null;
  count: number;
  /** Mean port position [lon, lat] - the world-view dot. */
  center: [number, number];
  /** Bounding box [[w, s], [e, n]] - wraps the antimeridian when needed. */
  bounds: [[number, number], [number, number]];
}

/**
 * One entry per port-having country, for the MapLibre world view. Computed
 * once in memory (like getCountryCounts) so it always matches the loaded
 * data file with no build step. Bounds wrap across the antimeridian
 * (Russia, Fiji, USA with the Aleutians) so fitBounds stays contiguous.
 */
export function getCountries(): CountryEntry[] {
  if (cachedCountries) return cachedCountries;
  const byCountry = new Map<string, PortRecord[]>();
  for (const p of getPorts()) {
    const arr = byCountry.get(p.country);
    if (arr) arr.push(p);
    else byCountry.set(p.country, [p]);
  }
  const entries: CountryEntry[] = [];
  for (const [name, ports] of byCountry) {
    const geo = countryGeometry(ports);
    if (!geo) continue;
    entries.push({
      name,
      cc: getCountryIso2(name),
      count: ports.length,
      center: geo.center,
      bounds: geo.bounds,
    });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  cachedCountries = entries;
  return entries;
}

/**
 * Zoom-based level-of-detail (LOD) tier for a port.
 * Tier 1 = largest ... tier 4 = Very Small / unclassified. Lower tiers stay
 * visible at lower zoom; higher tiers are only drawn once you zoom in.
 * Covers both label sets: portsv2's raw Harbor Size labels (Large/Medium)
 * and the legacy Major/Minor labels from the 2019 fallback file.
 */
const PORT_SIZE_TIER: Record<string, number> = {
  Large: 1,
  Major: 1,
  Small: 2,
  Medium: 3,
  Minor: 3,
  "Very Small": 4,
  unknown: 4,
};

export function portTier(portSize: string | null): number {
  return PORT_SIZE_TIER[portSize ?? ""] ?? 4;
}

export function portSizeRank(size: string | null): number {
  if (!size) return 0;
  return PORT_SIZE_ORDER[size] ?? 0;
}

export function vesselSizeRank(size: string | null): number {
  if (!size) return 0;
  return VESSEL_SIZE_ORDER[size] ?? 0;
}
