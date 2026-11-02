"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Anchor, Ruler, Waves } from "lucide-react";
import { AstronomyCard } from "./AstronomyCard";
import { TimezoneCard } from "./TimezoneCard";
import { WeatherCard } from "./WeatherCard";
import { TideCard } from "./TideCard";
import { formatRange, PORT_SIZE_STYLES, type Port } from "./types";
import { getCountryIso2 } from "@/lib/countryCodes";

interface Props {
  port: Port | number | null; // full record from table, or WPI id from map
  onClose: () => void;
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

function PortDetailBody({ port }: { port: Port }) {
  const restrictions: string[] = [];
  if (port.entrance_restriction_tide) restrictions.push("Tide");
  if (port.entrance_restriction_heavy_swell) restrictions.push("Heavy swell");
  if (port.entrance_restriction_ice) restrictions.push("Ice");
  if (port.entrance_restriction_other) restrictions.push("Other");

  const iso2 = getCountryIso2(port.country)?.toLowerCase();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {port.port_size && port.port_size !== "unknown" && (
          <Badge className={PORT_SIZE_STYLES[port.port_size] ?? "bg-muted text-foreground"}>{port.port_size} port</Badge>
        )}
        {port.max_vessel_size && (
          <Badge variant="outline" className="capitalize">
            {port.max_vessel_size}
          </Badge>
        )}
        {restrictions.length > 0 ? (
          restrictions.map((r) => (
            <Badge key={r} variant="destructive" className="font-normal">
              {r} restricted
            </Badge>
          ))
        ) : (
          <Badge variant="secondary" className="font-normal">
            No entrance restrictions recorded
          </Badge>
        )}
      </div>

      <div>
        <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 text-accent-foreground" aria-hidden /> Location
        </h4>
        <Row
          label="Country"
          value={
            <span className="inline-flex items-center gap-2">
              {iso2 && (
                <img
                  src={`https://flagcdn.com/w40/${iso2}.png`}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  width={24}
                  height={16}
                  onError={(e) => {
                    e.currentTarget.hidden = true;
                  }}
                  className="rounded-sm ring-1 ring-border"
                />
              )}
              {port.country}
            </span>
          }
        />
        {port.state && <Row label="State / Region" value={port.state} />}
        {port.point_of_interest && (
          <Row label="Point of interest" value={port.point_of_interest} />
        )}
        <Row
          label="Coordinates (WGS84)"
          value={`${port.latitude.toFixed(4)}°, ${port.longitude.toFixed(4)}°`}
        />
      </div>

      <div>
        <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Ruler className="h-3.5 w-3.5 text-accent-foreground" aria-hidden /> Depths (meters)
        </h4>
        <Row
          label="Channel"
          value={formatRange(port.channel_depth_min_m, port.channel_depth_max_m)}
        />
        <Row
          label="Anchorage"
          value={formatRange(port.anchorage_depth_min_m, port.anchorage_depth_max_m)}
        />
        <Row
          label="Cargo pier"
          value={formatRange(port.cargo_pier_depth_min_m, port.cargo_pier_depth_max_m)}
        />
        <Row
          label="Oil terminal"
          value={formatRange(port.oil_terminal_depth_min_m, port.oil_terminal_depth_max_m)}
        />
      </div>

      <div>
        <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Waves className="h-3.5 w-3.5 text-accent-foreground" aria-hidden /> Tides
        </h4>
        <Row
          label="Mean tidal range"
          value={
            port.mean_tidal_range_m != null
              ? `${port.mean_tidal_range_m.toFixed(1)} m`
              : "No data"
          }
        />
      </div>

      <TideCard latitude={port.latitude} longitude={port.longitude} />

      <WeatherCard latitude={port.latitude} longitude={port.longitude} />

      <AstronomyCard latitude={port.latitude} longitude={port.longitude} />

      <TimezoneCard latitude={port.latitude} longitude={port.longitude} />

      <Separator />

      <p className="text-xs leading-relaxed text-muted-foreground">
        Data from the NGA Publication 150 World Port Index (2019 edition), served via the{" "}
        <a
          href="https://github.com/tayljordan/ports"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-accent-foreground underline underline-offset-2 hover:opacity-80"
        >
          tayljordan/ports
        </a>{" "}
        dataset. Depth values represent a single recorded sounding and do not account for shifting
        bottom conditions or dredging. Not a substitute for current nautical charts.
      </p>
    </div>
  );
}

export function PortDetailSheet({ port, onClose }: Props) {
  const portId = typeof port === "number" ? port : port ? port.wpi_port_id : null;

  const { data, isLoading } = useQuery({
    queryKey: ["port", portId],
    queryFn: async () => {
      if (portId == null) throw new Error("Failed to load port: missing ID");
      const res = await fetch(`/api/ports/${portId}`);
      if (!res.ok) throw new Error("Failed to load port");
      return (await res.json()) as Port;
    },
    enabled: portId != null,
  });

  const resolved: Port | undefined =
    typeof port === "object" && port !== null ? port : data;
  const title = resolved?.wpi_port_name ?? "";

  return (
    <Sheet open={port != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-xl">
            <Anchor className="h-5 w-5 text-accent-foreground" aria-hidden />
            {isLoading && !resolved ? <Skeleton className="h-6 w-40" /> : title}
          </SheetTitle>
          <SheetDescription>
            World Port Index ID {resolved?.wpi_port_id ?? "…"}
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-8">
          {isLoading && !resolved ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : resolved ? (
            <PortDetailBody port={resolved} />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
