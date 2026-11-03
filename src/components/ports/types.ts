export interface Port {
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
  // portsv2 (Updated Pub 150) additions — optional so the legacy ports.json
  // fallback keeps typechecking. The index signature carries the 95 extra
  // CSV variables that PortDetailSheet renders in the full-record section.
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

export interface MapPoint {
  i: number;
  n: string;
  c: string;
  la: number;
  lo: number;
  d: number | null;
  t: number; // LOD tier 1-4 (from port_size)
  u: string | null; // UN/LOCODE (null until the join script has run)
  s: string | null; // port_size, e.g. "Major" (null when unclassified)
  v: string | null; // max_vessel_size, e.g. "medium vessels"
  dm: number | null; // channel_depth_min_m (d is the max)
  m: number | null; // mean_tidal_range_m
  r: number; // entrance-restriction bitmask: 1 tide, 2 swell, 4 ice, 8 other
}

export interface Stats {
  meta: {
    schema_version: string;
    record_count: number;
    last_updated: string;
    source: string;
  };
  totalPorts: number;
  totalCountries: number;
  withDepth: number;
  withTidal: number;
  withRestrictions: number;
  sizeCounts: [string, number][];
  vesselCounts: [string, number][];
  topCountries: [string, number][];
  allCountries: [string, number][];
  depthBins: number[];
}

export interface Filters {
  q: string;
  country: string | null;
  portSize: string[];
  vesselSize: string[];
  minChannelDepth: number | null;
  minTidalRange: number | null;
  maxTidalRange: number | null;
  restriction: string[];
}

export const EMPTY_FILTERS: Filters = {
  q: "",
  country: null,
  portSize: [],
  vesselSize: [],
  minChannelDepth: null,
  minTidalRange: null,
  maxTidalRange: null,
  restriction: [],
};

export function buildQuery(
  filters: Filters,
  extra: Record<string, string | number> = {}
): string {
  const sp = new URLSearchParams();
  if (filters.q) sp.set("q", filters.q);
  if (filters.country) sp.set("country", filters.country);
  if (filters.portSize.length) sp.set("portSize", filters.portSize.join(","));
  if (filters.vesselSize.length) sp.set("vesselSize", filters.vesselSize.join(","));
  if (filters.minChannelDepth != null) sp.set("minChannelDepth", String(filters.minChannelDepth));
  if (filters.minTidalRange != null) sp.set("minTidalRange", String(filters.minTidalRange));
  if (filters.maxTidalRange != null) sp.set("maxTidalRange", String(filters.maxTidalRange));
  if (filters.restriction.length) sp.set("restriction", filters.restriction.join(","));
  for (const [k, v] of Object.entries(extra)) sp.set(k, String(v));
  return sp.toString();
}

export function activeFilterCount(filters: Filters): number {
  let n = 0;
  if (filters.q.trim()) n++;
  if (filters.country) n++;
  if (filters.portSize.length) n++;
  if (filters.vesselSize.length) n++;
  if (filters.minChannelDepth != null) n++;
  if (filters.minTidalRange != null) n++;
  if (filters.maxTidalRange != null) n++;
  if (filters.restriction.length) n++;
  return n;
}

export function depthColor(d: number | null): string {
  if (d == null) return "var(--dot-none)";
  if (d < 5) return "#f97316";
  if (d < 10) return "#eab308";
  if (d < 15) return "#84cc16";
  if (d < 20) return "#14b8a6";
  return "#0d9488";
}

export function formatDepth(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(1)} m`;
}

export function formatRange(min: number | null, max: number | null): string {
  if (min == null && max == null) return "—";
  if (min != null && max != null) {
    // portsv2 records a single sounding per facility (min === max); a
    // "12.5–12.5 m" range would be noise, so collapse it to one value.
    // The legacy file has true ranges and still renders the "a–b m" form.
    if (min === max) return formatDepth(max);
    return `${min.toFixed(1)}–${max.toFixed(1)} m`;
  }
  return formatDepth(min ?? max);
}

/** Moss port-size ramp: one hue at four strengths, big → small.
 *  The label text is always shown, so colour never carries meaning alone.
 *  Both label sets are covered: portsv2's raw Harbor Size labels
 *  (Large/Medium reuse the strongest/accent ramp steps) and the legacy
 *  2019 dataset's Major/Minor labels (kept for the ports.json fallback).
 *  Light/dark contrast pairs are asserted in src/lib/contrast.test.ts. */
export const PORT_SIZE_STYLES: Record<string, string> = {
  Major: "border-transparent bg-sidebar-primary text-sidebar-primary-foreground",
  Large: "border-transparent bg-sidebar-primary text-sidebar-primary-foreground",
  Small: "border-transparent bg-[#A9D3BB] text-[#16301F] dark:bg-[#2F5A44] dark:text-[#E9EDE9]",
  Minor: "border-accent-foreground/50 bg-accent text-accent-foreground",
  Medium: "border-accent-foreground/50 bg-accent text-accent-foreground",
  "Very Small": "border-border bg-transparent text-muted-foreground",
};
