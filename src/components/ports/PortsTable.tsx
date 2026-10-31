"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Waves,
  Snowflake,
  MoonStar,
  AlertTriangle,
} from "lucide-react";
import { formatDepth, type Port } from "./types";

const SIZE_BADGE: Record<string, string> = {
  Major: "bg-teal-600 text-white",
  Small: "bg-teal-500/90 text-white",
  Minor: "bg-teal-400/80 text-white",
  "Very Small": "bg-teal-300/70 text-teal-950",
};

const SORT_COLUMNS = [
  { key: "wpi_port_name", label: "Port" },
  { key: "country", label: "Country" },
  { key: "port_size", label: "Size" },
  { key: "max_vessel_size", label: "Vessels" },
  { key: "channel_depth_max_m", label: "Channel depth" },
  { key: "mean_tidal_range_m", label: "Tidal range" },
] as const;

interface Props {
  ports: Port[];
  total: number;
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  loading: boolean;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
  onSortChange: (key: string) => void;
  onSelect: (p: Port) => void;
}

export function PortsTable({
  ports,
  total,
  page,
  pageSize,
  sort,
  order,
  loading,
  onPageChange,
  onPageSizeChange,
  onSortChange,
  onSelect,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  const SortIcon = ({ k }: { k: string }) => {
    if (sort !== k)
      return <ArrowUpDown className="ml-1 inline h-3 w-3 text-muted-foreground/50" aria-hidden />;
    return order === "asc" ? (
      <ArrowUp className="ml-1 inline h-3 w-3 text-teal-600" aria-hidden />
    ) : (
      <ArrowDown className="ml-1 inline h-3 w-3 text-teal-600" aria-hidden />
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {SORT_COLUMNS.map((c) => (
                <TableHead key={c.key}>
                  <button
                    type="button"
                    onClick={() => onSortChange(c.key)}
                    className="inline-flex items-center font-medium text-muted-foreground hover:text-foreground"
                    aria-label={`Sort by ${c.label}`}
                  >
                    {c.label}
                    <SortIcon k={c.key} />
                  </button>
                </TableHead>
              ))}
              <TableHead className="font-medium text-muted-foreground">Restrictions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  {SORT_COLUMNS.map((c) => (
                    <TableCell key={c.key}>
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </TableCell>
                  ))}
                  <TableCell>
                    <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                  </TableCell>
                </TableRow>
              ))
            ) : ports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-sm text-muted-foreground">
                  No ports match the current filters. Try widening your search.
                </TableCell>
              </TableRow>
            ) : (
              ports.map((p) => (
                <TableRow
                  key={p.wpi_port_id}
                  onClick={() => onSelect(p)}
                  className="cursor-pointer"
                >
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{p.wpi_port_name}</span>
                      <span className="text-xs text-muted-foreground">
                        WPI {p.wpi_port_id}
                        {p.state ? ` · ${p.state}` : ""}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.country}</TableCell>
                  <TableCell>
                    {p.port_size && p.port_size !== "unknown" ? (
                      <Badge
                        className={`text-[11px] font-medium ${SIZE_BADGE[p.port_size] ?? "bg-muted text-foreground"}`}
                      >
                        {p.port_size}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm capitalize text-muted-foreground">
                    {p.max_vessel_size ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums text-muted-foreground">
                    {formatDepth(p.channel_depth_max_m)}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums text-muted-foreground">
                    {formatDepth(p.mean_tidal_range_m)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {p.entrance_restriction_tide && (
                        <MoonStar className="h-3.5 w-3.5 text-amber-600" aria-label="Tide restricted" />
                      )}
                      {p.entrance_restriction_heavy_swell && (
                        <Waves className="h-3.5 w-3.5 text-orange-600" aria-label="Heavy swell" />
                      )}
                      {p.entrance_restriction_ice && (
                        <Snowflake className="h-3.5 w-3.5 text-sky-500" aria-label="Ice restricted" />
                      )}
                      {p.entrance_restriction_other && (
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-500" aria-label="Other restriction" />
                      )}
                      {!p.entrance_restriction_tide &&
                        !p.entrance_restriction_heavy_swell &&
                        !p.entrance_restriction_ice &&
                        !p.entrance_restriction_other && (
                          <span className="text-xs text-muted-foreground">none</span>
                        )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-xs text-muted-foreground">
          Showing{" "}
          <span className="font-medium tabular-nums text-foreground">
            {start.toLocaleString()}–{end.toLocaleString()}
          </span>{" "}
          of <span className="font-medium tabular-nums text-foreground">{total.toLocaleString()}</span>{" "}
          ports
        </p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Rows</span>
            <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
              <SelectTrigger className="h-8 w-[70px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 text-xs tabular-nums text-muted-foreground">
              {page} / {totalPages.toLocaleString()}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
