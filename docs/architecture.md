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
       | data/portsv2-117 field |
       |   .json (Updated Pub   |
       | 150 — 3,814 records;   |
       | legacy ports.json =    |
       | automatic fallback)   |
       +-------------------------+
```

---

## 2. Key Architectural Decisions

### 2.1 Single-Port Full-Stack Hosting (Express + Vite Middlewares)
- **Decision**: Rather than running separate backend and frontend dev servers (e.g. backend on 3001, Vite on 5173), `server.ts` bootstraps Express and mounts `vite.middlewares` directly on port 3000.
- **Rationale**: Eliminates Cross-Origin Resource Sharing (CORS) friction, simplifies deployment, preserves proxy-free client calls (`fetch('/api/ports')`), and runs natively within containerized preview environments.

### 2.2 In-Memory Data Engine vs. Relational/Document Database
- **Decision**: Avoid an external database daemon (PostgreSQL, SQLite, MongoDB). The port records are read from the primary dataset file at process start and cached in V8 memory. Since the Updated Pub 150 adoption this is `data/portsv2-117 field.json` (3,814 records, 117 fields, ~13.4 MB); `resolveDataFile()` in `src/lib/ports.ts` prefers `portsv2.json`, then the pushed `portsv2-117 field.json`, then the legacy `data/ports.json` (5,410 records, ~3.3 MB) as an automatic fallback, so the site keeps working on any branch state.
- **Rationale**:
  - The dataset is parsed once into the V8 heap — no database daemon, migrations, or connection pool maintenance.
  - In-memory array filtering and multi-column sorting run in the low single-digit milliseconds (1.2–3.5 ms measured on the legacy 5,410-record file; portsv2 serves fewer records), faster than typical database network round-trips.
  - Zero external database setup, migrations, or connection pool maintenance.

### 2.3 Dual Map Renderers: MapLibre GL (default) + Legacy SVG
- **Problem**: A tiled GL map depends on external tile services, while a self-contained SVG map offers no basemap context. Different deployments want both.
- **Decision**: Ship two renderers behind the `VITE_USE_MAPLIBRE` switch in `App.tsx` (default: GL):
  - **MapLibre GL** (`src/map/`): raster OpenStreetMap base tiles (env-swappable via `VITE_OSM_TILE_URL` for production metering), an optional OpenSeaMap seamarks overlay from zoom 6, and a country-first world view backed by the compact `GET /api/ports?format=countries` index — one compact uniform dot with a "Country (count)" label per port-having country. Selecting a country reveals all of its ports as individual tier-coloured pins (the moss size ramp, matching the table badges) with small name labels decluttered by symbol collision detection. Clustering was removed in favour of this country-first model; every pin carries an invisible 16 px hit target so clicks and taps never miss, and the selected country is URL-addressable (`?country=<ISO2 or name>`, restored on load; back/Escape return to the world view).
  - **Legacy equirectangular SVG** (`PortMap.tsx`): Natural Earth coastlines from `public/land.json` — zero tile services, no API keys, fully offline-capable.
- **LOD & compact payload (SVG renderer)**:
  - The server exposes `/api/ports?format=points`, returning an array of compact tuples:
    ```ts
    interface MapPoint {
      i: number;       // wpi_port_id (e.g. 31140)
      n: string;       // wpi_port_name (e.g. "ROTTERDAM")
      c: string;       // country (e.g. "Netherlands")
      la: number;      // latitude (51.9)
      lo: number;      // longitude (4.48)
      d: number | null;  // channel_depth_max_m (34.7)
      t: number;       // LOD tier: 1 (Large/Major) to 4 (Very Small)
      u: string | null;  // UN/LOCODE, e.g. "NLRTM" (null when not recorded)
      s: string | null;  // port_size, e.g. "Large" (null when unclassified)
      v: string | null;  // max_vessel_size, e.g. "medium vessels"
      dm: number | null; // channel_depth_min_m (d is the max; min === max in portsv2)
      m: number | null;  // mean_tidal_range_m
      r: number;       // entrance-restriction bitmask: 1 tide, 2 swell, 4 ice, 8 other
    }
    ```
  - Total payload drops from the full dataset (**~13.4 MB portsv2 / 3.3 MB legacy**) to **~150 KB** (~45 KB gzipped).
  - Client map dynamically mounts dot tiers based on current zoom scale $k$:
    - $k \ge 1$: Tier 1 (Large / Major ports)
    - $k \ge 2$: + Tier 2 (Small ports)
    - $k \ge 4$: + Tier 3 (Medium / Minor ports)
    - $k \ge 8$: + Tier 4 (Very Small & anchorages — every served port)
    (the per-tier counts measured on the legacy 2019 file were ~160 / ~1,137 / ~1,499 / 5,410; the portsv2 distribution differs — the mechanics are unchanged)
  - Viewport culling strips dots outside the visible map bounding box on every pan/zoom frame.

### 2.4 Self-Contained Vector Cartography (Zero Mapbox / Leaflet Tiles)
- **Decision**: Render coastlines via static SVG path strings in `public/land.json` derived from Natural Earth 1:110m admin-0 vectors.
- **Rationale**:
  - No third-party map tile subscriptions, API keys, or rate limits.
  - Fast offline loading (120 KB JSON).
  - Perfect color control for light and dark themes using SVG fill and stroke tokens.

### 2.5 Proxied Astronomy Data (SunriseSunset.io, 12 h Cache)
- **Decision**: Port detail sheets show per-port sun/moon transit data (Merpas, nautical twilight, moon phase). Rather than calling the free SunriseSunset.io API from the browser, `buildApiApp()` (mounted by `server.ts` / `api/index.ts`) exposes `GET /api/astronomy?lat=&lng=`, which proxies `src/lib/astronomy.ts`.
- **Rationale**:
  - The upstream API is key-free but rate-limited like any public service — the proxy adds a 12-hour in-memory cache keyed on 2-decimal coordinates (~1 km cells, sufficient for transit times), so one upstream call per cell per half-day serves all visitors.
  - The route sets `Cache-Control: public, max-age=300, s-maxage=43200`, letting the CDN (Vercel) extend the same 12 h window at the edge.
  - Fail-closed contract: invalid coordinates → 400, upstream failure → 502, and **failed responses are never cached**, so a transient upstream error never blocks a port for 12 hours.
  - Client uses TanStack Query (`staleTime` 30 min, 1 retry) with a skeleton fallback — no layout shift.

### 2.6 Key-Free Weather, Sea State & Tide Proxies (Open-Meteo)
- **Decision**: Port detail sheets show live conditions — current weather plus a 7-day outlook (wind in knots), sea state (wave/swell height, direction, period) and an hourly tide curve. All calls go through the server proxies (`/api/weather`, `/api/marine`, `/api/tide`) to key-free Open-Meteo endpoints, with `Cache-Control: public, max-age=300, s-maxage=1800` so the CDN absorbs the traffic.
- **Fail-soft contract**: Outside model coverage (normal for inland ports) the proxies return 502 with an "unavailable for this location" message and the client hides the section. Failures are never cached.
- **Time zone & DST calendar** (`GET /api/timezone`, detail sheet): TimeZoneDB is the primary upstream (keyed via `TIMEZONEDB_API_KEY`, free tier 1 req/s; a missing key logs and falls back) with the keyless Hourora API as fallback — 12 h in-memory cache, failures never cached. The map popup's local time (§2.8) bypasses all of this via the bundled tz dataset.

### 2.7 Shared API App, Two Entry Points
- **Decision**: Every route lives in `src/lib/apiApp.ts` (`buildApiApp()`), which builds an Express app with no listener and no static-file serving. `server.ts` mounts it locally (plus Vite middleware in dev or `dist` in production); `api/index.ts` exports it as the Vercel serverless function, with `vercel.json` rewriting `/api/*` and bundling the dataset into the function. One route table, zero drift between local and deployed.

### 2.8 Zero-API Single-Glance Map Popup (GL renderer)

- **Decision**: Clicking a port pin — or its invisible 16 px hit target / name label — opens a popup that renders fully populated in one frame, with no placeholders and no extra network calls.
- **How**: everything comes from the compact `format=points` payload (name, country, UN/LOCODE or WPI number, size / vessel / restriction pills, channel-depth + tide summary) plus the local-time label computed from the bundled `@photostructure/tz-lookup` IANA dataset (`src/map/localTime.ts`) — even the clock needs no API call. The *More details* button opens the existing `PortDetailSheet` for the proxied deep data.
- **Robustness**: MapLibre can hand event-feature properties back stringified (maplibre-gl-js#1325), so they are coerced once before use; clicks bind to the visible dots, the hit layer and the labels; and if popup construction ever throws, the click falls back to opening the detail sheet — a click can never silently do nothing.

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
[buildApiApp()] queries in-memory getPorts() -> filters array -> sorts -> slices pagination
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

### Map View Flow (MapLibre GL — default renderer)

```
User selects "Map" tab
           |
           v
[TanStack Query] fetches /api/ports?format=countries (staleTime: Infinity)
           |
           v
[PortsMap] renders one compact dot + "Country (count)" label per country
           |   user clicks a country -> URL becomes ?country=<ISO2|name>
           v
fitBounds(country bounds) + fetch /api/ports?format=points&country=…
           |
           v
Individual tier-coloured pins + decluttered name labels render
           |   user clicks a pin / 16 px hit target / label
           v
Zero-API popup (points payload + bundled tz lookup) -> "More details" -> PortDetailSheet
```

### Map View Flow (legacy SVG renderer)
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

**portsv2 single soundings.** The Updated Pub 150 export records one depth per facility (`min === max`), and a source value of `0` means *no data* (stored as `null`). `formatRange()` in `src/components/ports/types.ts` collapses `min === max` to a single value so a sounding never renders as a "12.5–12.5 m" range; the legacy file keeps its true min–max ranges.

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

The legacy `data/ports.json` contains a small number of rows whose `wpi_port_id` is `0` or non-numeric - real places (e.g. Aalborg, DK and Jebel Ali, AE) that are missing both the port name and the WPI number in the source. (The Updated Pub 150 export does not carry these rows; the guard applies to whichever file `resolveDataFile()` loads and `ports.test.ts` asserts the exclusion either way.) They are not identifiable: they all alias on `GET /api/ports/0`, cannot be deep-linked, and carry no soundings. `getPorts()` therefore serves only records with a positive integer `wpi_port_id`, and `meta.record_count` (via `/api/stats`) reflects the served count rather than the raw file row count. When the source file is regenerated without these rows, the guard becomes a no-op; `src/lib/ports.test.ts` asserts the exclusion either way.

### Sounding units (feet-quantized)

In the legacy 2019 file the NGA World Port Index records depths in whole feet; the `_m` fields are those values converted to metres and rounded to 0.1 m (e.g. 114 ft = 34.7 m). The Updated Pub 150 export already carries the `_m` soundings in metres at native 0.1 m resolution (single sounding per facility). Two consequences (legacy file):

- Metre display carries false precision (the source resolution is 1 ft / 0.3 m); a feet display renders the source values exactly. Keep this in mind for any unit toggle.
- `src/lib/ports.test.ts` asserts a quantization invariant for every served sounding: `v * 10` must be an integer (0.1 m resolution, both files). For the legacy file this is equivalent to the feet check (`v / 0.3048` within 0.35 ft of an integer); a violation means the conversion pipeline changed and must be reviewed before shipping.

### UN/LOCODE

The Updated Pub 150 export carries `un_locode` natively (raw spaced form, e.g. `"AU CCU"`); `normalizePort()` normalizes it into the compact `unlocode` contract (`^[A-Z]{2}[A-Z0-9]{3}# Architecture & System Design — Helm.Ports

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
       | data/portsv2-117 field |
       |   .json (Updated Pub   |
       | 150 — 3,814 records;   |
       | legacy ports.json =    |
       | automatic fallback)   |
       +-------------------------+
```

---

## 2. Key Architectural Decisions

### 2.1 Single-Port Full-Stack Hosting (Express + Vite Middlewares)
- **Decision**: Rather than running separate backend and frontend dev servers (e.g. backend on 3001, Vite on 5173), `server.ts` bootstraps Express and mounts `vite.middlewares` directly on port 3000.
- **Rationale**: Eliminates Cross-Origin Resource Sharing (CORS) friction, simplifies deployment, preserves proxy-free client calls (`fetch('/api/ports')`), and runs natively within containerized preview environments.

### 2.2 In-Memory Data Engine vs. Relational/Document Database
- **Decision**: Avoid an external database daemon (PostgreSQL, SQLite, MongoDB). The port records are read from the primary dataset file at process start and cached in V8 memory. Since the Updated Pub 150 adoption this is `data/portsv2-117 field.json` (3,814 records, 117 fields, ~13.4 MB); `resolveDataFile()` in `src/lib/ports.ts` prefers `portsv2.json`, then the pushed `portsv2-117 field.json`, then the legacy `data/ports.json` (5,410 records, ~3.3 MB) as an automatic fallback, so the site keeps working on any branch state.
- **Rationale**:
  - The dataset is parsed once into the V8 heap — no database daemon, migrations, or connection pool maintenance.
  - In-memory array filtering and multi-column sorting run in the low single-digit milliseconds (1.2–3.5 ms measured on the legacy 5,410-record file; portsv2 serves fewer records), faster than typical database network round-trips.
  - Zero external database setup, migrations, or connection pool maintenance.

### 2.3 Dual Map Renderers: MapLibre GL (default) + Legacy SVG
- **Problem**: A tiled GL map depends on external tile services, while a self-contained SVG map offers no basemap context. Different deployments want both.
- **Decision**: Ship two renderers behind the `VITE_USE_MAPLIBRE` switch in `App.tsx` (default: GL):
  - **MapLibre GL** (`src/map/`): raster OpenStreetMap base tiles (env-swappable via `VITE_OSM_TILE_URL` for production metering), an optional OpenSeaMap seamarks overlay from zoom 6, and a country-first world view backed by the compact `GET /api/ports?format=countries` index — one compact uniform dot with a "Country (count)" label per port-having country. Selecting a country reveals all of its ports as individual tier-coloured pins (the moss size ramp, matching the table badges) with small name labels decluttered by symbol collision detection. Clustering was removed in favour of this country-first model; every pin carries an invisible 16 px hit target so clicks and taps never miss, and the selected country is URL-addressable (`?country=<ISO2 or name>`, restored on load; back/Escape return to the world view).
  - **Legacy equirectangular SVG** (`PortMap.tsx`): Natural Earth coastlines from `public/land.json` — zero tile services, no API keys, fully offline-capable.
- **LOD & compact payload (SVG renderer)**:
  - The server exposes `/api/ports?format=points`, returning an array of compact tuples:
    ```ts
    interface MapPoint {
      i: number;       // wpi_port_id (e.g. 31140)
      n: string;       // wpi_port_name (e.g. "ROTTERDAM")
      c: string;       // country (e.g. "Netherlands")
      la: number;      // latitude (51.9)
      lo: number;      // longitude (4.48)
      d: number | null;  // channel_depth_max_m (34.7)
      t: number;       // LOD tier: 1 (Large/Major) to 4 (Very Small)
      u: string | null;  // UN/LOCODE, e.g. "NLRTM" (null when not recorded)
      s: string | null;  // port_size, e.g. "Large" (null when unclassified)
      v: string | null;  // max_vessel_size, e.g. "medium vessels"
      dm: number | null; // channel_depth_min_m (d is the max; min === max in portsv2)
      m: number | null;  // mean_tidal_range_m
      r: number;       // entrance-restriction bitmask: 1 tide, 2 swell, 4 ice, 8 other
    }
    ```
  - Total payload drops from the full dataset (**~13.4 MB portsv2 / 3.3 MB legacy**) to **~150 KB** (~45 KB gzipped).
  - Client map dynamically mounts dot tiers based on current zoom scale $k$:
    - $k \ge 1$: Tier 1 (Large / Major ports)
    - $k \ge 2$: + Tier 2 (Small ports)
    - $k \ge 4$: + Tier 3 (Medium / Minor ports)
    - $k \ge 8$: + Tier 4 (Very Small & anchorages — every served port)
    (the per-tier counts measured on the legacy 2019 file were ~160 / ~1,137 / ~1,499 / 5,410; the portsv2 distribution differs — the mechanics are unchanged)
  - Viewport culling strips dots outside the visible map bounding box on every pan/zoom frame.

### 2.4 Self-Contained Vector Cartography (Zero Mapbox / Leaflet Tiles)
- **Decision**: Render coastlines via static SVG path strings in `public/land.json` derived from Natural Earth 1:110m admin-0 vectors.
- **Rationale**:
  - No third-party map tile subscriptions, API keys, or rate limits.
  - Fast offline loading (120 KB JSON).
  - Perfect color control for light and dark themes using SVG fill and stroke tokens.

### 2.5 Proxied Astronomy Data (SunriseSunset.io, 12 h Cache)
- **Decision**: Port detail sheets show per-port sun/moon transit data (Merpas, nautical twilight, moon phase). Rather than calling the free SunriseSunset.io API from the browser, `buildApiApp()` (mounted by `server.ts` / `api/index.ts`) exposes `GET /api/astronomy?lat=&lng=`, which proxies `src/lib/astronomy.ts`.
- **Rationale**:
  - The upstream API is key-free but rate-limited like any public service — the proxy adds a 12-hour in-memory cache keyed on 2-decimal coordinates (~1 km cells, sufficient for transit times), so one upstream call per cell per half-day serves all visitors.
  - The route sets `Cache-Control: public, max-age=300, s-maxage=43200`, letting the CDN (Vercel) extend the same 12 h window at the edge.
  - Fail-closed contract: invalid coordinates → 400, upstream failure → 502, and **failed responses are never cached**, so a transient upstream error never blocks a port for 12 hours.
  - Client uses TanStack Query (`staleTime` 30 min, 1 retry) with a skeleton fallback — no layout shift.

### 2.6 Key-Free Weather, Sea State & Tide Proxies (Open-Meteo)
- **Decision**: Port detail sheets show live conditions — current weather plus a 7-day outlook (wind in knots), sea state (wave/swell height, direction, period) and an hourly tide curve. All calls go through the server proxies (`/api/weather`, `/api/marine`, `/api/tide`) to key-free Open-Meteo endpoints, with `Cache-Control: public, max-age=300, s-maxage=1800` so the CDN absorbs the traffic.
- **Fail-soft contract**: Outside model coverage (normal for inland ports) the proxies return 502 with an "unavailable for this location" message and the client hides the section. Failures are never cached.
- **Time zone & DST calendar** (`GET /api/timezone`, detail sheet): TimeZoneDB is the primary upstream (keyed via `TIMEZONEDB_API_KEY`, free tier 1 req/s; a missing key logs and falls back) with the keyless Hourora API as fallback — 12 h in-memory cache, failures never cached. The map popup's local time (§2.8) bypasses all of this via the bundled tz dataset.

### 2.7 Shared API App, Two Entry Points
- **Decision**: Every route lives in `src/lib/apiApp.ts` (`buildApiApp()`), which builds an Express app with no listener and no static-file serving. `server.ts` mounts it locally (plus Vite middleware in dev or `dist` in production); `api/index.ts` exports it as the Vercel serverless function, with `vercel.json` rewriting `/api/*` and bundling the dataset into the function. One route table, zero drift between local and deployed.

### 2.8 Zero-API Single-Glance Map Popup (GL renderer)

- **Decision**: Clicking a port pin — or its invisible 16 px hit target / name label — opens a popup that renders fully populated in one frame, with no placeholders and no extra network calls.
- **How**: everything comes from the compact `format=points` payload (name, country, UN/LOCODE or WPI number, size / vessel / restriction pills, channel-depth + tide summary) plus the local-time label computed from the bundled `@photostructure/tz-lookup` IANA dataset (`src/map/localTime.ts`) — even the clock needs no API call. The *More details* button opens the existing `PortDetailSheet` for the proxied deep data.
- **Robustness**: MapLibre can hand event-feature properties back stringified (maplibre-gl-js#1325), so they are coerced once before use; clicks bind to the visible dots, the hit layer and the labels; and if popup construction ever throws, the click falls back to opening the detail sheet — a click can never silently do nothing.

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
[buildApiApp()] queries in-memory getPorts() -> filters array -> sorts -> slices pagination
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

### Map View Flow (MapLibre GL — default renderer)

```
User selects "Map" tab
           |
           v
[TanStack Query] fetches /api/ports?format=countries (staleTime: Infinity)
           |
           v
[PortsMap] renders one compact dot + "Country (count)" label per country
           |   user clicks a country -> URL becomes ?country=<ISO2|name>
           v
fitBounds(country bounds) + fetch /api/ports?format=points&country=…
           |
           v
Individual tier-coloured pins + decluttered name labels render
           |   user clicks a pin / 16 px hit target / label
           v
Zero-API popup (points payload + bundled tz lookup) -> "More details" -> PortDetailSheet
```

### Map View Flow (legacy SVG renderer)
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

**portsv2 single soundings.** The Updated Pub 150 export records one depth per facility (`min === max`), and a source value of `0` means *no data* (stored as `null`). `formatRange()` in `src/components/ports/types.ts` collapses `min === max` to a single value so a sounding never renders as a "12.5–12.5 m" range; the legacy file keeps its true min–max ranges.

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

The legacy `data/ports.json` contains a small number of rows whose `wpi_port_id` is `0` or non-numeric - real places (e.g. Aalborg, DK and Jebel Ali, AE) that are missing both the port name and the WPI number in the source. (The Updated Pub 150 export does not carry these rows; the guard applies to whichever file `resolveDataFile()` loads and `ports.test.ts` asserts the exclusion either way.) They are not identifiable: they all alias on `GET /api/ports/0`, cannot be deep-linked, and carry no soundings. `getPorts()` therefore serves only records with a positive integer `wpi_port_id`, and `meta.record_count` (via `/api/stats`) reflects the served count rather than the raw file row count. When the source file is regenerated without these rows, the guard becomes a no-op; `src/lib/ports.test.ts` asserts the exclusion either way.

### Sounding units (feet-quantized)

In the legacy 2019 file the NGA World Port Index records depths in whole feet; the `_m` fields are those values converted to metres and rounded to 0.1 m (e.g. 114 ft = 34.7 m). The Updated Pub 150 export already carries the `_m` soundings in metres at native 0.1 m resolution (single sounding per facility). Two consequences (legacy file):

- Metre display carries false precision (the source resolution is 1 ft / 0.3 m); a feet display renders the source values exactly. Keep this in mind for any unit toggle.
- `src/lib/ports.test.ts` asserts a quantization invariant for every served sounding: `v * 10` must be an integer (0.1 m resolution, both files). For the legacy file this is equivalent to the feet check (`v / 0.3048` within 0.35 ft of an integer); a violation means the conversion pipeline changed and must be reviewed before shipping.

### UN/LOCODE

, asserted by `src/lib/ports.test.ts`) and passes the raw value through as `un_locode`. `scripts/join-unlocode.ts` (`npm run data:unlocode`) — the name-matching join onto the legacy `data/ports.json`, with manual fixes in `data/unlocode-overrides.json` — now only matters for the 2019 fallback file; the API and UI treat null as "not recorded" either way.

### Provenance

`GET /api/stats` returns `meta` from the data file (`schema_version`, `record_count`, `last_updated`, `source`). `record_count` is always derived from the served records (`getPorts().length`), never the raw file row count; on the portsv2 file the metadata block centers on its data dictionary, so `last_updated`/`source` may be empty (the legacy file names the edition, e.g. "NGA Publication 150 - World Port Index, 2019 edition"). UI surfaces should print these verbatim from the API rather than hardcoding counts — the numeric copy in the hero / `index.html` is a pre-API loading fallback only.
