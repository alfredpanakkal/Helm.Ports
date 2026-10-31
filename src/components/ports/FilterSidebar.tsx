"use client";

import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RotateCcw, Anchor } from "lucide-react";
import { EMPTY_FILTERS, type Filters } from "./types";

const PORT_SIZES = [
  { key: "Major", label: "Major" },
  { key: "Small", label: "Small" },
  { key: "Minor", label: "Minor" },
  { key: "Very Small", label: "Very Small" },
  { key: "none", label: "Unclassified" },
];

const VESSEL_SIZES = [
  { key: "large vessels", label: "Large vessels" },
  { key: "medium vessels", label: "Medium vessels" },
  { key: "unknown", label: "Unknown" },
];

const RESTRICTIONS = [
  { key: "tide", label: "Tide" },
  { key: "swell", label: "Heavy swell" },
  { key: "ice", label: "Ice" },
  { key: "other", label: "Other" },
];

interface Props {
  filters: Filters;
  setFilters: (f: Filters) => void;
  countries: [string, number][];
  resultCount: number;
}

export function FilterSidebar({ filters, setFilters, countries, resultCount }: Props) {
  const toggle = (key: "portSize" | "vesselSize" | "restriction", value: string) => {
    const list = filters[key];
    setFilters({
      ...filters,
      [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Anchor className="h-4 w-4 text-teal-600" aria-hidden />
          Filters
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setFilters({ ...EMPTY_FILTERS, q: filters.q })}
          className="h-8 px-2 text-xs text-muted-foreground"
        >
          <RotateCcw className="mr-1 h-3 w-3" aria-hidden />
          Reset
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-xs font-medium text-muted-foreground">Country</Label>
        <Select
          value={filters.country ?? "_all"}
          onValueChange={(v) => setFilters({ ...filters, country: v === "_all" ? null : v })}
        >
          <SelectTrigger className="h-9 w-full">
            <SelectValue placeholder="All countries" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All countries ({countries.length})</SelectItem>
            {countries.map(([name, count]) => (
              <SelectItem key={name} value={name}>
                {name} ({count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-xs font-medium text-muted-foreground">Port size</Label>
        <div className="flex flex-wrap gap-1.5">
          {PORT_SIZES.map((s) => {
            const active = filters.portSize.includes(s.key);
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={active}
                onClick={() => toggle("portSize", s.key)}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  active
                    ? "border-teal-600 bg-teal-600 text-white"
                    : "border-border bg-background text-muted-foreground hover:border-teal-600/50 hover:text-foreground"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-xs font-medium text-muted-foreground">Max vessel size</Label>
        <div className="flex flex-wrap gap-1.5">
          {VESSEL_SIZES.map((s) => {
            const active = filters.vesselSize.includes(s.key);
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={active}
                onClick={() => toggle("vesselSize", s.key)}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  active
                    ? "border-teal-600 bg-teal-600 text-white"
                    : "border-border bg-background text-muted-foreground hover:border-teal-600/50 hover:text-foreground"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium text-muted-foreground">
            Min channel depth (max sounding)
          </Label>
          <Badge variant="outline" className="text-[10px] font-normal">
            {filters.minChannelDepth != null ? `≥ ${filters.minChannelDepth.toFixed(0)} m` : "any"}
          </Badge>
        </div>
        <Slider
          min={0}
          max={30}
          step={1}
          value={[filters.minChannelDepth ?? 0]}
          onValueChange={([v]) =>
            setFilters({ ...filters, minChannelDepth: v > 0 ? v : null })
          }
          aria-label="Minimum channel depth in meters"
        />
        <p className="text-[11px] leading-snug text-muted-foreground">
          Screens ports by their deepest recorded channel sounding — useful for vessel draft
          checks.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium text-muted-foreground">Mean tidal range</Label>
          <Badge variant="outline" className="text-[10px] font-normal">
            {filters.minTidalRange != null || filters.maxTidalRange != null
              ? `${filters.minTidalRange ?? 0}–${filters.maxTidalRange ?? "∞"} m`
              : "any"}
          </Badge>
        </div>
        <Slider
          min={0}
          max={12}
          step={0.5}
          value={[filters.minTidalRange ?? 0, filters.maxTidalRange ?? 12]}
          onValueChange={([lo, hi]) =>
            setFilters({
              ...filters,
              minTidalRange: lo > 0 ? lo : null,
              maxTidalRange: hi < 12 ? hi : null,
            })
          }
          aria-label="Mean tidal range window in meters"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-xs font-medium text-muted-foreground">
          Entrance restrictions (must have)
        </Label>
        <div className="grid grid-cols-2 gap-2">
          {RESTRICTIONS.map((r) => (
            <label
              key={r.key}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-2 text-xs hover:border-teal-600/50"
            >
              <Checkbox
                checked={filters.restriction.includes(r.key)}
                onCheckedChange={() => toggle("restriction", r.key)}
              />
              {r.label}
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-teal-600/20 bg-teal-600/5 p-3">
        <ScrollArea className="h-auto max-h-40">
          <div className="text-xs">
            <p className="mb-1.5 font-medium text-foreground">Top countries</p>
            <ul className="space-y-1">
              {countries.slice(0, 10).map(([name, count]) => (
                <li key={name} className="flex justify-between gap-2">
                  <button
                    type="button"
                    className="truncate text-left text-muted-foreground hover:text-teal-700 hover:underline dark:hover:text-teal-400"
                    onClick={() => setFilters({ ...filters, country: name })}
                  >
                    {name}
                  </button>
                  <span className="shrink-0 tabular-nums text-muted-foreground/70">{count}</span>
                </li>
              ))}
            </ul>
          </div>
        </ScrollArea>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        <span className="font-semibold tabular-nums text-foreground">{resultCount.toLocaleString()}</span>{" "}
        ports match the current filters
      </p>
    </div>
  );
}
