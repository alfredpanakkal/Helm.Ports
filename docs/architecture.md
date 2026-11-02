# Architecture & System Design — Helm.Ports

This document details the architectural principles, data flow, component models, and design trade-offs behind **Helm.Ports**.

---

## 1. System Overview

Helm.Ports is built as a unified, single-port full-stack web application. It combines an Express.js in-memory query service with a React 19 single-page application (SPA), served and hot-reloaded by Vite.

```
                           +----------------------------------------+
                           |           User Web Browser             |
                           +-------------------+--------------------+
                                               |
                                     HTTP Requests (Port 3000)
                                               |
                                               v
                           +----------------------------------------+
                           |            server.ts (Express)         |
                           +-------------------+--------------------+
                                               |
                    +--------------------------+--------------------------+
                    |                                                     |
         API Routes (/api/*)                                  Vite Middleware Mode
                    |                                                     |
                    v                                                     v
       +-------------------------+                            +-------------------------+
       |   src/lib/ports.ts      |                            |     React 19 SPA        |
       |  (In-Memory Query Engine)|                            |  - TanStack Query v5    |
       +------------+------------+                            |  - PortsTable           |
                    |                                         |  - PortMap (SVG LOD)    |
         Loads & Caches Once                                  |  - FilterSidebar        |
                    v                                         |  - PortDetailSheet      |
       +-------------------------+                            +-------------------------+
       |     data/ports.json     |
       |   (5,410 Port Records)  |
       +-------------------------+
```

---

## 2. Key Architectural Decisions

### 2.1 Single-Port Full-Stack Hosting (Express + Vite Middlewares)
- **Decision**: Rather than running separate backend and frontend dev servers (e.g. backend on 3001, Vite on 5173), `server.ts` bootstraps Express and mounts `vite.middlewares` directly on port 3000.
- **Rationale**: Eliminates Cross-Origin Resource Sharing (CORS) friction, simplifies deployment, preserves proxy-free client calls (`fetch('/api/ports')`), and runs natively within containerized preview environments.

### 2.2 In-Memory Data Engine vs. Relational/Document Database
- **Decision**: Avoid an external database daemon (PostgreSQL, SQLite, MongoDB). The 5,410 port records (~3.27 MB uncompressed) are read from `data/ports.json` at process start and cached in V8 memory.
- **Rationale**:
  - Entire dataset consumes less than 3 MB of heap memory.
  - In-memory array filtering and multi-column sorting run in **1.2 ms to 3.5 ms**, faster than typical database network round-trips.
  - Zero external database setup, migrations, or connection pool maintenance.

### 2.3 Zoom-Based Level of Detail (LOD) & Compact Payload
- **Problem**: Transmitting 3.3 MB to the browser and mounting 5,410 SVG nodes at world zoom scale degrades frame rates and creates an unreadable cluster.
- **Decision**:
  - The server exposes `/api/ports?format=points`, returning an array of compact tuples:
    ```ts
    interface MapPoint {
      i: number;      // wpi_port_id (e.g. 31140)
      n: string;      // wpi_port_name (e.g. "ROTTERDAM")
      c: string;      // country (e.g. "Netherlands")
      la: number;     // latitude (51.9)
      lo: number;     // longitude (4.48)
      d: number | null; // channel_depth_max_m (34.7)
      t: number;      // LOD Tier: 1 (Major) to 4 (Very Small)
    }
    ```
  - Total payload drops from **3.3 MB to ~150 KB** (~45 KB gzipped).
  - Client map dynamically mounts dot tiers based on current zoom scale $k$:
    - $k \ge 1$: Tier 1 (Major ports, ~160 ports)
    - $k \ge 2$: + Tier 2 (Small ports, ~1,137 ports)
    - $k \ge 4$: + Tier 3 (Minor ports, ~1,499 ports)
    - $k \ge 8$: + Tier 4 (Very Small & anchorages, 5,410 ports)
  - Viewport culling strips dots outside the visible map bounding box on every pan/zoom frame.

### 2.4 Self-Contained Vector Cartography (Zero Mapbox / Leaflet Tiles)
- **Decision**: Render coastlines via static SVG path strings in `public/land.json` derived from Natural Earth 1:110m admin-0 vectors.
- **Rationale**:
  - No third-party map tile subscriptions, API keys, or rate limits.
  - Fast offline loading (120 KB JSON).
  - Perfect color control for light and dark themes using SVG fill and stroke tokens.

