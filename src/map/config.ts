successfully downloaded text file (SHA: 769e35e645b538b972a72d8433ac8575e1bdafa0)import type { StyleSpecification } from "maplibre-gl";

/**
 * Raster base tiles. The default OpenStreetMap server is fine for
 * development but its usage policy forbids heavy production traffic —
 * point VITE_OSM_TILE_URL at a metered provider (MapTiler, Stadia Maps, ...)
 * for production and restrict the key by domain in the provider dashboard.
 * The value ships to the browser either way.
 */
export const OSM_TILES: string =
  (import.meta.env.VITE_OSM_TILE_URL as string | undefined) ??
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/** Community-hosted OpenSeaMap seamarks — best effort, optional overlay. */
export const SEAMARK_TILES = "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png";

/**
 * Keyless glyph server so symbol layers (country labels, cluster counts)
 * can render text. Swap for a self-hosted font stack if this goes away.
 */
export const GLYPHS = "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf";
export const LABEL_FONT = ["Open Sans Regular"];

/** Seamark tiles are only useful from this zoom level up. */
export const SEAMARK_MIN_ZOOM = 6;

export const MAP_STYLE: StyleSpecification = {
  version: 8,
  glyphs: GLYPHS,
  sources: {
    osm: {
      type: "raster",
      tiles: [OSM_TILES],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        "© <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors",
    },
    seamark: {
      type: "raster",
      tiles: [SEAMARK_TILES],
      tileSize: 256,
      maxzoom: 18,
      attribution:
        "© <a href=\"https://www.openseamap.org/\">OpenSeaMap</a> contributors",
    },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#e3f1f0" } },
    { id: "osm", type: "raster", source: "osm" },
    {
      id: "seamark",
      type: "raster",
      source: "seamark",
      minzoom: SEAMARK_MIN_ZOOM,
      layout: { visibility: "none" },
    },
  ],
};

/**
 * Port pin colours by size tier (t: 1 Major, 2 Small, 3 Minor, 4 Very
 * Small / unclassified). Same moss ramp as the UI port-size badges
 * (PORT_SIZE_STYLES); each pair is the WCAG-AA fill/text pair verified in
 * src/lib/contrast.test.ts — the second colour is used as the pin ring
 * (the badge text colour), and Very Small pins are outline-only, like
 * their badge.
 */
export const PIN_COLORS_LIGHT: Record<number, [string, string]> = {
  1: ["#2F6B4F", "#FFFFFF"], // Major — sidebar-primary + white
  2: ["#A9D3BB", "#16301F"], // Small
  3: ["#DDEFE0", "#2F6B4F"], // Minor — accent + accent-foreground, thin ring
  4: ["rgba(0,0,0,0)", "#5D665F"], // Very Small — outline only, muted
};

export const PIN_COLORS_DARK: Record<number, [string, string]> = {
  1: ["#8FCBA8", "#0E1210"], // Major
  2: ["#2F5A44", "#E9EDE9"], // Small
  3: ["#1C2A22", "#B7E2C9"], // Minor
  4: ["rgba(0,0,0,0)", "#9FA69F"], // Very Small — outline only, muted
};

/**
 * World-view country marker + label colours (moss palette). dot = [fill,
 * ring], label = [text, halo]. Replaces the pre-moss blue (#0b6ea8 fill,
 * #12263a text) with the same tokens as the pin ramp, so dots and labels
 * match the rest of the UI in both themes.
 */
export const COUNTRY_COLORS_LIGHT = {
  dot: ["#2F6B4F", "#FFFFFF"], // sidebar-primary + white ring
  label: ["#1D211E", "#FFFFFF"], // foreground on a white halo
};

export const COUNTRY_COLORS_DARK = {
  dot: ["#8FCBA8", "#0E1210"], // dark sidebar-primary + dark background ring
  label: ["#E9EDE9", "#0E1210"], // dark foreground on a dark halo
};
