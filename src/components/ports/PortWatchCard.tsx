"use client";

import { useQuery } from "@tanstack/react-query";
import { Ship } from "lucide-react";
import type { Port } from "./types";

interface PortWatchInfo {
  portid: string | null;
  locode: string | null;
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

/**
 * Historical vessel activity from the World Bank PortWatch database.
 * Purely additive enrichment: renders nothing when PortWatch is
 * unreachable, the port has no match, or there is no valid activity data.
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
      if (!res.ok) throw new Error("PortWatch data unavailable");
      return (await res.json()) as PortWatchResponse;
    },
    // Read-only historical stats: cache for a day, and never let an
    // upstream failure break the port detail sheet.
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const info = data?.matched ? data.portwatch : null;
  // No total activity recorded means nothing meaningful to show.
  if (!info || info.vesselTotal == null || info.vesselTotal <= 0) return null;

  const counts: [string, number | null][] = [
    ["Container", info.vesselContainer],
    ["Tanker", info.vesselTanker],
    ["Dry bulk", info.vesselDryBulk],
    ["General cargo", info.vesselGeneralCargo],
    ["Ro-Ro", info.vesselRoRo],
  ];
  // Only rows with a real, positive count - no empty or misleading zeros.
  const rows = counts.filter(([, v]) => v != null && v > 0);

  return (
    <div>
      <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Ship className="h-3.5 w-3.5 text-teal-600" aria-hidden /> Vessel activity
      </h4>
      <Row
        label="Total vessel activity"
        value={info.vesselTotal.toLocaleString() + " port calls"}
      />
      {rows.map(([label, v]) => (
        <Row key={label} label={label} value={(v as number).toLocaleString()} />
      ))}
      {info.industryTop1 && (
        <Row label="Dominant industry" value={info.industryTop1} />
      )}
      {info.locode && !port.unlocode && (
        <Row label="UN/LOCODE" value={info.locode} />
      )}
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Historical/estimated activity from the World Bank PortWatch database.
        Not live vessel positions.
      </p>
    </div>
  );
}
