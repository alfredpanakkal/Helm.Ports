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
              <img
                src="/logo.svg"
                alt="Helm.Ports"
                className="h-10 w-auto rounded-md"
              />
            </a>
            <div>
              <p className="hidden text-xs text-muted-foreground sm:block">
                World Port Index · NGA Pub. 150
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
