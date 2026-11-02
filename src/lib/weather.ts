/**
 * Weather lookup for a port's coordinates via the app's weather proxy
 * (GET /api/weather), which forwards to the free Open-Meteo API and sets
 * CDN cache headers — mirroring the /api/astronomy convention. Returns
 * only the fields the detail sheet shows: current conditions plus a
 * 7-day outlook in the port's local time zone. Kept free of UI code so
 * it can be reused and tested standalone.
 */

export interface CurrentWeather {
  time: string | null; // ISO observation time, port-local
  temperature: number | null; // °C
  weatherCode: number | null; // WMO code
  windSpeed: number | null; // knots
  windDirection: number | null; // degrees from north
  pressureMsl: number | null; // hPa at mean sea level
}

export interface DailyForecast {
  date: string; // YYYY-MM-DD, port-local
  weatherCode: number | null;
  tMax: number | null; // °C
  tMin: number | null; // °C
  rainProb: number | null; // max precipitation probability, %
}

export interface PortWeather {
  current: CurrentWeather;
  daily: DailyForecast[];
}

export async function fetchPortWeather(
  latitude: number,
  longitude: number
): Promise<PortWeather> {
  const res = await fetch(
    "/api/weather?lat=" + latitude + "&lng=" + longitude
  );
  if (!res.ok) throw new Error("Failed to load weather");

  const json = await res.json();
  const current = json?.current ?? {};
  const daily = json?.daily ?? {};
  const days: DailyForecast[] = (daily.time ?? []).map(
    (date: string, i: number): DailyForecast => ({
      date,
      weatherCode: daily.weather_code?.[i] ?? null,
      tMax: daily.temperature_2m_max?.[i] ?? null,
      tMin: daily.temperature_2m_min?.[i] ?? null,
      rainProb: daily.precipitation_probability_max?.[i] ?? null,
    })
  );

  return {
    current: {
      time: current.time ?? null,
      temperature: current.temperature_2m ?? null,
      weatherCode: current.weather_code ?? null,
      windSpeed: current.wind_speed_10m ?? null,
      windDirection: current.wind_direction_10m ?? null,
      pressureMsl: current.pressure_msl ?? null,
    },
    daily: days,
  };
}

export interface MarineWaveState {
  height: number | null; // metres
  direction: number | null; // degrees from north
  period: number | null; // seconds
}

export interface MarineCurrent {
  combined: MarineWaveState;
  swell: MarineWaveState;
  wind: MarineWaveState;
}

export interface MarineDay {
  date: string; // YYYY-MM-DD, port-local
  combined: MarineWaveState;
  swell: MarineWaveState;
  wind: MarineWaveState;
}

export interface PortMarine {
  current: MarineCurrent | null;
  days: MarineDay[];
}

function waveState(
  height: number | null | undefined,
  direction: number | null | undefined,
  period: number | null | undefined
): MarineWaveState {
  return {
    height: height ?? null,
    direction: direction ?? null,
    period: period ?? null,
  };
}

/**
 * Sea state for a port's coordinates via the free Open-Meteo Marine API
 * (marine-api.open-meteo.com, keyless). Wave models only cover open and
 * coastal waters, so inland/river ports often have no data. Returns null
 * for "no data here" and for any upstream error — callers must simply
 * hide the section, never treat it as an error state.
 */
export async function fetchMarineWeather(
  latitude: number,
  longitude: number
): Promise<PortMarine | null> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current:
      "wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,wind_wave_height,wind_wave_direction,wind_wave_period",
    daily:
      "wave_height_max,wave_direction_dominant,wave_period_max,swell_wave_height_max,swell_wave_direction_dominant,swell_wave_period_max,wind_wave_height_max,wind_wave_direction_dominant,wind_wave_period_max",
    timezone: "auto",
    forecast_days: "7",
  });

  try {
    const res = await fetch(
      "https://marine-api.open-meteo.com/v1/marine?" + params.toString()
    );
    if (!res.ok) return null;

    const json = await res.json();
    const current = json?.current ?? {};
    const daily = json?.daily ?? {};

    const hasData =
      current.wave_height != null ||
      current.swell_wave_height != null ||
      current.wind_wave_height != null ||
      current.wave_period != null ||
      current.swell_wave_period != null ||
      current.wind_wave_period != null ||
      (daily.wave_height_max ?? []).some((v: number | null) => v != null);
    if (!hasData) return null;

    const days: MarineDay[] = (daily.time ?? []).map(
      (date: string, i: number): MarineDay => ({
        date,
        combined: waveState(
          daily.wave_height_max?.[i],
          daily.wave_direction_dominant?.[i],
          daily.wave_period_max?.[i]
        ),
        swell: waveState(
          daily.swell_wave_height_max?.[i],
          daily.swell_wave_direction_dominant?.[i],
          daily.swell_wave_period_max?.[i]
        ),
        wind: waveState(
          daily.wind_wave_height_max?.[i],
          daily.wind_wave_direction_dominant?.[i],
          daily.wind_wave_period_max?.[i]
        ),
      })
    );

    return {
      current:
        current.time != null
          ? {
              combined: waveState(
                current.wave_height,
                current.wave_direction,
                current.wave_period
              ),
              swell: waveState(
                current.swell_wave_height,
                current.swell_wave_direction,
                current.swell_wave_period
              ),
              wind: waveState(
                current.wind_wave_height,
                current.wind_wave_direction,
                current.wind_wave_period
              ),
            }
          : null,
      days,
    };
  } catch {
    // An upstream failure is indistinguishable from "no data" for the UI
    return null;
  }
}
