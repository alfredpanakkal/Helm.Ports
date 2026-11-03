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
import { useTheme } from "@/components/theme-provider";
import { ArrowLeft, List as ListIcon, Loader2, Waves } from "lucide-react";
import { formatDepth, formatRange, PORT_SIZE_STYLES } from "@/components/ports/types";
import type { CountryEntry } from "@/lib/ports";
import { CountryList } from "./CountryList";
import {
  COUNTRY_COLORS_DARK,
  COUNTRY_COLORS_LIGHT,
  MAP_STYLE,
  PIN_COLORS_DARK,
  PIN_COLORS_LIGHT,
  SEAMARK_MIN_ZOOM,
} from "./config";
import {
  countriesFC,
  EMPTY_FC,
  escapeHtml,
  portsFC,
  type PortPoint,
} from "./geo";
import { localTimeLabel } from "./localTime";

interface Props {
  onSelect: (portId: number) => void;
}

const COUNTRY_LAYERS = ["country-dots", "country-labels"];
const PORT_LAYERS = ["port-dots", "port-labels"];

/**
 * MapLibre GL world map. World view shows one dot per port-having country;
 * clicking a country fits it and shows every port as an individual,
 * tier-coloured pin (moss size ramp) with a small name label; clicking a
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
  const { resolvedTheme } = useTheme();

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
          // One compact, uniform dot per country: the port count lives
          // in the label, not the marker, so the world view scans evenly.
          "circle-radius": 5,
          "circle-color": COUNTRY_COLORS_LIGHT.dot[0],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": COUNTRY_COLORS_LIGHT.dot[1],
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
          // Snug under the smaller dot (was 1.2 for the old
          // count-scaled markers).
          "text-offset": [0, 0.7],
          "text-anchor": "top",
          "text-font": ["Open Sans Regular"],
        },
        paint: {
          "text-color": COUNTRY_COLORS_LIGHT.label[0],
          "text-halo-color": COUNTRY_COLORS_LIGHT.label[1],
          "text-halo-width": 1.5,
        },
      });
      // Tier-coloured pins (t: 1 Major … 4 Very Small): the same moss
      // ramp as the port-size badges. The badge text colour doubles as
      // the pin ring; Very Small pins are outline-only. Palettes live in
      // config.ts and are swapped on theme change (see effect below).
      map.addLayer({
        id: "port-dots",
        type: "circle",
        source: "ports",
        layout: { visibility: "none" },
        paint: {
          "circle-radius": 6,
          "circle-color": [
            "match",
            ["get", "t"],
            1,
            PIN_COLORS_LIGHT[1][0],
            2,
            PIN_COLORS_LIGHT[2][0],
            3,
            PIN_COLORS_LIGHT[3][0],
            4,
            PIN_COLORS_LIGHT[4][0],
            PIN_COLORS_LIGHT[4][0],
          ],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": [
            "match",
            ["get", "t"],
            1,
            PIN_COLORS_LIGHT[1][1],
            2,
            PIN_COLORS_LIGHT[2][1],
            3,
            PIN_COLORS_LIGHT[3][1],
            4,
            PIN_COLORS_LIGHT[4][1],
            PIN_COLORS_LIGHT[4][1],
          ],
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
        // Zero-API single-glance summary: everything below comes from the
        // compact points payload plus the bundled tz lookup, so the card
        // renders fully populated in one frame — no placeholders.
        const time = localTimeLabel(p.la, p.lo);
        const id = p.u ? escapeHtml(p.u) : "WPI #" + p.i;
        const pills: string[] = [];
        if (p.s && PORT_SIZE_STYLES[p.s]) {
          pills.push(
            '<span class="text-[11px] px-1.5 py-0.5 rounded-full font-medium ' +
              PORT_SIZE_STYLES[p.s] +
              '">' +
              escapeHtml(p.s) +
              " port</span>"
          );
        }
        if (p.v) {
          pills.push(
            '<span class="capitalize border border-border text-foreground text-[11px] px-1.5 py-0.5 rounded-full font-medium">' +
              escapeHtml(p.v) +
              "</span>"
          );
        }
        const restrictions: string[] = [];
        if (p.r & 1) restrictions.push("Tide");
        if (p.r & 2) restrictions.push("Swell");
        if (p.r & 4) restrictions.push("Ice");
        if (p.r & 8) restrictions.push("Other");
        for (const restriction of restrictions.slice(0, 2)) {
          pills.push(
            '<span class="border-transparent bg-destructive text-white dark:bg-destructive/60 text-[11px] px-1.5 py-0.5 rounded-full font-medium">' +
              escapeHtml(restriction) +
              " restricted</span>"
          );
        }
        if (restrictions.length > 2) {
          pills.push(
            '<span class="border-transparent bg-destructive text-white dark:bg-destructive/60 text-[11px] px-1.5 py-0.5 rounded-full font-medium">+' +
              (restrictions.length - 2) +
              "</span>"
          );
        }
        const stats: string[] = [];
        const channel = formatRange(p.dm, p.d);
        if (channel !== "—") stats.push("Channel: " + channel);
        if (p.m != null) stats.push("Tide: " + formatDepth(p.m));
        const popup = new maplibregl.Popup({ offset: 10, maxWidth: "290px" })
          .setLngLat(coords)
          .setHTML(
            `<div class="p-1">
              <strong class="block text-sm font-semibold leading-tight text-foreground">${escapeHtml(p.n)}</strong>
              <div class="text-xs text-muted-foreground">${escapeHtml(p.c)}
                <span class="ml-1 rounded bg-muted px-1 py-0.5 font-mono text-[11px] font-medium text-foreground">${id}</span>
              </div>
              <div class="mt-1 text-xs text-muted-foreground">${time ? escapeHtml(time) + " · " : ""}${p.la.toFixed(2)}°, ${p.lo.toFixed(2)}°</div>
              ${pills.length ? '<div class="mt-1.5 flex flex-wrap gap-1">' + pills.join("") + "</div>" : ""}
              ${stats.length ? '<div class="mt-1.5 text-xs text-muted-foreground">' + stats.map(escapeHtml).join(" · ") + "</div>" : ""}
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

  // Map paint follows the active theme: port pins (moss tier ramp) and
  // the world-view country dots/labels swap to the dark moss palette.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer("port-dots")) return;
    const world = resolvedTheme === "dark" ? COUNTRY_COLORS_DARK : COUNTRY_COLORS_LIGHT;
    if (map.getLayer("country-dots")) {
      map.setPaintProperty("country-dots", "circle-color", world.dot[0]);
      map.setPaintProperty("country-dots", "circle-stroke-color", world.dot[1]);
    }
    if (map.getLayer("country-labels")) {
      map.setPaintProperty("country-labels", "text-color", world.label[0]);
      map.setPaintProperty("country-labels", "text-halo-color", world.label[1]);
    }
    const c = resolvedTheme === "dark" ? PIN_COLORS_DARK : PIN_COLORS_LIGHT;
    const fill = [
      "match",
      ["get", "t"],
      1, c[1][0],
      2, c[2][0],
      3, c[3][0],
      4, c[4][0],
      c[4][0],
    ];
    const ring = [
      "match",
      ["get", "t"],
      1, c[1][1],
      2, c[2][1],
      3, c[3][1],
      4, c[4][1],
      c[4][1],
    ];
    map.setPaintProperty("port-dots", "circle-color", fill);
    map.setPaintProperty("port-dots", "circle-stroke-color", ring);
  }, [mapReady, resolvedTheme]);

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
