import fs from "fs";
import path from "path";

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
}

export interface PortsMetadata {
  schema_version: string;
  record_count: number;
  last_updated: string;
  source: string;
}

/** WPI-style abbreviations → clean country names (merging variants). */
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

const PORT_SIZE_ORDER: Record<string, number> = {
  Major: 5,
  Small: 4,
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

function normalizePort(raw: Record<string, unknown>): PortRecord {
  const country = COUNTRY_FIXES[String(raw.country)] ?? String(raw.country ?? "Unknown");
  return {
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
  };
}

export function getPorts(): PortRecord[] {
  if (cachedPorts) return cachedPorts;
  const filePath = path.join(process.cwd(), "data", "ports.json");
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  cachedPorts = (raw.ports as Record<string, unknown>[]).map(normalizePort);
  cachedMetadata = {
    schema_version: raw.metadata?.schema_version ?? "1.0",
    record_count: raw.metadata?.record_count ?? cachedPorts.length,
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

/**
 * Zoom-based level-of-detail (LOD) tier for a port.
 * Tier 1 = Major … tier 4 = Very Small / unclassified. Lower tiers stay
 * visible at lower zoom; higher tiers are only drawn once you zoom in.
 */
const PORT_SIZE_TIER: Record<string, number> = {
  Major: 1,
  Small: 2,
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
