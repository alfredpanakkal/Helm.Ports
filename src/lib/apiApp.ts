import express, { Request, Response } from "express";
import {
  getPorts,
  getMetadata,
  getCountryCounts,
  getCountries,
  portTier,
  portSizeRank,
  vesselSizeRank,
  type PortRecord,
} from "./ports.ts";
import { fetchAstronomy } from "./astronomy.ts";
import { fetchTimezone } from "./timezone.ts";

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

export function matchesQuery(p: PortRecord, q: string): boolean {
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
 *   GET /api/ports      - filtered, sorted, paginated list (?format=points
 *                         for the map, ?format=countries for the world view)
 *   GET /api/ports/:id  - single port by WPI ID
 *   GET /api/weather    - current conditions + 7-day outlook (proxied Open-Meteo)
 *   GET /api/marine     - sea state (proxied Open-Meteo Marine API)
 *   GET /api/timezone   - zone, UTC offset & DST calendar (proxied TimeZoneDB)
 *   GET /api/tide       - hourly sea level incl. tides (proxied Open-Meteo Marine)
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
      const format = req.query.format;

      // Country index for the MapLibre world view: one entry per
      // port-having country (dot position, bounds, port count, ISO2).
      // Small and cacheable, so no pagination or filtering applies.
      if (format === "countries") {
        res.set("Cache-Control", "public, max-age=300, s-maxage=43200");
        res.json({ countries: getCountries() });
        return;
      }

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
          u: p.unlocode,
          // Single-glance popup metrics: size, vessel size, depths,
          // tide and a 4-bit restriction bitmask (1 tide, 2 swell,
          // 4 ice, 8 other) so the popup needs no extra network call.
          s: p.port_size,
          v: p.max_vessel_size,
          dm: p.channel_depth_min_m,
          m: p.mean_tidal_range_m,
          r:
            (p.entrance_restriction_tide ? 1 : 0) |
            (p.entrance_restriction_heavy_swell ? 2 : 0) |
            (p.entrance_restriction_ice ? 4 : 0) |
            (p.entrance_restriction_other ? 8 : 0),
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

  // API Astronomy - Sun & Moon transit times for a port's coordinates
  app.get("/api/astronomy", async (req: Request, res: Response) => {
    try {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      if (isNaN(lat) || lat < -90 || lat > 90 || isNaN(lng) || lng < -180 || lng > 180) {
        res.status(400).json({ error: "Invalid coordinates" });
        return;
      }
      const data = await fetchAstronomy(lat, lng);
      if (!data) {
        res.status(502).json({ error: "Astronomy data temporarily unavailable" });
        return;
      }
      res.set("Cache-Control", "public, max-age=300, s-maxage=43200");
      res.json(data);
    } catch (err) {
      console.error("Error serving astronomy data:", err);
      res.status(500).json({ error: "Failed to serve astronomy data" });
    }
  });

  // API Timezone - zone, UTC offset & DST calendar for a port's coordinates
  app.get("/api/timezone", async (req: Request, res: Response) => {
    try {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      if (isNaN(lat) || lat < -90 || lat > 90 || isNaN(lng) || lng < -180 || lng > 180) {
        res.status(400).json({ error: "Invalid coordinates" });
        return;
      }
      const data = await fetchTimezone(lat, lng);
      if (!data) {
        res.status(502).json({ error: "Timezone data temporarily unavailable" });
        return;
      }
      res.set("Cache-Control", "public, max-age=300, s-maxage=43200");
      res.json(data);
    } catch (err) {
      console.error("Error serving timezone data:", err);
      res.status(500).json({ error: "Failed to serve timezone data" });
    }
  });

  // API Tide - hourly sea level height including tides (proxied Open-Meteo Marine)
  app.get("/api/tide", async (req: Request, res: Response) => {
    try {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      if (isNaN(lat) || lat < -90 || lat > 90 || isNaN(lng) || lng < -180 || lng > 180) {
        res.status(400).json({ error: "Invalid coordinates" });
        return;
      }
      const params = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lng),
        hourly: "sea_level_height_msl",
        timezone: "auto",
        past_days: "1",
        forecast_days: "2",
      });
      const upstream = await fetch(
        "https://marine-api.open-meteo.com/v1/marine?" + params.toString()
      );
      if (!upstream.ok) {
        // Like /api/marine: outside model coverage is normal for inland ports
        res.status(502).json({ error: "Tide data unavailable for this location" });
        return;
      }
      res.set("Cache-Control", "public, max-age=300, s-maxage=1800");
      res.json(await upstream.json());
    } catch (err) {
      console.error("Error serving tide data:", err);
      res.status(500).json({ error: "Failed to serve tide data" });
    }
  });

  // API Weather - current conditions + 7-day outlook (proxied Open-Meteo)
  app.get("/api/weather", async (req: Request, res: Response) => {
    try {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      if (isNaN(lat) || lat < -90 || lat > 90 || isNaN(lng) || lng < -180 || lng > 180) {
        res.status(400).json({ error: "Invalid coordinates" });
        return;
      }
      const params = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lng),
        current:
          "temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl",
        daily:
          "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        wind_speed_unit: "kn",
        timezone: "auto",
        forecast_days: "7",
      });
      const upstream = await fetch(
        "https://api.open-meteo.com/v1/forecast?" + params.toString()
      );
      if (!upstream.ok) {
        res.status(502).json({ error: "Weather data temporarily unavailable" });
        return;
      }
      res.set("Cache-Control", "public, max-age=300, s-maxage=1800");
      res.json(await upstream.json());
    } catch (err) {
      console.error("Error serving weather data:", err);
      res.status(500).json({ error: "Failed to serve weather data" });
    }
  });

  // API Marine - sea state (proxied Open-Meteo Marine API)
  app.get("/api/marine", async (req: Request, res: Response) => {
    try {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      if (isNaN(lat) || lat < -90 || lat > 90 || isNaN(lng) || lng < -180 || lng > 180) {
        res.status(400).json({ error: "Invalid coordinates" });
        return;
      }
      const params = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lng),
        current:
          "wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,wind_wave_height,wind_wave_direction,wind_wave_period",
        daily:
          "wave_height_max,wave_direction_dominant,wave_period_max,swell_wave_height_max,swell_wave_direction_dominant,swell_wave_period_max,wind_wave_height_max,wind_wave_direction_dominant,wind_wave_period_max",
        timezone: "auto",
        forecast_days: "7",
      });
      const upstream = await fetch(
        "https://marine-api.open-meteo.com/v1/marine?" + params.toString()
      );
      if (!upstream.ok) {
        // Outside wave-model coverage is normal for inland ports; the
        // client hides the section, so surface it as unavailable, not 500
        res.status(502).json({ error: "Marine data unavailable for this location" });
        return;
      }
      res.set("Cache-Control", "public, max-age=300, s-maxage=1800");
      res.json(await upstream.json());
    } catch (err) {
      console.error("Error serving marine data:", err);
      res.status(500).json({ error: "Failed to serve marine data" });
    }
  });

  return app;
}
