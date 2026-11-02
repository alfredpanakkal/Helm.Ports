"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CloudSun, RotateCcw, Waves } from "lucide-react";
import {
  fetchPortWeather,
  fetchMarineWeather,
  type MarineWaveState,
} from "@/lib/weather";
import { describeWeather } from "@/lib/weatherCodes";

type TempUnit = "c" | "f";

const UNIT_STORAGE_KEY = "helmports-weather-unit";

function loadStoredUnit(): TempUnit {
  try {
    return window.localStorage.getItem(UNIT_STORAGE_KEY) === "f" ? "f" : "c";
  } catch {
    // Storage unavailable (private mode etc.) — fall back to °C
    return "c";
  }
}

interface Props {
  latitude: number;
  longitude: number;
}

const COMPASS_POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

function compassPoint(deg: number): string {
  const normalized = ((deg % 360) + 360) % 360;
  return COMPASS_POINTS[Math.round(normalized / 45) % 8];
}

function waveText(w: MarineWaveState): string {
  const parts: string[] = [];
  if (w.height != null) parts.push(w.height.toFixed(1) + " m");
  if (w.direction != null) parts.push(compassPoint(w.direction));
  if (w.period != null) parts.push(w.period.toFixed(0) + " s");
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

function dayLabel(date: string, index: number): string {
  if (index === 0) return "Today";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
  });
}

function temp(v: number | null, unit: TempUnit): string {
  if (v == null) return "—";
  return unit === "f"
    ? Math.round((v * 9) / 5 + 32) + "°F"
    : Math.round(v) + "°C";
}

function stripTemp(v: number | null, unit: TempUnit): string {
  if (v == null) return "—";
  return Math.round(unit === "f" ? (v * 9) / 5 + 32 : v) + "°";
}

function observedAt(iso: string | null): string {
  // Open-Meteo returns "YYYY-MM-DDTHH:MM" in the port's local time zone
  return iso != null && iso.length >= 16 ? iso.slice(11, 16) : "";
}

function fetchedAgo(timestampMs: number): string {
  if (!timestampMs) return "just now";
  const mins = Math.max(0, Math.round((Date.now() - timestampMs) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return mins + " min ago";
  const hours = Math.floor(mins / 60);
  return hours + " h " + (mins % 60) + " min ago";
}

/**
 * Current conditions and 7-day outlook for a port's coordinates, in the
 * port's local time zone. Data comes directly from the keyless
 * Open-Meteo API and is cached per rounded coordinate for 30 minutes.
 */
export function WeatherCard({ latitude, longitude }: Props) {
  const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude);
  const [unit, setUnit] = useState<TempUnit>(loadStoredUnit);

  useEffect(() => {
    try {
      window.localStorage.setItem(UNIT_STORAGE_KEY, unit);
    } catch {
      // Storage unavailable — the preference just won't persist
    }
  }, [unit]);

  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["weather", latitude.toFixed(2), longitude.toFixed(2)],
    queryFn: () => fetchPortWeather(latitude, longitude),
    staleTime: 30 * 60 * 1000,
    retry: 1,
    enabled: hasCoords,
  });

  const marine = useQuery({
    queryKey: ["marine", latitude.toFixed(2), longitude.toFixed(2)],
    queryFn: () => fetchMarineWeather(latitude, longitude),
    staleTime: 30 * 60 * 1000,
    retry: 1,
    enabled: hasCoords,
  });

  if (!hasCoords) return null;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 pt-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-sm text-muted-foreground">
          Weather data temporarily unavailable for this port.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1.5"
          onClick={() => refetch()}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Retry
        </Button>
      </div>
    );
  }

  const { current, daily } = data;
  const now = describeWeather(current.weatherCode);
  const today = daily[0];
  const obsTime = observedAt(current.time);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <CloudSun className="h-3.5 w-3.5 text-teal-600" aria-hidden /> Weather
        </h4>
        <div
          role="group"
          aria-label="Temperature unit"
          className="flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5"
        >
          {(["c", "f"] as const).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUnit(u)}
              aria-pressed={unit === u}
              className={
                "rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none transition-colors " +
                (unit === u
                  ? "bg-teal-600 text-white"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {u === "c" ? "°C" : "°F"}
            </button>
          ))}
        </div>
      </div>
      <Row
        label="Conditions"
        value={
          <span className="inline-flex items-center gap-1.5">
            <now.icon className="h-4 w-4 text-teal-600" aria-hidden />
            {now.label}
          </span>
        }
      />
      <Row label="Temperature" value={temp(current.temperature, unit)} />
      <Row
        label="Wind"
        value={
          current.windSpeed == null
            ? "—"
            : current.windSpeed.toFixed(0) +
              " kn" +
              (current.windDirection == null
                ? ""
                : " " + compassPoint(current.windDirection))
        }
      />
      <Row
        label="Pressure (MSL)"
        value={
          current.pressureMsl == null
            ? "—"
            : current.pressureMsl.toFixed(0) + " hPa"
        }
      />
      {today && (
        <Row
          label="Today"
          value={
            temp(today.tMax, unit) +
            " / " +
            temp(today.tMin, unit) +
            " · " +
            (today.rainProb == null ? "—" : today.rainProb + "%") +
            " rain"
          }
        />
      )}

      {marine.data?.current && (
        <div className="mt-2">
          <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Waves className="h-3.5 w-3.5 text-teal-600" aria-hidden /> Sea state
          </h4>
          <Row label="Sea" value={waveText(marine.data.current.combined)} />
          <Row label="Swell" value={waveText(marine.data.current.swell)} />
          <Row label="Wind sea" value={waveText(marine.data.current.wind)} />
          {marine.data.days[0] && (
            <Row
              label="Today max sea"
              value={waveText(marine.data.days[0].combined)}
            />
          )}
        </div>
      )}

      <div className="mt-3 grid grid-cols-7 gap-1">
        {daily.map((day, i) => {
          const info = describeWeather(day.weatherCode);
          return (
            <div
              key={day.date}
              className="flex flex-col items-center gap-0.5 rounded-md border border-border bg-card px-1 py-1.5 text-center"
              title={info.label}
            >
              <span className="text-[10px] font-medium text-muted-foreground">
                {dayLabel(day.date, i)}
              </span>
              <info.icon className="h-4 w-4 text-teal-600" aria-hidden />
              <span className="text-[10px] font-semibold tabular-nums text-foreground">
                {stripTemp(day.tMax, unit)}
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {stripTemp(day.tMin, unit)}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        {(obsTime ? "Observed " + obsTime + " · " : "") +
          "fetched " +
          fetchedAgo(dataUpdatedAt) +
          ". "}
        Forecast in the port's local time zone. Powered by{" "}
        <a
          href="https://open-meteo.com"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-teal-700 underline underline-offset-2 hover:text-teal-600 dark:text-teal-400 dark:hover:text-teal-300"
        >
          Open-Meteo
        </a>
        . Indicative conditions — not for navigation.
      </p>
    </div>
  );
}
