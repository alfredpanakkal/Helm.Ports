/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  keepPreviousData,
} from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import {
  Search,
  Github,
  Sun,
  Moon,
  SlidersHorizontal,
  Ship,
  Globe2,
  Ruler,
  Waves,
  Map as MapIcon,
  List,
  X,
} from "lucide-react";
import { FilterSidebar } from "@/components/ports/FilterSidebar";
import { PortsTable } from "@/components/ports/PortsTable";
import { PortMap } from "@/components/ports/PortMap";
import { PortDetailSheet } from "@/components/ports/PortDetailSheet";
import {
  activeFilterCount,
  buildQuery,
  EMPTY_FILTERS,
  type Filters,
  type MapPoint,
  type Port,
  type Stats,
} from "@/components/ports/types";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="outline"
      size="icon"
      className="h-9 w-9 relative cursor-pointer"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Toggle dark mode"
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0 text-amber-500" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100 text-teal-400" />
    </Button>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-all hover:border-teal-500/40">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-teal-600/10 text-teal-700 dark:text-teal-400">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold leading-tight tabular-nums text-foreground">
          {value}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {label} <span className="text-muted-foreground/60">· {hint}</span>
        </p>
      </div>
    </div>
  );
}

function PortsExplorer() {
  const [filters, setFiltersRaw] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState("wpi_port_name");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [tab, setTab] = useState<"list" | "map">("list");
  const [selected, setSelected] = useState<Port | number | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const debouncedQ = useDebouncedValue(filters.q, 300);

  // Effective filters use the debounced keyword so typing stays snappy
  const effectiveFilters = useMemo(
    () => ({ ...filters, q: debouncedQ }),
    [filters, debouncedQ]
  );

  const setFilters = (f: Filters) => {
    setFiltersRaw(f);
    setPage(1);
  };

  const statsQuery = useQuery({
    queryKey: ["stats"],
    queryFn: async () => {
      const res = await fetch("/api/stats");
      if (!res.ok) throw new Error("Failed to load stats");
      return (await res.json()) as Stats;
    },
  });
  const stats = statsQuery.data;

  const listQuery = useQuery({
    queryKey: ["ports", effectiveFilters, page, pageSize, sort, order],
    queryFn: async () => {
      const qs = buildQuery(effectiveFilters, { page, pageSize, sort, order });
      const res = await fetch(`/api/ports?${qs}`);
      if (!res.ok) throw new Error("Failed to load ports");
      return (await res.json()) as { total: number; items: Port[] };
    },
    placeholderData: keepPreviousData,
  });

  const mapQuery = useQuery({
    queryKey: ["mapPoints", effectiveFilters],
    queryFn: async () => {
      const qs = buildQuery(effectiveFilters, { format: "points" });
      const res = await fetch(`/api/ports?${qs}`);
      if (!res.ok) throw new Error("Failed to load map points");
      return (await res.json()) as { total: number; points: MapPoint[] };
    },
    enabled: tab === "map",
    staleTime: 60_000,
  });

  const resultCount =
    tab === "map" ? (mapQuery.data?.total ?? 0) : (listQuery.data?.total ?? 0);
  const filterCount = activeFilterCount(filters);
  const countries = stats?.allCountries ?? [];

  const onSortChange = (key: string) => {
    if (key === sort) {
      setOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setOrder("asc");
    }
    setPage(1);
  };

  const sidebar = (
    <FilterSidebar
      filters={filters}
      setFilters={setFilters}
      countries={countries}
      resultCount={resultCount}
    />
  );

  return (
    <div className="flex min-h-screen flex-col bg-background selection:bg-teal-500/20">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <a href="/" className="shrink-0" aria-label="Helm.Ports home">
              <svg
                className="h-6 w-auto shrink-0 block text-foreground"
                viewBox="0 0 1008.0 711.3"
                fill="currentColor"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M390.5 5.0L390.5 9.5L380.5 10.7C324.7 17.6 292.3 45.3 280.9 96.0C277.6 111.0 276.9 135.1 277.2 228.5L277.5 317.5L365.7 317.8L453.9 318.0L454.2 347.8C454.4 364.1 454.4 381.2 454.2 385.7L453.8 394.0L365.5 394.0L277.2 394.0L277.1 476.7C277.0 525.5 277.4 565.9 278.0 575.0C280.8 615.4 292.8 647.9 312.7 669.1C329.2 686.6 355.9 698.7 382.9 700.9L390.5 701.5L390.8 706.2L391.1 711.0L198.8 711.2C93.0 711.4 5.0 711.3 3.3 711.1C0.1 710.8 0.0 710.6 0.0 706.5C0.0 701.9 0.9 701.0 6.1 701.0C11.1 701.0 28.1 696.9 35.5 694.0C43.6 690.8 53.3 685.4 60.0 680.5C80.4 665.5 93.4 636.9 99.2 594.0C101.1 579.8 101.1 119.9 99.2 105.6C93.0 60.0 69.2 29.0 30.3 16.0C23.1 13.6 5.5 10.0 0.8 10.0C0.3 10.0 0.0 7.7 0.0 5.0L0.0 0.0L195.3 0.2L390.5 0.5L390.5 5.0ZM1008.0 4.8L1008.0 9.7L998.2 11.3C966.6 16.5 939.9 31.9 925.0 53.5C915.8 66.8 909.0 87.6 907.0 108.4C905.7 122.5 905.7 561.0 907.0 579.3C908.9 604.9 914.0 625.1 923.5 644.0C929.4 655.9 934.2 662.6 942.8 671.3C957.7 686.5 981.4 698.3 1001.9 700.6L1008.0 701.3L1008.0 706.1L1008.0 710.9L997.3 711.2C991.3 711.4 903.3 711.4 801.7 711.2L616.9 711.0L617.2 706.2L617.5 701.5L625.5 700.8C650.6 698.5 676.1 686.9 692.6 670.4C704.3 658.6 713.6 642.4 719.9 623.0C727.9 598.0 728.2 594.5 728.9 502.6L729.5 422.7L758.0 404.9C773.7 395.0 797.6 380.2 811.2 371.8C824.8 363.4 835.9 356.3 836.0 356.0C836.0 355.7 827.6 350.4 817.3 344.1C797.2 331.9 788.5 326.5 752.3 304.0L729.2 289.5L728.7 201.5C728.3 104.5 728.2 103.0 721.8 83.0C708.6 41.6 675.5 16.3 627.6 10.9L617.0 9.7L617.0 5.5C617.0 3.2 617.3 1.0 617.7 0.7C618.0 0.3 706.0 0.0 813.2 0.0L1008.0 0.0L1008.0 4.8ZM476.2 202.9C478.0 203.9 486.7 208.7 495.5 213.5C525.2 229.8 608.3 276.0 676.5 314.0C693.6 323.5 717.6 336.8 729.8 343.6C749.4 354.3 751.9 356.0 750.2 356.9C749.1 357.5 747.5 357.8 746.8 357.7C746.1 357.5 745.9 357.5 746.3 357.8C747.4 358.4 745.3 359.7 733.0 366.5C727.2 369.7 714.0 377.1 703.5 383.0C693.1 388.9 669.9 402.0 652.0 412.1C634.1 422.1 599.7 441.6 575.5 455.3C551.3 469.0 522.5 485.3 511.5 491.5C500.5 497.7 485.7 506.1 478.5 510.2C471.4 514.4 465.4 517.6 465.2 517.5C464.9 517.2 470.7 503.1 505.7 419.5C511.5 405.7 519.7 385.9 524.0 375.4L531.8 356.3L524.0 335.9C516.1 314.9 477.8 215.6 474.1 206.2C473.0 203.4 472.2 201.0 472.5 201.0C472.7 201.0 474.4 201.8 476.2 202.9Z" />
              </svg>
            </a>
            <div>
              <p
                className="hidden text-sm font-semibold tracking-wide text-foreground sm:block"
                style={{ fontFamily: "Cinzel, serif" }}
              >
                HELM.PORTS
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-9 gap-1.5" asChild>
              <a
                href="https://github.com/tayljordan/ports"
                target="_blank"
                rel="noreferrer"
              >
                <Github className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Dataset</span>
              </a>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero + search + stats */}
        <section className="border-b border-border bg-gradient-to-b from-teal-600/10 via-background to-background">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
            <div className="max-w-3xl">
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
                Explore the world&rsquo;s maritime ports
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Search {stats ? stats.totalPorts.toLocaleString() : "5,410"} ports
                and anchorages across {stats ? stats.totalCountries : "209"}{" "}
                countries and territories — with recorded depths, tidal ranges,
                entrance restrictions, and vessel size capacities.
              </p>
            </div>

            <div className="relative mt-5 max-w-xl">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                role="searchbox"
                aria-label="Search ports by name, country or WPI ID"
                placeholder="Search by port name, country, or WPI ID (e.g. Rotterdam, Singapore, 22270)..."
                value={filters.q}
                onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                className="h-11 pl-9 pr-9 text-sm shadow-sm bg-card border-border"
              />
              {filters.q && (
                <button
                  type="button"
                  onClick={() => setFilters({ ...filters, q: "" })}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {stats ? (
                <>
                  <StatCard
                    icon={Ship}
                    label="Ports & anchorages"
                    value={stats.totalPorts.toLocaleString()}
                    hint={`updated ${stats.meta.last_updated}`}
                  />
                  <StatCard
                    icon={Globe2}
                    label="Countries & territories"
                    value={stats.totalCountries.toLocaleString()}
                    hint="worldwide coverage"
                  />
                  <StatCard
                    icon={Ruler}
                    label="Depth soundings"
                    value={stats.withDepth.toLocaleString()}
                    hint="channel depths recorded"
                  />
                  <StatCard
                    icon={Waves}
                    label="Tidal data"
                    value={stats.withTidal.toLocaleString()}
                    hint="mean tidal ranges"
                  />
                </>
              ) : (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-[76px] rounded-lg" />
                ))
              )}
            </div>
          </div>
        </section>

        {/* Explorer Layout */}
        <section className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
          <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            {/* Desktop Filters Sidebar */}
            <aside className="hidden lg:block">
              <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-xs">
                {sidebar}
              </div>
            </aside>

            {/* Main Content Area */}
            <div className="min-w-0">
              {/* Toolbar */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <Tabs
                  value={tab}
                  onValueChange={(v) => setTab(v as "list" | "map")}
                >
                  <TabsList className="h-10 bg-muted/70">
                    <TabsTrigger value="list" className="gap-1.5 px-4 cursor-pointer">
                      <List className="h-4 w-4" aria-hidden />
                      List
                    </TabsTrigger>
                    <TabsTrigger value="map" className="gap-1.5 px-4 cursor-pointer">
                      <MapIcon className="h-4 w-4" aria-hidden />
                      Map
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="flex items-center gap-2">
                  <p className="hidden text-sm text-muted-foreground sm:block">
                    <span className="font-semibold tabular-nums text-foreground">
                      {resultCount.toLocaleString()}
                    </span>{" "}
                    results
                  </p>

                  {/* Mobile Filter Drawer */}
                  <Sheet
                    open={mobileFiltersOpen}
                    onOpenChange={setMobileFiltersOpen}
                  >
                    <SheetTrigger asChild>
                      <Button
                        variant="outline"
                        className="h-10 gap-1.5 lg:hidden cursor-pointer"
                      >
                        <SlidersHorizontal className="h-4 w-4" aria-hidden />
                        Filters
                        {filterCount > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-teal-600 px-1 text-[11px] font-semibold text-white">
                            {filterCount}
                          </span>
                        )}
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-80 overflow-y-auto">
                      <SheetHeader>
                        <SheetTitle>Filters</SheetTitle>
                      </SheetHeader>
                      <div className="px-4 pb-8">{sidebar}</div>
                    </SheetContent>
                  </Sheet>
                </div>
              </div>

              {/* View Panel */}
              {tab === "list" ? (
                <PortsTable
                  ports={listQuery.data?.items ?? []}
                  total={listQuery.data?.total ?? 0}
                  page={page}
                  pageSize={pageSize}
                  sort={sort}
                  order={order}
                  loading={listQuery.isPending}
                  onPageChange={setPage}
                  onPageSizeChange={(s) => {
                    setPageSize(s);
                    setPage(1);
                  }}
                  onSortChange={onSortChange}
                  onSelect={(p) => setSelected(p)}
                />
              ) : (
                <PortMap
                  points={mapQuery.data?.points ?? []}
                  total={mapQuery.data?.total ?? 0}
                  loading={mapQuery.isPending}
                  onSelect={(id) => setSelected(id)}
                />
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <p className="text-xs text-muted-foreground">
              Data:{" "}
              <a
                href="https://github.com/tayljordan/ports"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-teal-700 underline underline-offset-2 hover:text-teal-600 dark:text-teal-400 dark:hover:text-teal-300"
              >
                tayljordan/ports
              </a>{" "}
              (MIT) · NGA Publication 150, World Port Index, 2019 edition
              {stats
                ? ` · schema v${stats.meta.schema_version} · ${stats.meta.last_updated}`
                : ""}
            </p>
            <p className="text-xs text-muted-foreground/70">
              Not for navigation — always consult current nautical charts.
            </p>
          </div>
        </div>
      </footer>

      {/* Detail Slide-over Sheet */}
      <PortDetailSheet port={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="helm-ports-theme">
      <QueryClientProvider client={queryClient}>
        <PortsExplorer />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
