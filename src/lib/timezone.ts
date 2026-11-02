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
 *
 * If TimeZoneDB fails (missing key, rate limit, outage), the keyless
 * Hourora API (https://hourora.app — no sign-up) is used as a fallback:
 * coordinate lookup followed by the zone's clock-change data. Hourora's
 * coordinate lookup is nearest-city approximation, so it stays the
 * fallback rather than the primary. Hourora provides no start time for
 * the current offset period, so periodStart is null on that path.
 * Successful fallback results are cached like primary ones, so an
 * outage costs at most one Hourora call pair per coordinate cell.
 */

export interface TimezoneData {
  zoneName: string; // IANA zone name, e.g. "Asia/Kolkata"
  abbreviation: string; // current zone abbreviation, e.g. "IST"
  gmtOffsetSec: number; // current UTC offset in seconds
  dstActive: boolean; // daylight saving currently in effect
  periodStart: number | null; // unix seconds (UTC) when the current offset began
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

/**
 * Fallback: resolve the zone via Hourora's coordinate lookup, then fetch
 * the zone's clock-change data. Keyless; returns null on any failure.
 */
async function fetchTimezoneFromHourora(
  lat: number,
  lng: number,
  key: string
): Promise<TimezoneData | null> {
  try {
    const lookupRes = await fetch(
      "https://hourora.app/api/v1/lookup?lat=" + lat + "&lng=" + lng
    );
    if (!lookupRes.ok) return null;
    const lookup = await lookupRes.json();
    const zone = lookup?.zone;
    if (!zone) return null;

    const timeRes = await fetch("https://hourora.app/api/v1/time?tz=" + encodeURIComponent(zone));
    if (!timeRes.ok) return null;
    const t = await timeRes.json();
    if (!t?.zone) return null;

    const next = t.nextTransition;
    const data: TimezoneData = {
      zoneName: t.zone,
      abbreviation: t.abbreviation ?? "",
      gmtOffsetSec: (Number(t.offsetMinutes) || 0) * 60,
      dstActive: t.dst === true,
      periodStart: null,
      periodEnd: next?.unixMs ? Math.floor(next.unixMs / 1000) : 0,
      nextAbbreviation: next?.toAbbreviation ?? null,
    };
    cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  } catch (err) {
    console.error("Error fetching timezone data from Hourora:", err);
    return null;
  }
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
    console.error("TIMEZONEDB_API_KEY is not configured; falling back to Hourora");
    return fetchTimezoneFromHourora(lat, lng, key);
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
    if (json?.status !== "OK" || !json.zoneName) {
      return fetchTimezoneFromHourora(lat, lng, key);
    }

    const data: TimezoneData = {
      zoneName: json.zoneName,
      abbreviation: json.abbreviation ?? "",
      gmtOffsetSec: Number(json.gmtOffset) || 0,
      dstActive: json.dst === 1,
      periodStart: Number(json.zoneStart) || null,
      periodEnd: Number(json.zoneEnd) || 0,
      nextAbbreviation: json.nextAbbreviation ?? null,
    };
    cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  } catch (err) {
    console.error("Error fetching timezone data:", err);
    return fetchTimezoneFromHourora(lat, lng, key);
  }
}
