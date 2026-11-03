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
import { MapPin, Anchor, Ruler, Waves, Ship, ScrollText } from "lucide-react";
import { AstronomyCard } from "./AstronomyCard";
import { TimezoneCard } from "./TimezoneCard";
import { WeatherCard } from "./WeatherCard";
import { TideCard } from "./TideCard";
import { formatDepth, formatRange, PORT_SIZE_STYLES, type Port } from "./types";
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

/** snake_case key -> readable label ("maximum_vessel_draft_m" -> "Maximum Vessel Draft (m)"). */
const LABEL_TOKENS: Record<string, string> = {
  m: "(m)",
  iho: "IHO",
  lng: "LNG",
  vts: "VTS",
  us: "US",
  un: "UN",
  oid: "OID",
  navarea: "NAVAREA",
  wpi: "WPI",
  ro: "Ro-Ro",
  plus: "+",
};
const LOWERCASE_TOKENS = new Set(["of", "or", "and"]);

function prettifyKey(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map((t) =>
      LOWERCASE_TOKENS.has(t)
        ? t
        : LABEL_TOKENS[t] ?? t.charAt(0).toUpperCase() + t.slice(1)
    )
    .join(" ")
    .replace(/ S (\d)/g, " S-$1")
    .replace("Ro-Ro Ro-Ro", "Ro-Ro")
    .replace(" + Tons", "+ Tons")
    .replace("UN LOCODE", "UN/LOCODE");
}

/** Grouping for the full-record view. First match wins; "Other" catches the rest. */
const DETAIL_GROUPS: [string, RegExp][] = [
  [
    "Identification",
    /^(wpi_port_id|wpi_port_name|main_port_name|alternate_port_name|world_port_index_number|un_locode|unlocode|country|country_code|region_name|state|oid|us_representative|navarea|first_port_of_entry|point_of_interest)$/,
  ],
  ["Location & Water Body", /^(latitude|longitude|geometry|world_water_body|iho_s_130_sea_area)$/],
  ["Harbor", /^(port_size|harbor_size|harbor_type|harbor_use|shelter_afforded|good_holding_ground)$/],
  ["Depths & Dimensions", /(depth|tidal_range|entrance_width|turning_area|overhead_limits)/],
  ["Vessel Limits", /(vessel_length|vessel_draft|vessel_beam|vessel_size|offshore_maximum)/],
  ["Entrance Restrictions", /entrance_restriction/],
  ["Pilotage & Tugs", /^(pilotage|tugs)_/],
  ["Facilities", /^facilities_/],
  [
    "Services & Repairs",
    /^(services_|repairs|dry_dock|medical_facilities|degaussing|garbage_disposal|dirty_ballast_disposal|chemical_holding_tank_disposal)/,
  ],
  ["Supplies", /^supplies_/],
  ["Communications", /^communications_/],
  [
    "Navigation, Safety & Charts",
    /^(railway|port_security|vessel_traffic_service|estimated_time_of_arrival_message|search_and_rescue|traffic_separation_scheme|sailing_direction_or_publication|publication_link|.*nautical_chart|iho_s_|underkeel_clearance_management_system)$/,
  ],
  ["Cargo Handling", /^(lifts|cranes)_/],
  ["Quarantine", /^quarantine_/],
];

const LEGACY_KEYS = new Set([
  "wpi_port_id",
  "wpi_port_name",
  "state",
  "country",
  "latitude",
  "longitude",
  "channel_depth_min_m",
  "channel_depth_max_m",
  "anchorage_depth_min_m",
  "anchorage_depth_max_m",
  "cargo_pier_depth_min_m",
  "cargo_pier_depth_max_m",
  "oil_terminal_depth_min_m",
  "oil_terminal_depth_max_m",
  "mean_tidal_range_m",
  "entrance_restriction_tide",
  "entrance_restriction_heavy_swell",
  "entrance_restriction_ice",
  "entrance_restriction_other",
  "max_vessel_size",
  "point_of_interest",
  "port_size",
  "unlocode",
]);

function formatDetailValue(v: unknown): string {
  if (v == null) return "—";
  if (v === true) return "Yes";
  if (v === false) return "No";
  return String(v);
}

/** Every non-legacy key of the record, grouped, rendered under "Full record". */
function FullRecordSection({ port }: { port: Port }) {
  const extras = Object.entries(port).filter(([key]) => !LEGACY_KEYS.has(key));
  if (extras.length === 0) return null;

  const grouped = new Map<string, [string, string][]>();
  for (const [key, value] of extras) {
    const title =
      DETAIL_GROUPS.find(([, pattern]) => pattern.test(key))?.[0] ?? "Other";
    const list = grouped.get(title) ?? [];
    list.push([prettifyKey(key), formatDetailValue(value)]);
    grouped.set(title, list);
  }

  const orderedTitles = [
    ...DETAIL_GROUPS.map(([title]) => title),
    "Other",
  ].filter((title) => grouped.has(title));

  return (
    <div>
      <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <ScrollText className="h-3.5 w-3.5 text-accent-foreground" aria-hidden />{" "}
        Full NGA Pub 150 record
      </h4>
      {orderedTitles.map((title) => (
        <div key={title} className="mt-3 first:mt-0">
          <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            {title}
          </p>
          {(grouped.get(title) ?? []).map(([label, value]) => (
            <Row
              key={label}
              label={label}
              value={<span className="break-words">{value}</span>}
            />
          ))}
        </div>
      ))}
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
  const locode = port.unlocode ?? port.un_locode;
  const vesselHarborInfo =
    locode != null ||
    port.alternate_port_name != null ||
    port.harbor_type != null ||
    port.maximum_vessel_length_m != null ||
    port.maximum_vessel_draft_m != null ||
    port.maximum_vessel_beam_m != null ||
    port.pilotage_compulsory != null ||
    port.tugs_assistance != null;

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

      {vesselHarborInfo && (
        <div>
          <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Ship className="h-3.5 w-3.5 text-accent-foreground" aria-hidden /> Vessel &amp; harbor
          </h4>
          {locode && <Row label="UN/LOCODE" value={locode} />}
          {port.alternate_port_name && (
            <Row label="Also known as" value={port.alternate_port_name} />
          )}
          {port.harbor_type && <Row label="Harbor type" value={port.harbor_type} />}
          {port.maximum_vessel_length_m != null && (
            <Row label="Max vessel LOA" value={formatDepth(port.maximum_vessel_length_m)} />
          )}
          {port.maximum_vessel_beam_m != null && (
            <Row label="Max vessel beam" value={formatDepth(port.maximum_vessel_beam_m)} />
          )}
          {port.maximum_vessel_draft_m != null && (
            <Row label="Max vessel draft" value={formatDepth(port.maximum_vessel_draft_m)} />
          )}
          {port.pilotage_compulsory != null && (
            <Row
              label="Pilotage"
              value={port.pilotage_compulsory ? "Compulsory" : "Not compulsory"}
            />
          )}
          {port.tugs_assistance != null && (
            <Row
              label="Tug assistance"
              value={port.tugs_assistance ? "Available" : "Not available"}
            />
          )}
        </div>
      )}

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

      <FullRecordSection port={port} />

      <Separator />

      <p className="text-xs leading-relaxed text-muted-foreground">
        Data from the NGA Publication 150 World Port Index (Updated Pub 150 export, 2026),
        published by the{" "}
        <a
          href="https://msi.nga.mil"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-accent-foreground underline underline-offset-2 hover:opacity-80"
        >
          NGA Maritime Safety Information
        </a>{" "}
        portal. Depth values represent a single recorded sounding and do not account for shifting
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
