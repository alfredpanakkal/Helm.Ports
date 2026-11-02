"use client";

import { useQuery } from "@tanstack/react-query";
import { Ship } from "lucide-react";
import type { ReactNode } from "react";
import type { Port } from "./types";

interface PortWatchInfo {
  portid: string | null;
  portname: string | null;
  country: string | null;
  locode: string | null;
  lat: number | null;
  lon: number | null;
  vesselTotal: number | null;
  vesselContainer: number | null;
  vesselDryBulk: number | null;
  vesselGeneralCargo: number | null;
  vesselRoRo: number | null;
  vesselTanker: number | null;
  industryTop1: string | null;
}

interface PortWatchResponse {
  matched: boolean;
  portwatch: PortWatchInfo | null;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h4>
  );
}

/**
 * World Bank PortWatch enrichment. PortWatch values are shown alongside
 * the primary WPI data under a clearly labelled section, the way sources
 * are cited in research papers - the primary record is never overwritten.
 * Renders nothing when PortWatch is unreachable or has no match, so port
 * details degrade silently.
 */
export function PortWatchCard({ port }: { port: Port }) {
  const { data } = useQuery({
    queryKey: ["portwatch", port.wpi_port_id],
    queryFn: async () => {
      const params = new URLSearchParams({
        name: port.wpi_port_name,
        country: port.country,
      });
      if (port.unlocode) params.set("locode", port.unlocode);
      const res = await fetch("/api/portwatch?" + params.toString());
      if (!res.ok) throw new Err
or("PortWatch data unavailable");
      return (await res.json()) as PortWatchResponse;
    },
    // Read-only historical stats: cache for a day, and never let an
    // upstream failure break the port detail sheet.
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const info = data?.matched ? data.portwatch : null;
  if (!info) return null;

  // Vessel activity (historical/estimated) - only with a real, positive
  // total; no empty fields or misleading zeros.
  const hasActivity = info.vesselTotal != null && info.vesselTotal > 0;
  const counts: [string, number | null][] = [
    ["Container", info.vesselContainer],
    ["Tanker", info.vesselTanker],
    ["Dry bulk", info.vesselDryBulk],
    ["General cargo", info.vesselGeneralCargo],
    ["Ro-Ro", info.vesselRoRo],
  ];
  const activityRows = hasActivity
    ? counts.filter(([, v]) => v != null && v > 0)
    : [];

  // PortWatch identity fields, shown with an explicit source label even
  // when they duplicate the WPI record (e.g. name, country, coordinates).
  const record: [string, string][] = [];
  if (info.portname) record.push(["Port name", info.portname]);
  if (info.country) record.push(["Country", info.country]);
  if (info.lat != null && info.lon != null)
    record.push(["Coordinates", info.lat.toFixed(4) + ", " + info.lon.toFixed(4)]);
  if (info.locode) record.push(["UN/LOCODE", info.locode]);

  if (!hasActivity && record.length === 0) return null;

  return (
    <div>
      {hasActivity && (
        <div>
          <SectionHeading>
            <Ship className="h-3.5 w-3.5 text-teal-600" aria-hidden /> Vessel activity
          </SectionHeading>
          <Row
            label="Total vessel activity"
            value={info.vesselTotal != null ? info.vesselTotal.toLocaleString() + " port calls" : ""}
          />
          {activityRows.map(([label, v]) => (
            <Row key={label} label={label} value={(v as number).toLocaleString()} />
         
 ))}
          {info.industryTop1 && (
            <Row label="Dominant industry" value={info.industryTop1} />
          )}
        </div>
      )}
      {record.length > 0 && (
        <div>
          <SectionHeading>
            <Ship className="h-3.5 w-3.5 text-teal-600" aria-hidden /> PortWatch record
          </SectionHeading>
          {record.map(([label, value]) => (
            <Row key={label} label={label} value={value} />
          ))}
        </div>
      )}
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Source: World Bank PortWatch ports database. Vessel activity figures
        are historical/estimated - not live vessel positions. Primary port
        data remains the NGA World Port Index.
      </p>
    </div>
  );
}