### 2.5 Proxied Astronomy Data (SunriseSunset.io, 12 h Cache)
- **Decision**: Port detail sheets show per-port sun/moon transit data (Merpas, nautical twilight, moon phase). Rather than calling the free SunriseSunset.io API from the browser, `server.ts` exposes `GET /api/astronomy?lat=&lng=`, which proxies `src/lib/astronomy.ts`.
- **Rationale**:
  - The upstream API is key-free but rate-limited like any public service — the proxy adds a 12-hour in-memory cache keyed on 2-decimal coordinates (~1 km cells, sufficient for transit times), so one upstream call per cell per half-day serves all visitors.
  - The route sets `Cache-Control: public, max-age=300, s-maxage=43200`, letting the CDN (Vercel) extend the same 12 h window at the edge.
  - Fail-closed contract: invalid coordinates → 400, upstream failure → 502, and **failed responses are never cached**, so a transient upstream error never blocks a port for 12 hours.
  - Client uses TanStack Query (`staleTime` 30 min, 1 retry) with a skeleton fallback — no layout shift.

---

## 3. Data Flow & Request Lifecycle

### Table View Query Flow
```
User types query or changes filter
           │
           ▼
[FilterSidebar / Input] updates React state
           │ (debounced 300ms)
           ▼
[TanStack Query] creates query key: ['ports', filters, page, pageSize, sort, order]
           │
           ▼
GET /api/ports?q=...&country=...&minChannelDepth=...&sort=...&page=1
           │
           ▼
[server.ts] queries in-memory getPorts() -> filters array -> sorts -> slices pagination
           │
           ▼
JSON Response: { total: 1, page: 1, pageSize: 25, items: [ ... ] }
           │
           ▼
[PortsTable] renders rows; user clicks row -> opens [PortDetailSheet]
```

### Port Detail Astronomy Flow
```
User opens [PortDetailSheet]
           |
           v
[AstronomyCard] creates query key: ['astronomy', lat.toFixed(2), lng.toFixed(2)]
           |
           v
GET /api/astronomy?lat=...&lng=...   (staleTime: 30 min, retry: 1)
           |
           v
[server.ts / api/index.ts] validates ranges -> src/lib/astronomy.ts
           |
           v
Cache hit? --> 12 h in-memory Map (key: "lat,lng" at 2 decimals)
  | no
  v
https://api.sunrisesunset.io/json?lat=...&lng=...  (no API key)
           |
           v
JSON Response: { sunrise, solar_noon, nautical_twilight_begin/end, moon_phase, ... }
           |
           v
[AstronomyCard] renders Merpas, sunrise/sunset, twilight, moon data in port-local times
```

### Map View Flow
```
User selects "Map" tab
           │
           ▼
[TanStack Query] fetches /api/ports?format=points (staleTime: 60s)
           │
           ▼
[PortMap] receives ~150 KB points payload
           │
           ▼
Projects (lon, lat) to (cx, cy) on 1000x500 viewBox:
cx = ((lon + 180) / 360) * 1000
cy = ((90 - lat) / 180) * 500
           │
           ▼
Calculates visible bounding box based on view (scale k, offset x, y)
Renders coastline paths + visible dots colored by sounding depth
```

---

## 4. Hydrographic Soundings & Null Handling

In hydrographic datasets, absence of data is distinct from zero depth:
- A sounding of `0.0 m` indicates an intertidal mudflat or drying shoal.
- A value of `null` indicates that the NGA has no recorded sounding for that facility.

### Sorting Contract:
When sorting by `channel_depth_max_m`, `mean_tidal_range_m`, or other physical dimensions, **null records always sort to the end**, regardless of whether the user chose ascending or descending order. This ensures operational safety and usability.

---

## 5. UI Architecture & Theming

- **Theme Management**: `src/components/theme-provider.tsx` implements a lightweight `ThemeContext` tracking `system`, `light`, and `dark` modes, with persistent storage in `localStorage`.
- **Styling Architecture**: Tailwind v4 configured via `@tailwindcss/vite`. CSS variables are mapped inside `@theme inline` in `src/index.css`.
- **Responsive Strategy**:
  - Wide screens ($\ge 1024$px): Permanent left sidebar filter panel with sticky positioning.
  - Mobile/Tablet screens ($< 1024$px): Collapsible filter drawer triggered by floating toolbar button with active filter counter badge.
