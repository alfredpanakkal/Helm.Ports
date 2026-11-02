import type { StyleSpecification } from "maplibre-gl";

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
