/**
 * Weather lookup for a port's coordinates via the free Open-Meteo API
 * (keyless, no account). Returns only the fields the detail sheet shows:
 * current conditions plus a 7-day outlook in the port's local time zone.
 * Kept free of UI code so it can be reused and tested standalone.
 */

export interface CurrentWeather {
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
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current:
      "temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    wind_speed_unit: "kn",
    timezone: "auto",
    forecast_days: "7",
  });

  const res = await fetch(
    "https://api.open-meteo.com/v1/forecast?" + params.toString()
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
      temperature: current.temperature_2m ?? null,
      weatherCode: current.weather_code ?? null,
      windSpeed: current.wind_speed_10m ?? null,
      windDirection: current.wind_direction_10m ?? null,
      pressureMsl: current.pressure_msl ?? null,
    },
    daily: days,
  };
}
