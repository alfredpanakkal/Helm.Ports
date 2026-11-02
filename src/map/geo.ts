import type { FeatureCollection } from "geojson";
import type { MapPoint } from "@/components/ports/types";
import type { CountryEntry } from "@/lib/ports";

/** Compact port point as served by /api/ports?format=points (MapPoint + u). */
export type PortPoint = MapPoint;

export const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };

/** One Feature per port-having country: a dot at the mean port position. */
export function countriesFC(countries: CountryEntry[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: countries.map((c) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: c.center },
      properties: { name: c.name, count: c.count, cc: c.cc ?? "" },
    })),
  };
}

/** Ports of one country as a FeatureCollection for the clustered source. */
export function portsFC(points: PortPoint[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lo, p.la] },
      properties: { i: p.i, n: p.n, c: p.c, d: p.d, t: p.t, u: p.u },
    })),
  };
}

/** Escape untrusted strings before they go into popup HTML. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
