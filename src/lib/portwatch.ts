/**
 * PortWatch (World Bank) ports database - read-only enrichment for port
 * detail sheets. Source: the public ArcGIS FeatureServer GeoJSON endpoint.
 *
 * The dataset is small (a few thousand features), so it is fetched once
 * (paginated), reduced to the fields we display, and kept in an in-memory
 * index with a 24 h TTL. Fetch failures are never cached, so a later
 * request can retry. Matching priority: UN/LOCODE, then PortWatch portid,
 * then normalized port name + country.
 */

const FEATURE_SERVER =
  "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/PortWatch_ports_database/FeatureServer/0/query";

export interface PortWatchInfo {
  portid: string | null;
  locode: string | null;
  vesselTotal: number | null;
  vesselContainer: number | null;
  vesselDryBulk: number | null;
  vesselGeneralCargo: number | null;
  vesselRoRo: number | null;
  vesselTanker: number | null;
  industryTop1: string | null;
}

export interface PortWatchLookup {
  locode: string | null;
  portid: string | null;
  name: string | null;
  country: string | null;
}

interface PortWatchIndex {
  byLocode: Map<string, PortWatchInfo>;
  byPortId: Map<string, PortWatchInfo>;
  byNameCountry: Map<string, PortWatchInfo>;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 2000; // ArcGIS FeatureServer maximum record count

let cachedIndex: PortWatchIndex | null = null;
let cachedAt = 0;

// Combining diacritics block, built at runtime to keep this file pure ASCII.
const COMBINING_MARKS = new RegExp(
  "[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]",
  "g"
);

/** Lowercase alphanumerics only - the shared key form for all lookups. */
function normalizeKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function toInfo(props: Record<string, unknown>): PortWatchInfo {
  const text = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  const num = (v: unknown): number | null =>
    typeof v === "number" && !isNaN(v) ? v : null;
  return {
    portid: text(props.portid),
    locode: text(props.LOCODE),
    vesselTotal: num(props.vessel_count_total),
    vesselContainer: num(props.vessel_count_container),
    vesselDryBulk: num(props.vessel_count_dry_bulk),
    vesselGeneralCargo: num(props.vessel_count_general_cargo),
    vesselRoRo: num(props.vessel_count_RoRo),
    vesselTanker: num(props.vessel_count_tanker),
    industryTop1: text(props.industry_top1),
  };
}

/**
 * Fetches every feature page by resultOffset until the service returns a
 * short page - a single request never assumes it holds the whole dataset.
 */
async function fetchAllFeatures(): Promise<Record<string, unknown>[]> {
  const features: Record<string, unknown>[] = [];
  for (let offset = 0; offset < 100000; offset += PAGE_SIZE) {
    const url =
      FEATURE_SERVER +
      "?where=1%3D1&outFields=*&f=geojson" +
      "&resultOffset=" + offset +
      "&resultRecordCount=" + PAGE_SIZE;
    const res = await fetch(url);
    if (!res.ok) throw new Error("PortWatch request failed (" + res.status + ")");
    const json = (await res.json()) as { features?: { properties?: Record<string, unknown> }[] };
    const batch = json.features ?? [];
    for (const f of batch) if (f.properties) features.push(f.properties);
    if (batch.length < PAGE_SIZE) break;
  }
  return features;
}

function buildIndex(features: Record<string, unknown>[]): PortWatchIndex {
  const byLocode = new Map<string, PortWatchInfo>();
  const byPortId = new Map<string, PortWatchInfo>();
  const byNameCountry = new Map<string, PortWatchInfo>();
  for (const props of features) {
    const info = toInfo(props);
    if (info.locode) {
      const key = normalizeKey(info.locode);
      if (!byLocode.has(key)) byLocode.set(key, info);
    }
    if (info.portid && !byPortId.has(info.portid)) byPortId.set(info.portid, info);
    const name = typeof props.portname === "string" ? props.portname : null;
    const country = typeof props.country === "string" ? props.country : null;
    if (name && country) {
      const key = normalizeKey(name) + "|" + normalizeKey(country);
      if (!byNameCountry.has(key)) byNameCountry.set(key, info);
    }
  }
  return { byLocode, byPortId, byNameCountry };
}

async function getPortWatchIndex(): Promise<PortWatchIndex> {
  if (cachedIndex && Date.now() - cachedAt < CACHE_TTL_MS) return cachedIndex;
  const features = await fetchAllFeatures();
  cachedIndex = buildIndex(features);
  cachedAt = Date.now();
  return cachedIndex;
}

/**
 * Matches a Helm.Ports record to PortWatch: UN/LOCODE first, then the
 * PortWatch portid (when the caller has one), then normalized name +
 * country. Returns null when nothing matches - callers treat that as
 * "no enrichment" and keep showing the primary data alone.
 */
export async function matchPortWatch(lookup: PortWatchLookup): Promise<PortWatchInfo | null> {
  const index = await getPortWatchIndex();
  if (lookup.locode) {
    const hit = index.byLocode.get(normalizeKey(lookup.locode));
    if (hit) return hit;
  }
  if (lookup.portid) {
    const hit = index.byPortId.get(lookup.portid);
    if (hit) return hit;
  }
  if (lookup.name && lookup.country) {
    return (
      index.byNameCountry.get(
        normalizeKey(lookup.name) + "|" + normalizeKey(lookup.country)
      ) ?? null
    );
  }
  return null;
}
