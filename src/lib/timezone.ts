/**
 * Time zone & daylight-saving information for a port's coordinates, from
 * the free TimeZoneDB API (https://timezonedb.com). The free tier requires
 * an API key (set TIMEZONEDB_API_KEY) and is limited to 1 request/second
 * for non-commercial use; the database is CC BY 3.0.
 *
 * Successful responses are cached in-memory for 12 hours: zone rules
 * change at most a few times a year, so repeated detail-sheet opens (and
 * ports sharing a coordinate cell) never re-hit the upstream API.
 * Failures are not cached, so a transient upstream error never blocks a
 * port for half a day.
 */

export interface TimezoneData {
  zoneName: string; // IANA zone name, e.g. "Asia/Kolkata"
  abbreviation: string; // current zone abbreviation, e.g. "IST"
  gmtOffsetSec: number; // current UTC offset in seconds
  dstActive: boolean; // daylight saving currently in effect
  periodStart: number; // unix seconds (UTC) when the current offset began
  periodEnd: number; // unix seconds (UTC) when the next clock change occurs
  nextAbbreviation: string | null; // abbreviation after the next change
}

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

interface CacheEntry {
  data: TimezoneData;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(lat: number, lng: number): string {
  // 2 decimals ≈ 1 km — plenty for time zone boundaries
  return lat.toFixed(2) + "," + lng.toFixed(2);
}

export async function fetchTimezone(
  lat: number,
  lng: number
): Promise<TimezoneData | null> {
  const key = cacheKey(lat, lng);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.data;

  const apiKey = process.env.TIMEZONEDB_API_KEY;
  if (!apiKey) {
    console.error("TIMEZONEDB_API_KEY is not configured; timezone data unavailable");
    return null;
  }

  try {
    const params = new URLSearchParams({
      key: apiKey,
      format: "json",
      by: "position",
      lat: String(lat),
      lng: String(lng),
    });
    const res = await fetch(
      "https://api.timezonedb.com/v2.1/get-time-zone?" + params.toString()
    );
    if (!res.ok) {
      console.error("Timezone fetch failed: " + res.status + " " + res.statusText);
      return null;
    }
    const json = await res.json();
    if (json?.status !== "OK" || !json.zoneName) return null;

    const data: TimezoneData = {
      zoneName: json.zoneName,
      abbreviation: json.abbreviation ?? "",
      gmtOffsetSec: Number(json.gmtOffset) || 0,
      dstActive: json.dst === 1,
      periodStart: Number(json.zoneStart) || 0,
      periodEnd: Number(json.zoneEnd) || 0,
      nextAbbreviation: json.nextAbbreviation ?? null,
    };
    cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  } catch (err) {
    console.error("Error fetching timezone data:", err);
    return null;
  }
}
