"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RotateCcw, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchTide,
  heightLabel,
  fmtTime,
  type TideDay,
} from "@/lib/tides";
import { TideChart } from "./TideChart";

type HeightUnit = "m" | "ft";

const UNIT_STORAGE_KEY = "helm-ports-height-unit";

function loadStoredUnit(): HeightUnit {
  try {
    return window.localStorage.getItem(UNIT_STORAGE_KEY) === "ft" ? "ft" : "m";
  } catch {
    // Storage unavailable (private mode etc.) — fall back to metres
    return "m";
  }
}

function shiftDate(dateISO: string, days: number): string {
  return new Date(Date.parse(dateISO + "T00:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
}

interface Props {
  latitude: number;
  longitude: number;
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

function Toggle({
  options,
  active,
  onSelect,
  ariaLabel,
}: {
  options: { value: string; label: string }[];
  active: string;
  onSelect: (v: string) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onSelect(o.value)}
          aria-pressed={active === o.value}
          className={
            "rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none transition-colors " +
            (active === o.value
              ? "bg-teal-600 text-white"
              : "text-muted-foreground hover:text-foreground")
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Daily tide block for a port's coordinates: highest high, lowest low and
 * the daily range in port-local times, with Yesterday/Today/Tomorrow
 * switching, an m/ft unit toggle and an optional scrub curve. Data comes
 * from GET /api/tide, which proxies the Open-Meteo Marine API
 * (sea_level_height_msl, hourly). Heights are above global mean sea
 * level, not chart datum.
 */
export function TideCard({ latitude, longitude }: Props) {
  const [unit, setUnit] = useState<HeightUnit>(loadStoredUnit);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showChart, setShowChart] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["tide", latitude.toFixed(2), longitude.toFixed(2)],
    queryFn: () => fetchTide(latitude, longitude),
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 pt-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-sm text-muted-foreground">
          Tide data unavailable for this location.
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

  if (!data || data.days.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Tide data unavailable for this location.
      </p>
    );
  }

  const nowLocal = new Date(Date.now() + data.utcOffsetSec * 1000);
  const todayDate = nowLocal.toISOString().slice(0, 10);
  const nowMinutes = nowLocal.getUTCHours() * 60 + nowLocal.getUTCMinutes();

  const activeDate =
    selectedDate ??
    (data.days.find((d) => d.date === todayDate)?.date ??
      data.days[Math.min(1, data.days.length - 1)].date);
  const day: TideDay | undefined = data.days.find((d) => d.date === activeDate);

  const dayOptions = [
    { date: shiftDate(todayDate, -1), label: "Yesterday" },
    { date: todayDate, label: "Today" },
    { date: shiftDate(todayDate, 1), label: "Tomorrow" },
  ].filter((o) => data.days.some((d) => d.date === o.date));

  const high = day?.highestHigh ?? null;
  const low = day?.lowestLow ?? null;
  const range = high && low ? high.height - low.height : null;
  const negligible = range != null && range < 0.1;

  const storeUnit = (u: string) => {
    const next = u === "ft" ? "ft" : "m";
    setUnit(next);
    try {
      window.localStorage.setItem(UNIT_STORAGE_KEY, next);
    } catch {
      // Storage unavailable — the preference just won't persist
    }
  };

  return (
    <div className="pt-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Waves className="h-3.5 w-3.5 text-teal-600" aria-hidden /> Tide predictions
        </h4>
        <div className="flex items-center gap-2">
          <Toggle
            ariaLabel="Tide day"
            options={dayOptions.map((o) => ({ value: o.date, label: o.label }))}
            active={activeDate}
            onSelect={setSelectedDate}
          />
          <Toggle
            ariaLabel="Height unit"
            options={[
              { value: "m", label: "m" },
              { value: "ft", label: "ft" },
            ]}
            active={unit}
            onSelect={storeUnit}
          />
        </div>
      </div>

      {!high || !low ? (
        <p className="text-sm text-muted-foreground">
          Tide data unavailable for this location.
        </p>
      ) : negligible ? (
        <p className="text-sm text-muted-foreground">
          Negligible tide (range under 0.1 m).
        </p>
      ) : (
        <>
          <Row
            label="Highest high"
            value={heightLabel(high.height, unit) + " at " + fmtTime(high.minutes)}
          />
          <Row
            label="Lowest low"
            value={heightLabel(low.height, unit) + " at " + fmtTime(low.minutes)}
          />
          <Row label="Range" value={heightLabel(range, unit)} />
          <Button
            variant="outline"
            size="sm"
            className="mt-1 h-8 gap-1.5"
            onClick={() => setShowChart((v) => !v)}
          >
            {showChart ? "Hide tide graph" : "Show tide graph"}
          </Button>
          {showChart && day && day.series.length > 1 && (
            <TideChart
              day={day}
              unit={unit}
              isToday={activeDate === todayDate}
              nowMinutes={nowMinutes}
            />
          )}
        </>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Heights above mean sea level (not chart datum). Tide model data by{" "}
        <a
          href="https://open-meteo.com"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-teal-700 underline underline-offset-2 hover:text-teal-600 dark:text-teal-400 dark:hover:text-teal-300"
        >
          Open-Meteo
        </a>
        . Indicative only — not for navigation.
      </p>
    </div>
  );
}
