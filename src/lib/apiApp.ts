import express, { Request, Response } from "express";
import {
  getPorts,
  getMetadata,
  getCountryCounts,
  portTier,
  portSizeRank,
  vesselSizeRank,
  type PortRecord,
} from "./ports.ts";

const SORTABLE = new Set([
  "wpi_port_name",
  "country",
  "port_size",
  "max_vessel_size",
  "channel_depth_max_m",
  "mean_tidal_range_m",
  "latitude",
  "longitude",
]);

function parseList(param: unknown): string[] {
  if (typeof param !== "string" || !param) return [];
  return param
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function matchesQuery(p: PortRecord, q: string): boolean {
  const needle = q.toLowerCase();
  return (
    p.wpi_port_name.toLowerCase().includes(needle) ||
    p.country.toLowerCase().includes(needle) ||
    (p.state?.toLowerCase().includes(needle) ?? false) ||
    (p.point_of_interest?.toLowerCase().includes(needle) ?? false) ||
    String(p.wpi_port_id).includes(needle)
  );
}

/**
 * Builds the Express application exposing the Helm.Ports JSON API:
 *
 *   GET /api/stats      - dataset aggregates for the filter sidebar
 *   GET /api/ports      - filtered, sorted, paginated list (?format=points for the map)
 *   GET /api/ports/:id  - single port by WPI ID
 *
 * Shared by server.ts (local dev / self-hosting, single port with the Vite
 * middleware or static dist) and api/index.ts (Vercel serverless function).
 * Contains no listener and no static-file serving so both entry points stay
 * free of deployment-specific concerns. Querying stays in-memory via
 * getPorts() (data/ports.json is parsed once and cached at module scope).
 */
export function buildApiApp(): ReturnType<typeof express> {
  const app = express();
  app.use(express.json());

  // API Stats
  app.get("/api/stats", (_req: Request, res: Response) => {
    try {
      const ports = getPorts();
      const meta = getMetadata();
      const countryCounts = getCountryCounts();

      let withDepth = 0;
      let withTidal = 0;
      let withRestrictions = 0;
      const sizeCounts = new Map<string, number>();
      const vesselCounts = new Map<string, number>();
      const maxDepths: number[] = [];

      for (const p of ports) {
        if (p.channel_depth_max_m != null) {
          withDepth++;
          maxDepths.push(p.channel_depth_max_m);
        }
        if (p.mean_tidal_range_m != null) withTidal++;
        if (
          p.entrance_restriction_tide ||
          p.entrance_restriction_heavy_swell ||
          p.entrance_restriction_ice ||
          p.entrance_restriction_other
        ) {
          withRestrictions++;
        }
        const sk = p.port_size ?? "Unclassified";
        sizeCounts.set(sk, (sizeCounts.get(sk) ?? 0) + 1);
        const vk = p.max_vessel_size ?? "Unknown";
        vesselCounts.set(vk, (vesselCounts.get(vk) ?? 0) + 1);
      }

      const bins = [0, 0, 0, 0, 0, 0];
      for (const d of maxDepths) {
        const idx = d > 25 ? 5 : Math.min(4, Math.floor(d / 5));
        bins[idx]++;
      }

      res.json({
        meta,
        totalPorts: ports.length,
        totalCountries: countryCounts.length,
        withDepth,
        withTidal,
        withRestrictions,
        sizeCounts: [...sizeCounts.entries()].sort((a, b) => b[1] - a[1]),
        vesselCounts: [...vesselCounts.entries()].sort((a, b) => b[1] - a[1]),
        topCountries: countryCounts.slice(0, 10),
        allCountries: countryCounts,
        depthBins: bins,
      });
    } catch (err) {
      console.error("Error generating stats:", err);
      res.status(500).json({ error: "Failed to generate stats" });
    }
  });

  // API Ports Search & Filter
  app.get("/api/ports", (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const countries = parseList(req.query.country);
      const portSizes = parseList(req.query.portSize);
      const vesselSizes = parseList(req.query.vesselSize);
      const minChannelDepth = req.query.minChannelDepth ? Number(req.query.minChannelDepth) : null;
      const minTidalRange = req.query.minTidalRange ? Number(req.query.minTidalRange) : null;
      const maxTidalRange = req.query.maxTidalRange ? Number(req.query.maxTidalRange) : null;
      const restrictions = parseList(req.query.restriction);
      const sort = typeof req.query.sort === "string" ? req.query.sort : "wpi_port_name";
      const order = req.query.order === "desc" ? -1 : 1;
      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
      const pageSize = Math.min(100, Math.max(10, parseInt(String(req.query.pageSize ?? "25"), 10) || 25));
      const format = req.query.format;

      const all = getPorts();
      const countrySet = countries.length ? new Set(countries) : null;
      const portSizeSet = portSizes.length ? new Set(portSizes) : null;
      const vesselSizeSet = vesselSizes.length ? new Set(vesselSizes) : null;
      const restrSet = new Set(restrictions);

      let filtered = all.filter((p) => {
        if (q && !matchesQuery(p, q)) return false;
        if (countrySet && !countrySet.has(p.country)) return false;
        if (portSizeSet) {
          const key = p.port_size ?? "none";
          if (!portSizeSet.has(key)) return false;
        }
        if (vesselSizeSet) {
          const key = p.max_vessel_size ?? "unknown";
          if (!vesselSizeSet.has(key)) return false;
        }
        if (minChannelDepth != null && !isNaN(minChannelDepth)) {
          const d = p.channel_depth_max_m;
          if (d == null || d < minChannelDepth) return false;
        }
        if (minTidalRange != null && !isNaN(minTidalRange)) {
          const t = p.mean_tidal_range_m;
          if (t == null || t < minTidalRange) return false;
        }
        if (maxTidalRange != null && !isNaN(maxTidalRange)) {
          const t = p.mean_tidal_range_m;
          if (t == null || t > maxTidalRange) return false;
        }
        if (restrSet.has("tide") && !p.entrance_restriction_tide) return false;
        if (restrSet.has("swell") && !p.entrance_restriction_heavy_swell) return false;
        if (restrSet.has("ice") && !p.entrance_restriction_ice) return false;
        if (restrSet.has("other") && !p.entrance_restriction_other) return false;
        return true;
      });

      const sortKey = SORTABLE.has(sort) ? sort : "wpi_port_name";
      filtered = [...filtered].sort((a, b) => {
        let cmp: number;
        if (sortKey === "port_size") {
          const ra = portSizeRank(a.port_size);
          const rb = portSizeRank(b.port_size);
          if (ra === 0) return 1;
          if (rb === 0) return -1;
          cmp = ra - rb;
        } else if (sortKey === "max_vessel_size") {
          const ra = vesselSizeRank(a.max_vessel_size);
          const rb = vesselSizeRank(b.max_vessel_size);
          if (ra === 0) return 1;
          if (rb === 0) return -1;
          cmp = ra - rb;
        } else {
          const av = (a[sortKey as keyof PortRecord] as number | string | null) ?? null;
          const bv = (b[sortKey as keyof PortRecord] as number | string | null) ?? null;
          if (av === null && bv === null) cmp = 0;
          else if (av === null) return 1;
          else if (bv === null) return -1;
          else if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
          else cmp = String(av).localeCompare(String(bv));
        }
        return cmp * order;
      });

      const total = filtered.length;

      if (format === "points") {
        const points = filtered.map((p) => ({
          i: p.wpi_port_id,
          n: p.wpi_port_name,
          c: p.country,
          la: p.latitude,
          lo: p.longitude,
          d: p.channel_depth_max_m,
          t: portTier(p.port_size),
        }));
        res.json({ total, points });
        return;
      }

      const start = (page - 1) * pageSize;
      const items = filtered.slice(start, start + pageSize);

      res.json({ total, page, pageSize, items });
    } catch (err) {
      console.error("Error querying ports:", err);
      res.status(500).json({ error: "Failed to query ports" });
    }
  });

  // API Single Port
  app.get("/api/ports/:id", (req: Request, res: Response) => {
    try {
      const portId = parseInt(req.params.id, 10);
      if (isNaN(portId)) {
        res.status(400).json({ error: "Invalid port ID" });
        return;
      }
      const port = getPorts().find((p) => p.wpi_port_id === portId);
      if (!port) {
        res.status(404).json({ error: "Port not found" });
        return;
      }
      res.json(port);
    } catch (err) {
      console.error("Error retrieving port:", err);
      res.status(500).json({ error: "Failed to retrieve port" });
    }
  });

  return app;
}
