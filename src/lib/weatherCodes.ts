import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  CloudSun,
  Sun,
  type LucideIcon,
} from "lucide-react";

export interface WeatherCodeInfo {
  label: string;
  icon: LucideIcon;
}

/** WMO weather interpretation codes used by Open-Meteo. */
const WEATHER_CODES: Record<number, WeatherCodeInfo> = {
  0: { label: "Clear sky", icon: Sun },
  1: { label: "Mainly clear", icon: Sun },
  2: { label: "Partly cloudy", icon: CloudSun },
  3: { label: "Overcast", icon: Cloud },
  45: { label: "Fog", icon: CloudFog },
  48: { label: "Depositing rime fog", icon: CloudFog },
  51: { label: "Light drizzle", icon: CloudDrizzle },
  53: { label: "Moderate drizzle", icon: CloudDrizzle },
  55: { label: "Dense drizzle", icon: CloudDrizzle },
  56: { label: "Light freezing drizzle", icon: CloudSnow },
  57: { label: "Dense freezing drizzle", icon: CloudSnow },
  61: { label: "Slight rain", icon: CloudRain },
  63: { label: "Moderate rain", icon: CloudRain },
  65: { label: "Heavy rain", icon: CloudRainWind },
  66: { label: "Light freezing rain", icon: CloudSnow },
  67: { label: "Heavy freezing rain", icon: CloudSnow },
  71: { label: "Slight snow fall", icon: CloudSnow },
  73: { label: "Moderate snow fall", icon: CloudSnow },
  75: { label: "Heavy snow fall", icon: CloudSnow },
  77: { label: "Snow grains", icon: CloudSnow },
  80: { label: "Slight rain showers", icon: CloudRain },
  81: { label: "Moderate rain showers", icon: CloudRain },
  82: { label: "Violent rain showers", icon: CloudRainWind },
  85: { label: "Slight snow showers", icon: CloudSnow },
  86: { label: "Heavy snow showers", icon: CloudSnow },
  95: { label: "Thunderstorm", icon: CloudLightning },
  96: { label: "Thunderstorm with slight hail", icon: CloudHail },
  99: { label: "Thunderstorm with heavy hail", icon: CloudHail },
};

export function describeWeather(code: number | null | undefined): WeatherCodeInfo {
  return WEATHER_CODES[code ?? -1] ?? { label: "Unknown", icon: Cloud };
}
