"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface TimezoneData {
  zoneName: string;
  abbreviation: string;
  gmtOffsetSec: number;
  dstActive: boolean;
  periodStart: number | null;
  periodEnd: number;
  nextAbbreviation: string | null;
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

function offsetStr(sec: number): string {
  const sign = sec < 0 ? "-" : "+";
  const abs = Math.abs(sec);
  const h = Math.floor(abs / 3600);
  const m = (abs % 3600) / 60;
  return (
    "UTC" +
    sign +
    String(h).padStart(2, "0") +
    ":" +
    String(m).padStart(2, "0")
  );
}

function localDate(unixSec: number, gmtOffsetSec: number): string {
  // A clock-change instant rendered in the port's own time zone
  return new Date((unixSec + gmtOffsetSec) * 1000).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Time zone panel for a port's coordinates: IANA zone, current UTC
 * offset, and the daylight-saving calendar (whether DST is observed,
 * when it starts / ends). Data comes from GET /api/timezone, which
 * proxies TimeZoneDB and caches responses for 12 hours.
 */
export function TimezoneCard({ latitude, longitude }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["timezone", latitude.toFixed(2), longitude.toFixed(2)],
    queryFn: async () => {
      const res = await fetch(
        "/api/timezone?lat=" + latitude + "&lng=" + longitude
      );
      if (!res.ok) throw new Error("Failed to load timezone data");
      return (await res.json()) as TimezoneData;
    },
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 pt-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="text-sm text-muted-foreground">
        Time zone data temporarily unavailable for this port.
      </p>
    );
  }

  const dstObserved =
    data.nextAbbreviation != null &&
    data.nextAbbreviation !== data.abbreviation;
  const dstText = !dstObserved
    ? "Not observed in this zone"
    : data.dstActive
      ? "Active · ends " + localDate(data.periodEnd, data.gmtOffsetSec)
      : "Starts " + localDate(data.periodEnd, data.gmtOffsetSec);

  return (
    <div>
      <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Clock className="h-3.5 w-3.5 text-teal-600" aria-hidden /> Time & Daylight Saving
      </h4>
      <Row
        label="Time zone"
        value={data.zoneName + " (" + data.abbreviation + ")"}
      />
      <Row label="UTC offset" value={offsetStr(data.gmtOffsetSec)} />
      <Row label="Daylight saving" value={dstText} />
      <Row
        label="Offset since"
        value={
          data.periodStart != null
            ? localDate(data.periodStart, data.gmtOffsetSec)
            : "—"
        }
      />
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Dates shown in the port's time zone. Powered by{" "}
        <a
          href="https://timezonedb.com"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-teal-700 underline underline-offset-2 hover:text-teal-600 dark:text-teal-400 dark:hover:text-teal-300"
        >
          TimeZoneDB
        </a>
        {" (with "}
        <a
          href="https://hourora.app"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-teal-700 underline underline-offset-2 hover:text-teal-600 dark:text-teal-400 dark:hover:text-teal-300"
        >
          Hourora
        </a>
        {" fallback)"}. Clock-change dates are indicative — not for navigation planning.
      </p>
    </div>
  );
}
