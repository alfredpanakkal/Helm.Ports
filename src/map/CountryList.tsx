"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search } from "lucide-react";
import type { CountryEntry } from "@/lib/ports";

interface Props {
  countries: CountryEntry[];
  selected: string | null;
  loading: boolean;
  error: boolean;
  onSelect: (name: string) => void;
}

/**
 * Searchable list of port-having countries. Clicking an entry does exactly
 * what clicking the matching dot on the map does.
 */
export function CountryList({ countries, selected, loading, error, onSelect }: Props) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return countries;
    return countries.filter((c) => c.name.toLowerCase().includes(needle));
  }, [countries, q]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card/95 shadow-xs backdrop-blur">
      <div className="relative border-b border-border p-2">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search countries…"
          aria-label="Search countries"
          className="h-9 bg-background pl-8 text-sm"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {loading ? (
          <div className="flex flex-col gap-1 p-1">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="p-3 text-sm text-muted-foreground">
            Failed to load countries. Reload the page to retry.
          </p>
        ) : filtered.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">No countries found.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {filtered.map((c) => (
              <li key={c.name}>
                <button
                  type="button"
                  onClick={() => onSelect(c.name)}
                  aria-current={c.name === selected ? "true" : undefined}
                  className={
                    "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors cursor-pointer " +
                    (c.name === selected
                      ? "bg-teal-600/15 font-medium text-teal-700 dark:text-teal-300"
                      : "text-foreground hover:bg-muted")
                  }
                >
                  <span className="truncate">{c.name}</span>
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                    {c.count}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
