"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import maplibregl, {
  type GeoJSONSource,
  type Map as MlMap,
  type Popup as MlPopup,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Button } from "@/components/ui/button";
import { ArrowLeft, List as ListIcon, Loader2, Waves } from "lucide-react";
import type { CountryEntry } from "@/lib/ports";
import { CountryList } from "./CountryList";
import { MAP_STYLE, SEAMARK_MIN_ZOOM } from "./config";
import {
  countriesFC,
  EMPTY_FC,
  escapeHtml,
  portsFC,
  type PortPoint,
} from "./geo";

interface Props {
  onSelect: (portId: number) => void;
}

const COUNTRY_LAYERS = ["country-dots", "country-labels"];
const PORT_LAYERS = ["port-dots", "port-labels"];

/**
 * MapLibre GL world map. World view shows one dot per port-having country;
 * clicking a country fits it and shows every port as an individual pin
 * with a small name label; clicking a
 * port opens a popup with name, country, UN/LOCODE and local time, plus a
 * "More details" button that opens the existing PortDetailSheet.
 *
 * The selection is reflected in the URL (?country=…) so views are shareable,
 * and the browser back button / Escape return to the world view. The legacy
 * SVG map stays the default until VITE_USE_MAPLIBRE is signed off.
 */
export function PortsMap({ onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const popupRef = useRef<MlPopup | null>(null);
  const countriesRef = useRef<CountryEntry[]>([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const restoredRef = useRef(false);

  const [country, setCountry] = useState<string | null>(null);
  const [seamarks, setSeamarks] = useState(false);
  const [zoom, setZoom] = useState(1.5);
  const [mapReady, setMapReady] = useState(false);
  const [mobileListOpen, setMobileListOpen] = useState(false);

  const countriesQuery = useQuery({
    queryKey: ["countries"],
    queryFn: async () => {
      const res = await fetch("/api/ports?format=countries");
      if (!res.ok) throw new Error("Failed to load countries");
      return (await res.json()) as { countries: CountryEntry[] };
    },
    staleTime: Infinity,
  });

  const pointsQuery = useQuery({
    queryKey: ["countryPoints", country],
    queryFn: async () => {
      const res = await fetch(
        "/api/ports?format=points&country=" + encodeURIComponent(country!)
      );
      if (!res.ok) throw new Error("Failed to load ports");
      return (await res.json()) as { total: number; points: PortPoint[] };
    },
    enabled: country != null,
    staleTime: 60_000,
  });

  const selectCountry = useCallback((name: string | null, pushUrl = true) => {
    const map = mapRef.current;
    if (!map) return;
    setCountry(name);
    setMobileListOpen(false);
    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }
    const portsSrc = map.getSource("ports");
    if (portsSrc) (portsSrc as GeoJSONSource).setData(EMPTY_FC);
    for (const id of COUNTRY_LAYERS) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", name == null ? "visible" : "none");
      }
    }
    for (const id of PORT_LAYERS) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", name == null ? "none" : "visible");
      }
    }
    if (name == null) {
      map.flyTo({ center: [20, 20], zoom: 1.5, duration: 900 });
      if (pushUrl) window.history.pushState({ helmMap: true }, "", window.location.pathname);
    } else {
      const entry = countriesRef.current.find((c) => c.name === name);
      if (entry) {
        map.fitBounds(entry.bounds, {
          padding: {
            top: 60,
            bottom: 60,
            left: 60,
            right: window.innerWidth >= 1024 ? 360 : 60,
          },
          maxZoom: 9, // single-port or tiny countries must not zoom to street level
          duration: 900,
        });
        if (pushUrl) {
          const value = entry.cc || entry.name;
          window.history.pushState(
            { helmMap: true },
            "",
            window.location.pathname + "?country=" + encodeURIComponent(value)
          );
        }
      }
    }
  }, []);
  const selectCountryRef = useRef(selectCountry);
  selectCountryRef.current = selectCountry;

  // Map init: style, sources, layers, controls and event handlers.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [20, 20],
      zoom: 1.5,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    map.addControl(
      new maplibregl.ScaleControl({ unit: "nautical", maxWidth: 100 }),
      "bottom-left"
    );

    map.on("load", () => {
      map.addSource("countries", { type: "geojson", data: EMPTY_FC });
      // No clustering: a selected country's ports (a few hundred at most)
      // render as individual pins immediately, each carrying a small
      // name label decluttered by symbol collision detection.
      map.addSource("ports", {
        type: "geojson",
        data: EMPTY_FC,
      });

      map.addLayer({
        id: "country-dots",
        type: "circle",
        source: "countries",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "count"],
            1,
            6,
            50,
            12,
            300,
            18,
          ],
          "circle-color": "#0b6ea8",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.addLayer({
        id: "country-labels",
        type: "symbol",
        source: "countries",
        layout: {
          "text-field": [
            "concat",
            ["get", "name"],
            " (",
            ["to-string", ["get", "count"]],
            ")",
          ],
          "text-size": 12,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
          "text-font": ["Open Sans Regular"],
        },
        paint: {
          "text-color": "#12263a",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      });
      map.addLayer({
        id: "port-dots",
        type: "circle",
        source: "ports",
        layout: { visibility: "none" },
        paint: {
          "circle-radius": 6,
          "circle-color": "#0b6ea8",
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
        },
      });
      // Small port-name labels so each port can be identified at a
      // glance. MapLibre symbol collision detection declutters
      // automatically; tier (t) as symbol-sort-key keeps major ports
      // labelled when space is tight.
      map.addLayer({
        id: "port-labels",
        type: "symbol",
        source: "ports",
        layout: {
          visibility: "none",
          "text-field": ["get", "n"],
          "text-size": 10.5,
          "text-offset": [0, 0.85],
          "text-anchor": "top",
          "text-font": ["Open Sans Regular"],
          "text-max-width": 8,
          "symbol-sort-key": ["get", "t"],
        },
        paint: {
          "text-color": "#12263a",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      });

      map.on("click", "country-dots", (e) => {
        const name = e.features?.[0]?.properties?.name;
        if (typeof name === "string") selectCountryRef.current(name);
      });
      map.on("mouseenter", "country-dots", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "country-dots", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("click", "port-dots", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as unknown as PortPoint;
        const coords = (f.geometry as { coordinates: [number, number] }).coordinates;
        if (popupRef.current) popupRef.current.remove();
        const popup = new maplibregl.Popup({ offset: 10, maxWidth: "260px" })
          .setLngLat(coords)
          .setHTML(
            `<div class="p-1">
              <strong class="block text-sm font-semibold text-foreground">${escapeHtml(p.n)}</strong>
              <div class="text-xs text-muted-foreground">${escapeHtml(p.c)}</div>
              <div class="mt-1 text-xs text-muted-foreground">UN/LOCODE: <span class="font-medium text-foreground">${p.u ? escapeHtml(p.u) : "—"}</span></div>
              <div class="text-xs text-muted-foreground">Local time: <span id="pp-time" class="font-medium text-foreground">…</span></div>
              <button id="pp-more" type="button" class="mt-2 w-full rounded-md bg-accent-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-80">More details</button>
            </div>`
          )
          .addTo(map);
        popupRef.current = popup;
        popup
          .getElement()
          .querySelector("#pp-more")
          ?.addEventListener("click", () => {
            onSelectRef.current(p.i);
          });
        const timeEl = popup.getElement().querySelector("#pp-time");
        void (async () => {
          if (!timeEl) return;
          try {
            const res = await fetch("/api/timezone?lat=" + p.la + "&lng=" + p.lo);
            if (!res.ok) throw new Error("timezone fetch failed");
            const tz = (await res.json()) as {
              gmtOffsetSec: number;
              abbreviation: string;
            };
            const local = new Date(Date.now() + tz.gmtOffsetSec * 1000);
            timeEl.textContent =
              local.toISOString().slice(11, 16) +
              (tz.abbreviation ? " (" + tz.abbreviation + ")" : "");
          } catch {
            timeEl.textContent = "unavailable";
          }
        })();
      });
      map.on("mouseenter", "port-dots", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "port-dots", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("zoomend", () => setZoom(map.getZoom()));
      setMapReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      popupRef.current = null;
    };
  }, []);

  // Country index data -> source, and keep the ref for URL restore.
  useEffect(() => {
    if (!countriesQuery.data) return;
    countriesRef.current = countriesQuery.data.countries;
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource("countries");
    if (src) (src as GeoJSONSource).setData(countriesFC(countriesQuery.data.countries));
  }, [mapReady, countriesQuery.data]);

  // Restore ?country=… from the URL once both map and data are ready.
  useEffect(() => {
    if (restoredRef.current || !mapReady || !countriesQuery.data) return;
    restoredRef.current = true;
    const raw = new URLSearchParams(window.location.search).get("country");
    if (!raw) return;
    const value = decodeURIComponent(raw);
    const entry = countriesQuery.data.countries.find(
      (c) =>
        (c.cc && c.cc.toUpperCase() === value.toUpperCase()) || c.name === value
    );
    if (entry) selectCountry(entry.name, false);
  }, [mapReady, countriesQuery.data, selectCountry]);

  // Ports of the selected country -> source.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource("ports");
    if (!src) return;
    if (country == null || !pointsQuery.data) {
      (src as GeoJSONSource).setData(EMPTY_FC);
      return;
    }
    (src as GeoJSONSource).setData(portsFC(pointsQuery.data.points));
  }, [mapReady, country, pointsQuery.data]);

  // Seamark overlay toggle.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer("seamark")) {
      map.setLayoutProperty("seamark", "visibility", seamarks ? "visible" : "none");
    }
  }, [seamarks, mapReady]);

  // Escape returns to the world view.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && country != null) {
        selectCountryRef.current(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [country]);

  // Browser back / forward keeps the URL and the view in sync.
  useEffect(() => {
    const onPop = () => {
      const raw = new URLSearchParams(window.location.search).get("country");
      const value = raw ? decodeURIComponent(raw) : null;
      const entry = value
        ? countriesRef.current.find(
            (c) =>
              (c.cc && c.cc.toUpperCase() === value.toUpperCase()) ||
              c.name === value
          )
        : null;
      selectCountryRef.current(entry ? entry.name : null, false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const list = (
    <CountryList
      countries={countriesQuery.data?.countries ?? []}
      selected={country}
      loading={countriesQuery.isPending}
      error={countriesQuery.isError}
      onSelect={(name) => selectCountryRef.current(name)}
    />
  );

  return (
    <div className="relative overflow-hidden rounded-lg border border-border">
      {/* Dark mode: dim and desaturate only the raster canvas so popups and
          controls keep their theme colors. */}
      <div
        ref={containerRef}
        className="h-[70dvh] min-h-[320px] sm:min-h-[420px] w-full dark:[&_.maplibregl-canvas]:brightness-[0.85] dark:[&_.maplibregl-canvas]:saturate-[0.75]"
        role="region"
        aria-label="Interactive world map of maritime ports"
      />

      {country != null && (
        <div className="absolute left-3 top-3 z-10">
          <Button
            variant="secondary"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => selectCountryRef.current(null)}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All countries
          </Button>
        </div>
      )}

      <div className="absolute right-3 top-3 z-10 flex flex-col items-end gap-1.5">
        <Button
          variant={seamarks ? "default" : "outline"}
          size="sm"
          className="h-9 gap-1.5"
          aria-pressed={seamarks}
          onClick={() => setSeamarks((s) => !s)}
        >
          <Waves className="h-4 w-4" aria-hidden />
          Seamarks
        </Button>
        {seamarks && zoom < SEAMARK_MIN_ZOOM && (
          <p className="rounded-md border border-border bg-background/90 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
            Seamark tiles appear from zoom {SEAMARK_MIN_ZOOM}
          </p>
        )}
      </div>

      {country != null && pointsQuery.isPending && (
        <div className="absolute left-1/2 top-14 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-md border border-border bg-background/90 px-2.5 py-1.5 text-xs text-muted-foreground backdrop-blur">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Loading ports…
        </div>
      )}
      {country != null && pointsQuery.isError && (
        <div className="absolute left-1/2 top-14 z-10 -translate-x-1/2 rounded-md border border-border bg-background/90 px-2.5 py-1.5 text-xs text-muted-foreground backdrop-blur">
          Failed to load ports — try again
        </div>
      )}

      {/* Country list — desktop side panel */}
      <div className="absolute bottom-24 right-3 top-14 z-10 hidden w-72 lg:block">
        {list}
      </div>

      {/* Country list — mobile */}
      <Button
        variant="secondary"
        size="sm"
        className="absolute bottom-10 left-3 z-10 h-9 gap-1.5 lg:hidden"
        onClick={() => setMobileListOpen((o) => !o)}
      >
        <ListIcon className="h-4 w-4" aria-hidden />
        Countries
      </Button>
      {mobileListOpen && (
        <div className="absolute inset-x-3 bottom-20 z-20 max-h-[50%] lg:hidden">{list}</div>
      )}
    </div>
  );
}
