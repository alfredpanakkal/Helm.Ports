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
                    |                                         |  - PortsMap (GL) / PortMap (SVG) |
         Loads & Caches Once                                  |  - FilterSidebar        |
                    v                                         |  - PortDetailSheet      |
       +-------------------------+                            +-------------------------+
       | data/portsv2-117       |
       | field.json — Updated   |
       | Pub 150 export: 3,814  |
       | records, 117 fields;   |
       | (legacy data/ports.json|
       | is the fallback)       |
       +-------------------------+
```

---

## 2. Key Architectural Decisions

### 2.1 Single-Port Full-Stack Hosting (Express + Vite Middlewares)
- **Decision**: Rather than running separate backend and frontend dev servers (e.g. backend on 3001, Vite on 5173), `server.ts` bootstraps Express and mounts `vite.middlewares` directly on port 3000.
- **Rationale**: Eliminates Cross-Origin Resource Sharing (CORS) friction, simplifies deployment, preserves proxy-free client calls (`fetch('/api/ports')`), and runs natively within containerized preview environments.

### 2.2 In-Memory Data Engine vs. Relational/Document Database
- **Decision**: Avoid an external database daemon (PostgreSQL, SQLite, MongoDB). The port records are read at process start and cached in V8 memory: primary `data/portsv2-117 field.json` (Updated Pub 150, 3,814 records, 117 fields, ~13.4 MB), with the legacy `data/ports.json` (5,410 records, ~3.3 MB) as the automatic fallback.
- **Rationale**:
  - The parsed dataset stays comfortably in the V8 heap (tens of MB for portsv2's 117 fields; under 4 MB for the legacy file).
  - In-memory array filtering and multi-column sorting run in **1.2 ms to 3.5 ms**, faster than typical database network round-trips.
  - Zero external database setup, migrations, or connection pool maintenance.

### 2.3 Dual Map Renderers: MapLibre GL (default) + Legacy SVG
- **Problem**: A tiled GL map depends on external tile services, while a self-contained SVG map offers no basemap context. Different deployments want both.
- **Decision**: Ship two renderers behind the `VITE_USE_MAPLIBRE` switch in `App.tsx` (default: GL):
  - **MapLibre GL** (`src/map/`): raster OpenStreetMap base tiles (env-swappable via `VITE_OSM_TILE_URL` for production metering), an optional OpenSeaMap seamarks overlay from zoom 6, every port of a selected country drawn as an individual tier-coloured pin (moss port-size ramp, no clustering) with a decluttered name label, a country-level world view of compact uniform country markers backed by the compact `GET /api/ports?format=countries` index (the selection is shareable via `?country=` in the URL, and back/Escape return to the world view), and a zero-API single-glance popup on pin or label click.
  - **Legacy equirectangular SVG** (`PortMap.tsx`): Natural Earth coastlines from `public/land.json` — zero tile services, no API keys, fully offline-capable.
- **LOD & compact payload (SVG renderer)**:
  - The server exposes `/api/ports?format=points`, returning an array of compact tuples:
    ```ts
    interface MapPoint {
      i: number;        // wpi_port_id (e.g. 31140)
      n: string;        // wpi_port_name (e.g. "ROTTERDAM")
      c: string;        // country (e.g. "Netherlands")
      la: number;       // latitude (51.9)
      lo: number;       // longitude (4.48)
      d: number | null; // channel_depth_max_m (34.7)
      t: number;        // LOD Tier: 1 (Large/Major) to 4 (Very Small)
      u: string | null; // UN/LOCODE (popup identity badge)
      s: string | null; // port_size (popup pill, moss ramp)
      v: string | null; // max_vessel_size (popup pill)
      dm: number | null; // channel_depth_min_m (popup channel range)
      m: number | null;  // mean_tidal_range_m (popup "Tide:" line)
      r: number;        // entrance-restriction bitmask (1 tide, 2 swell, 4 ice, 8 other)
    }
    // u/s/v/dm/m/r were added for the zero-API single-glance popup
    // (§2.8); the payload stays a compact fraction of the full dataset.
    ```
  - Total payload drops from the full dataset (**13.4 MB** portsv2 / 3.3 MB legacy) to ~150 KB (~45 KB gzipped).
  - Client map dynamically mounts dot tiers based on current zoom scale $k$:
    - $k \ge 1$: Tier 1 (Large / Major ports)
    - $k \ge 2$: + Tier 2 (Small ports)
    - $k \ge 4$: + Tier 3 (Medium / Minor ports)
    - $k \ge 8$: + Tier 4 (Very Small, unknown & anchorages — every served port; the exact counts scale with the loaded file)
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

### 2.6 Key-Free Weather, Sea State & Tide Proxies (Open-Meteo)
- **Decision**: Port detail sheets show live conditions — current weather plus a 7-day outlook (wind in knots), sea state (wave/swell height, direction, period) and an hourly tide curve. All calls go through the server proxies (`/api/weather`, `/api/marine`, `/api/tide`) to key-free Open-Meteo endpoints, with `Cache-Control: public, max-age=300, s-maxage=1800` so the CDN absorbs the traffic.
- **Fail-soft contract**: Outside model coverage (normal for inland ports) the proxies return 502 with an "unavailable for this location" message and the client hides the section. Failures are never cached.

### 2.7 Shared API App, Two Entry Points
- **Decision**: Every route lives in `src/lib/apiApp.ts` (`buildApiApp()`), which builds an Express app with no listener and no static-file serving. `server.ts` mounts it locally (plus Vite middleware in dev or `dist` in production); `api/index.ts` exports it as the Vercel serverless function, with `vercel.json` rewriting `/api/*` and bundling the dataset into the function (`includeFiles` must be a single glob string — the Vercel builder ignores the array form). One route table, zero drift between local and deployed.

### 2.8 Zero-API Single-Glance Port Popup (GL renderer)
- **Decision**: Clicking a port pin — or its name label, or the invisible 16 px hit circle that surrounds every pin — opens an instant MapLibre popup with the essentials: name, country, UN/LOCODE (or WPI ID), live local time, port-size / vessel-size / entrance-restriction pills, and the channel-depth + tidal-range summary. A "More details" button opens the full `PortDetailSheet`. Everything renders in one frame with **zero network calls**: the fields ride the compact `format=points` payload (MapPoint keys `u`, `s`, `v`, `dm`, `m`, `r`) and local time comes from the bundled `@photostructure/tz-lookup` dataset via `src/map/localTime.ts` (synchronous, offline, `null`-safe — the popup hides the time row rather than showing a placeholder).
- **Resilience**: popup HTML is built from defensively coerced feature properties (MapLibre can hand them back stringified through the tile pipeline — maplibre-gl-js#1325). Click handlers bind to all three pin layers (`port-dots`, `port-hit`, `port-labels`) and are re-bound whenever the visible layer is rebuilt; if popup construction ever throws, the click falls back to opening `PortDetailSheet` so a click can never silently do nothing.

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
- **Moss design tokens**: `src/index.css` defines a single-hue palette — warm off-white paper with a pale mint accent (light), near-black with low-opacity mint (dark). Every text pair is pinned by `src/lib/contrast.test.ts` (WCAG AA ≥ 4.5:1 in both themes; control fills ≥ 3:1).
- **Port-size ramp**: `PORT_SIZE_STYLES` in `src/components/ports/types.ts` renders port sizes as one hue at four strengths; the size label is always printed, so colour never carries meaning alone.
- **No-flash, no forced-dark theming**: an inline pre-paint script in `index.html` applies the persisted/system theme before first paint, and `color-scheme` is declared per theme so mobile browsers (Android auto-dark, Edge forced dark) do not apply their own fading filter — the cause of the earlier faded-looking app on mobile.
- **Masked decoration on its own layer**: `.hero-grid` sits on an absolutely-positioned, `pointer-events-none` element behind the hero content. A CSS mask on a content-bearing element fades everything inside it.

---

## 6. Data Hygiene & Provenance

### Invalid WPI ID rows (load-time guard)

The legacy source file contains a small number of rows whose `wpi_port_id` is `0` or non-numeric — real places (e.g. Aalborg, DK and Jebel Ali, AE) that are missing both the port name and the WPI number in the source. They are not identifiable: they all alias on `GET /api/ports/0`, cannot be deep-linked, and carry no soundings. `getPorts()` therefore serves only records with a positive integer `wpi_port_id`, and `meta.record_count` (via `/api/stats`) reflects the served count rather than the raw file row count. When the source file is regenerated without these rows, the guard becomes a no-op; `src/lib/ports.test.ts` asserts the exclusion either way.

### Sounding precision & single soundings (portsv2)

The Updated Pub 150 export records depths as native metre values quantized to 0.1 m, and **one sounding per facility** (`min === max`; a source `0` means *no data* and is stored as `null`). The legacy 2019 `ports.json` was feet-derived and also rounded to 0.1 m (e.g. 114 ft = 34.7 m), so the same invariants hold for both files. `src/lib/ports.test.ts` asserts for every served sounding: quantization to 0.1 m, and `min <= max` per facility pair. A violation means the conversion pipeline changed and must be reviewed before shipping.

### UN/LOCODE

The Updated Pub 150 export carries UN/LOCODE natively (`un_locode`, stored in the raw spaced form "AU CCU"); `normalizePort` in `src/lib/ports.ts` compacts it into the legacy `unlocode` key at load time and drops malformed codes. `src/lib/ports.test.ts` asserts the `^[A-Z]{2}[A-Z0-9]{3}$` contract for every served record. `scripts/join-unlocode.ts` (`npm run data:unlocode`) remains the joiner for the legacy `data/ports.json` fallback — it joins the UNECE code list by normalized country + port name, honours manual fixes in `data/unlocode-overrides.json` (which win over automatic matches and survive re-runs), and reports unmatched ports to `data/unmatched-unlocode.csv`. The join is idempotent and only touches the `unlocode` field.

### Provenance

`GET /api/stats` returns `meta` from the data file (`schema_version`, `record_count`, `last_updated`, `source`). `last_updated` is the dataset refresh date; When present, `source` names the edition (legacy file: "NGA Publication 150 - World Port Index, 2019 edition"; the portsv2 metadata block centers on its data dictionary and may omit `last_updated`/`source`, while `record_count` always reflects the served records). UI surfaces should print these verbatim from the API rather than hardcoding counts.
