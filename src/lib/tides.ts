/**
 * Tide (sea level) predictions for a port's coordinates, via the app's
 * tide proxy (GET /api/tide), which forwards to the free Open-Meteo
 * Marine API: hourly sea_level_height_msl, tides computed from the SMOC
 * model at ~8 km resolution. Heights are above global mean sea level,
 * NOT chart datum, and accuracy is limited near harbours and estuaries.
 *
 * High/low water extremes are found from the hourly curve and refined to
 * ~1-minute precision with a parabola through each extreme and its two
 * neighbours. No UI code here so it can be reused and tested standalone.
 */

export interface TideExtreme {
  minutes: number; // minutes after local midnight (refined, may cross midnight slightly)
  height: number; // metres above global mean sea level
  type: "high" | "low";
}

export interface TideSeriesPoint {
  minutes: number;
  height: number;
}

export interface TideDay {
  date: string; // YYYY-MM-DD, port-local
  highs: TideExtreme[];
  lows: TideExtreme[];
  highestHigh: TideExtreme | null;
  lowestLow: TideExtreme | null;
  series: TideSeriesPoint[]; // non-null hourly points for the day
}

export interface TideData {
  days: TideDay[]; // sorted by date
  utcOffsetSec: number;
}

export type HeightUnit = "m" | "ft";

export function fmtTime(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
}

export function heightLabel(metres: number, unit: HeightUnit): string {
  return unit === "ft"
    ? (metres * 3.28084).toFixed(2) + " ft"
    : metres.toFixed(2) + " m";
}

function refined(
  type: "high" | "low",
  baseMinutes: number,
  prev: number,
  cur: number,
  next: number
): TideExtreme {
  const denom = prev - 2 * cur + next;
  if (denom === 0) return { minutes: baseMinutes, height: cur, type };
  const off = (0.5 * (prev - next)) / denom; // hours from the hourly sample
  const height = cur + 0.5 * off * (next - prev) + 0.5 * off * off * denom;
  return { minutes: baseMinutes + off * 60, height, type };
}

export async function fetchTide(lat: number, lng: number): Promise<TideData> {
  const res = await fetch("/api/tide?lat=" + lat + "&lng=" + lng);
  if (!res.ok) throw new Error("Failed to load tide data");
  const json = await res.json();

  const times: string[] = json?.hourly?.time ?? [];
  const values: (number | null)[] = json?.hourly?.sea_level_height_msl ?? [];
  if (times.length === 0 || times.length !== values.length) {
    throw new Error("Malformed tide response");
  }
  const utcOffsetSec = Number(json.utc_offset_seconds) || 0;

  // Bucket the non-null hourly samples per local day for the chart series
  const seriesByDate = new Map<string, TideSeriesPoint[]>();
  for (let i = 0; i < times.length; i++) {
    const v = values[i];
    if (v == null) continue;
    const date = times[i].slice(0, 10);
    const minutes = Number(times[i].slice(11, 13)) * 60 + Number(times[i].slice(14, 16));
    const bucket = seriesByDate.get(date) ?? [];
    bucket.push({ minutes, height: v });
    seriesByDate.set(date, bucket);
  }

  // Extremes are computed on the continuous series (so peaks at midnight
  // keep their neighbours from the adjacent day), then bucketed by the
  // date of the extreme's hourly sample.
  const extremesByDate = new Map<string, { highs: TideExtreme[]; lows: TideExtreme[] }>();
  for (let i = 1; i < values.length - 1; i++) {
    const prev = values[i - 1];
    const cur = values[i];
    const next = values[i + 1];
    if (prev == null || cur == null || next == null) continue;
    const date = times[i].slice(0, 10);
    const minutes = Number(times[i].slice(11, 13)) * 60 + Number(times[i].slice(14, 16));
    let ext: TideExtreme | null = null;
    if (cur > prev && cur >= next) ext = refined("high", minutes, prev, cur, next);
    else if (cur < prev && cur <= next) ext = refined("low", minutes, prev, cur, next);
    if (!ext) continue;
    const bucket = extremesByDate.get(date) ?? { highs: [], lows: [] };
    if (ext.type === "high") bucket.highs.push(ext);
    else bucket.lows.push(ext);
    extremesByDate.set(date, bucket);
  }

  const dates = [...new Set([...seriesByDate.keys(), ...extremesByDate.keys()])].sort();
  const days: TideDay[] = dates.map((date) => {
    const ext = extremesByDate.get(date) ?? { highs: [], lows: [] };
    const highestHigh = ext.highs.length
      ? ext.highs.reduce((a, b) => (b.height > a.height ? b : a))
      : null;
    const lowestLow = ext.lows.length
      ? ext.lows.reduce((a, b) => (b.height < a.height ? b : a))
      : null;
    return {
      date,
      highs: ext.highs,
      lows: ext.lows,
      highestHigh,
      lowestLow,
      series: seriesByDate.get(date) ?? [],
    };
  });

  return { days, utcOffsetSec };
}
