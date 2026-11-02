/**
 * Solar & lunar transit data for a port's coordinates, from the free
 * SunriseSunset.io API (https://sunrisesunset.io — no API key required).
 *
 * Successful responses are cached in-memory for 12 hours: sun/moon times
 * change only daily, so repeated detail-sheet opens (and ports sharing a
 * coordinate cell) never re-hit the upstream API. Failures are not cached,
 * so a transient upstream error never blocks a port for half a day.
 */

export interface AstronomyData {
  sunrise: string;
  sunset: string;
  solar_noon: string; // Meridian Passage (Merpas)
  day_length: string;
  civil_dawn: string;
  civil_dusk: string;
  nautical_dawn: string;
  nautical_dusk: string;
  moonrise: string | null;
  moonset: string | null;
  moon_phase: string;
  moon_illumination: number; // 0–100 percentage
  timezone: string;
}

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

interface CacheEntry {
  data: AstronomyData;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(lat: number, lng: number): string {
  // 2 decimals ≈ 1 km — plenty for sun/moon transit times
  return lat.toFixed(2) + "," + lng.toFixed(2);
}

export async function fetchAstronomy(lat: number, lng: number): Promise<AstronomyData | null> {
  const key = cacheKey(lat, lng);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.data;

  try {
    const url = "https://api.sunrisesunset.io/json?lat=" + lat + "&lng=" + lng;
    const res = await fetch(url);
    if (!res.ok) {
      console.error("Astronomy fetch failed: " + res.status + " " + res.statusText);
      return null;
    }
    const json = await res.json();
    if (json?.status !== "OK" || !json.results) return null;

    const r = json.results;
    const data: AstronomyData = {
      sunrise: r.sunrise,
      sunset: r.sunset,
      solar_noon: r.solar_noon, // local meridian transit
      day_length: r.day_length,
      civil_dawn: r.dawn,
      civil_dusk: r.dusk,
      nautical_dawn: r.nautical_twilight_begin,
      nautical_dusk: r.nautical_twilight_end,
      moonrise: r.moonrise,
      moonset: r.moonset,
      moon_phase: r.moon_phase,
      moon_illumination: r.moon_illumination,
      timezone: r.timezone,
    };
    cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  } catch (err) {
    console.error("Error fetching astronomy data:", err);
    return null;
  }
}
