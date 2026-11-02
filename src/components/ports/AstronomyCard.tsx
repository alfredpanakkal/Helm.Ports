"use client";

import { useQuery } from "@tanstack/react-query";
import { Sun } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface AstronomyData {
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

/**
 * Solar & lunar transit panel for a port's coordinates (today, in the
 * port's local time zone). Data comes from GET /api/astronomy, which
 * caches upstream SunriseSunset.io responses for 12 hours.
 */
export function AstronomyCard({ latitude, longitude }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["astronomy", latitude.toFixed(2), longitude.toFixed(2)],
    queryFn: async () => {
      const res = await fetch(
        "/api/astronomy?lat=" + latitude + "&lng=" + longitude
      );
      if (!res.ok) throw new Error("Failed to load astronomy data");
      return (await res.json()) as AstronomyData;
    },
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

  if (isError || !data) {
    return (
      <p className="text-sm text-muted-foreground">
        Sun &amp; moon data temporarily unavailable for this port.
      </p>
    );
  }

  return (
    <div>
      <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Sun className="h-3.5 w-3.5 text-teal-600" aria-hidden /> Solar &amp; Lunar (today)
      </h4>
      <Row label="Merpas (solar noon)" value={data.solar_noon} />
      <Row label="Sunrise / Sunset" value={data.sunrise + " / " + data.sunset} />
      <Row label="Day length" value={data.day_length} />
      <Row
        label="Nautical twilight"
        value={data.nautical_dawn + " – " + data.nautical_dusk}
      />
      <Row
        label="Moon"
        value={data.moon_phase + " (" + data.moon_illumination.toFixed(0) + "% lit)"}
      />
      <Row
        label="Moonrise / Moonset"
        value={(data.moonrise ?? "—") + " / " + (data.moonset ?? "—")}
      />
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Times in {data.timezone}. Powered by{" "}
        <a
          href="https://sunrisesunset.io"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-teal-700 underline underline-offset-2 hover:text-teal-600 dark:text-teal-400 dark:hover:text-teal-300"
        >
          SunriseSunset.io
        </a>
        . Indicative almanac data — not for navigation.
      </p>
    </div>
  );
}
