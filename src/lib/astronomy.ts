/**
 * Solar & lunar transit data for a port's coordinates, from the free
 * Open-Meteo API (https://open-meteo.com — no API key required), the same
 * upstream that powers /api/weather and /api/marine.
 *
 * Open-Meteo supplies sunrise, sunset, daylight duration and the moon
 * cycle. It has no twilight or illumination variables, so civil and
 * nautical twilight are computed locally with the NOAA solar-position
 * equations, solar noon (Merpas) is the midpoint of sunrise and sunset,
 * and moon phase name / illumination are derived from the cycle fraction.
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
const RAD = Math.PI / 180;

interface CacheEntry {
  data: AstronomyData;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

const MOON_PHASE_NAMES = [
  "New Moon",
  "Waxing Crescent",
  "First Quarter",
  "Waxing Gibbous",
  "Full Moon",
  "Waning Gibbous",
  "Last Quarter",
  "Waning Crescent",
];

function cacheKey(lat: number, lng: number): string {
  // 2 decimals ≈ 1 km — plenty for sun/moon transit times
  return lat.toFixed(2) + "," + lng.toFixed(2);
}

/** Minutes since local midnight from an Open-Meteo local ISO time ("…T06:19"). */
function minutesOf(iso: string): number {
  return Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
}

function formatMinutes(totalMin: number): string {
  const m = ((Math.round(totalMin) % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
}

/** NOAA fractional-year solar declination (rad) and equation of time (min). */
function solarParams(dateISO: string): { decl: number; eqTime: number } {
  const ms = Date.parse(dateISO + "T12:00:00Z");
  const dayOfYear = (ms - Date.UTC(new Date(ms).getUTCFullYear(), 0, 1)) / 86400000;
  const g = ((2 * Math.PI) / 365) * dayOfYear;
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));
  return { decl, eqTime };
}

/** Hour angle (degrees) at which the sun reaches the given zenith, or null
 *  when it never does that day (polar day/night). */
function hourAngleFor(declRad: number, lat: number, zenithDeg: number): number | null {
  const cosHa =
    Math.cos(zenithDeg * RAD) / (Math.cos(lat * RAD) * Math.cos(declRad)) -
    Math.tan(lat * RAD) * Math.tan(declRad);
  if (cosHa < -1 || cosHa > 1) return null;
  return Math.acos(cosHa) / RAD;
}

/** Civil (96°) or nautical (102°) twilight times, local to the port. */
function twilight(
  lat: number,
  lng: number,
  dateISO: string,
  utcOffsetSec: number,
  zenithDeg: number
): { dawn: string; dusk: string } | null {
  const { decl, eqTime } = solarParams(dateISO);
  const noonUTC = 720 - 4 * lng - eqTime; // minutes
  const ha = hourAngleFor(decl, lat, zenithDeg);
  if (ha == null) return null;
  const off = utcOffsetSec / 60;
  return {
    dawn: formatMinutes(noonUTC - 4 * ha + off),
    dusk: formatMinutes(noonUTC + 4 * ha + off),
  };
}

function dayLength(seconds: number): string {
  return Math.floor(seconds / 3600) + "h " + Math.round((seconds % 3600) / 60) + "m";
}

export async function fetchAstronomy(lat: number, lng: number): Promise<AstronomyData | null> {
  const key = cacheKey(lat, lng);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.data;

  try {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lng),
      daily: "sunrise,sunset,daylight_duration,moonrise,moonset,moon_phase",
      timezone: "auto",
      forecast_days: "1",
    });
    const res = await fetch("https://api.open-meteo.com/v1/forecast?" + params.toString());
    if (!res.ok) {
      console.error("Astronomy fetch failed: " + res.status + " " + res.statusText);
      return null;
    }
    const json = await res.json();
    const d = json?.daily;
    if (!d?.time?.[0] || !d.sunrise?.[0] || !d.sunset?.[0]) return null;

    const offset = json.utc_offset_seconds ?? 0;
    const civil = twilight(lat, lng, d.time[0], offset, 96);
    const nautical = twilight(lat, lng, d.time[0], offset, 102);
    const phase = Number(d.moon_phase?.[0]) || 0;

    const data: AstronomyData = {
      sunrise: d.sunrise[0].slice(11, 16),
      sunset: d.sunset[0].slice(11, 16),
      solar_noon: formatMinutes((minutesOf(d.sunrise[0]) + minutesOf(d.sunset[0])) / 2),
      day_length: dayLength(d.daylight_duration?.[0] ?? 0),
      civil_dawn: civil?.dawn ?? "—",
      civil_dusk: civil?.dusk ?? "—",
      nautical_dawn: nautical?.dawn ?? "—",
      nautical_dusk: nautical?.dusk ?? "—",
      moonrise: d.moonrise?.[0] ? d.moonrise[0].slice(11, 16) : null,
      moonset: d.moonset?.[0] ? d.moonset[0].slice(11, 16) : null,
      moon_phase: MOON_PHASE_NAMES[Math.round(phase * 8) % 8],
      moon_illumination: ((1 - Math.cos(2 * Math.PI * phase)) / 2) * 100,
      timezone: json.timezone_abbreviation ?? json.timezone ?? "UTC",
    };
    cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  } catch (err) {
    console.error("Error fetching astronomy data:", err);
    return null;
  }
}
