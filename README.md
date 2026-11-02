# ⚓ Helm.Ports — World Maritime Ports Explorer

<p align="center">
  <img src="public/logo.svg" alt="Helm.Ports logo" width="420">
</p>

<p align="center">
  <strong>Interactive exploration of 5,410 worldwide maritime ports & anchorages</strong><br>
  Derived from the NGA Publication 150 <em>World Port Index</em> (2019 edition)
</p>

<p align="center">
  <img alt="React 19" src="https://img.shields.io/badge/React_19-Vite_8-61DAFB?style=flat-square&logo=react&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="Express" src="https://img.shields.io/badge/Express-4-000000?style=flat-square&logo=express&logoColor=white">
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-v4-0EA5E9?style=flat-square&logo=tailwindcss&logoColor=white">
  <img alt="Query performance" src="https://img.shields.io/badge/queries-1–3.5_ms_in--memory-0D9488?style=flat-square">
  <img alt="Dataset" src="https://img.shields.io/badge/data-NGA_WPI_2019-informational?style=flat-square">
</p>

---

## Why Helm.Ports?

Traditional port directories are static PDFs or heavy GIS tools. Helm.Ports is a lightweight full-stack explorer that delivers:

| Capability | Benefit |
|------------|---------|
| **In-memory query engine** | Filter, search & sort 5,410 records in 1–3.5 ms — no database |
| **Dual world map** | MapLibre GL on OpenStreetMap tiles by default; legacy self-contained SVG renderer with ~150 KB points payload — zero tile services, offline-capable |
| **Navigational screening** | Channel depth, tidal range, vessel size & entrance restrictions at a glance |
| **Live conditions per port** | Weather, sea state, tides and local time via key-free Open-Meteo proxies |
| **Modern UX** | Dark/light/system themes, mobile drawer, instant detail sheets, null-safe sorting |
| **Solar & lunar transits** | Per-port Merpas, twilight and moon data, cached 12 h — no API keys |

---

## ✨ Features

<details>
<summary>🔍 Omni-Search & Filters</summary>

- Search across port name, country, state/province, point of interest, and WPI ID
- Multi-select facets: country • port size • max vessel size
- Minimum channel-depth sounding filter
- Dual-handle tidal-range window
- Entrance-restriction toggles: tide • heavy swell • ice • other

</details>

<details>
<summary>🗺️ Interactive World Map — MapLibre GL (default) + legacy SVG</summary>

**MapLibre GL** (`src/map/`) is the default renderer:

- Raster OpenStreetMap base tiles — env-swappable via `VITE_OSM_TILE_URL` so production can point at a metered provider
- Optional OpenSeaMap seamarks overlay, shown from zoom 6+
- Port markers with clustering at world zoom, plus a country-level world view backed by the compact `GET /api/ports?format=countries` index

**Legacy SVG fallback** (`VITE_USE_MAPLIBRE=false`): self-contained Natural Earth cartography with zoom-based level-of-detail — no tiles, no keys, fully offline-capable:

| Zoom | Visible ports |
|------|---------------|
| 1×   | Tier 1 — major international hubs (~160) |
| 2×+  | + Tier 2 — small / regional ports (~1,137) |
| 4×+  | + Tier 3 — minor ports (~1,499) |
| 8×+  | + Tier 4 — very small ports & anchorages (all 5,410) |

The SVG renderer colors dots by maximum channel depth:

`<5 m` · `5–10 m` · `10–15 m` · `15–20 m` · `20 m+` · `no data` (gray)

Viewport culling and selected-port highlighting run on every pan/zoom frame (SVG renderer).

</details>

<details>
<summary>📋 Table & Detail Views</summary>

- Sortable, paginated table (10–100 rows per page) with **null-safe ordering** — missing soundings always sort last
- Slide-over detail sheet with all soundings: channel, anchorage, cargo pier, oil terminal
- Country flag beside the country name in the detail sheet (key-free flagcdn.com images)
- Restriction badges and tidal-range display

</details>

<details>
<summary>🌞 Solar & Lunar Transits (per port)</summary>

Every port detail sheet shows today's astronomy data for the port's coordinates, in the port's local time zone:

- **Merpas (solar noon)** — local meridian transit, the daily sight-taking reference
- Sunrise / sunset and day length
- **Nautical twilight** window (dawn – dusk), the sight-reduction and star-observation period
- Moon phase with % illumination, plus moonrise / moonset

Served by `GET /api/astronomy`, which proxies the free [SunriseSunset.io](https://sunrisesunset.io) API (no key) and caches responses for 12 hours — one upstream call per coordinate cell per half-day, shared across all visitors.

</details>

<details>
<summary>🌬️ Weather, Sea State & Tides (per port)</summary>

The port detail sheet also shows live conditions for the port's coordinates — all proxied server-side (key-free) and CDN-cached:

- **Weather** — current conditions (temperature, wind in knots, pressure) plus a 7-day outlook, via `GET /api/weather` (Open-Meteo Forecast API)
- **Sea state** — wave height / direction / period, swell and wind waves, via `GET /api/marine` (Open-Meteo Marine API); hidden automatically for inland ports outside wave-model coverage
- **Tides** — hourly sea-level curve for the port, via `GET /api/tide` (Open-Meteo Marine API), rendered as an SVG chart
- **Local time** — IANA time zone, current local time and DST calendar, via `GET /api/timezone`

</details>
<details>
<summary>🎨 Modern Design System</summary>

- **Moss palette** — one hue throughout: warm off-white paper with a single mint accent (light), near-black with low-opacity mint (dark); every text pair is verified by `src/lib/contrast.test.ts` (WCAG AA in both themes)
- Light / dark / system theme with persistent storage, applied pre-paint by an inline script in `index.html` — no light-to-dark flash on load; `color-scheme` is declared so mobile browsers never apply their own forced-dark filter
- Port sizes use a single-hue four-step ramp (`PORT_SIZE_STYLES`) — colour never carries meaning without a text label
- Responsive layout: sticky sidebar ≥ 1024 px, collapsible filter drawer with active-filter badge below
- Radix UI primitives + Tailwind CSS v4 semantic design tokens
- Accessible: keyboard-navigable controls, aria labels, WCAG AA contrast in both themes

</details>

---

## 🚀 Quick Start

**Prerequisites:** Node.js 20+ and npm 10+

```bash
# 1. Install dependencies
npm install

# 2. Development — Express API + Vite HMR on a single port
npm run dev
# → http://localhost:3000

# 3. Production
npm run build
npm start

# 4. Type-check (tsc --noEmit)
npm run lint

# 5. Unit tests (filter/sorting invariants + map bounds)
npm test

# 6. Contrast tests (WCAG AA pairs for the moss palette)
node --import tsx --test src/lib/contrast.test.ts
```

---

## 🏗️ Architecture at a Glance

```text
                 ┌──────────────────────────┐
                 │       Web Browser        │
                 └────────────┬─────────────┘
                              │ HTTP :3000
                              ▼
                 ┌──────────────────────────┐
                 │   server.ts (Express)    │
                 └─────┬──────────────┬─────┘
                       │              │
               /api/* routes     Vite middleware
                       │              │
                       ▼              ▼
          ┌────────────────────┐  ┌─────────────────────────┐
          │  src/lib/ports.ts  │  │       React 19 SPA      │
          │  in-memory engine  │  │  • PortMap (SVG + LOD)  │
          └─────────┬──────────┘  │  • PortsTable           │
                    │             │  • FilterSidebar        │
                    ▼             │  • PortDetailSheet      │
          ┌────────────────────┐  └─────────────────────────┘
          │  data/ports.json   │
          │  (5,410 records)   │
          └────────────────────┘
```

**Key design decisions:**

- **Single process, single port** → no CORS friction, simple deployment
- **Full dataset cached in the V8 heap (~3.3 MB)** → sub-5 ms queries with zero database overhead
- **Compact `format=points` payload + viewport culling** → smooth map panning at any zoom
- **Dual map renderers** → MapLibre GL with OSM raster tiles by default (swap providers via `VITE_OSM_TILE_URL`), plus a self-contained Natural Earth SVG fallback (`VITE_USE_MAPLIBRE=false`) with zero tile services
- **One API app, two entry points** → `buildApiApp()` in `src/lib/apiApp.ts` is shared by `server.ts` (local/self-host) and `api/index.ts` (Vercel serverless), so routes never drift

See [docs/architecture.md](docs/architecture.md) for the full deep-dive.

---

## 📡 API Overview

| Endpoint | Description |
|----------|-------------|
| `GET /api/ports` | Filtered, sorted, paginated list — `?format=points` (compact map payload) or `?format=countries` (country index for the GL world view) |
| `GET /api/ports/:id` | Single port by WPI ID |
| `GET /api/astronomy` | Sun & moon transit times for `?lat=&lng=` (cached 12 h) |
| `GET /api/timezone` | Time zone, UTC offset & DST calendar for `?lat=&lng=` (cached 12 h) |
| `GET /api/tide` | Hourly sea level incl. tides for `?lat=&lng=` (Open-Meteo Marine proxy) |
| `GET /api/weather` | Current conditions + 7-day outlook for `?lat=&lng=` (Open-Meteo proxy, wind in knots) |
| `GET /api/marine` | Sea state: wave / swell height, direction & period (Open-Meteo Marine proxy) |
| `GET /api/stats` | Aggregates: country counts, port/vessel size distributions, depth bins |

Common query parameters:

| Parameter | Example | Notes |
|-----------|---------|-------|
| `q` | `rotterdam` | Omni-search (name, country, state, POI, WPI ID) |
| `country` | `Netherlands,Japan` | Comma-separated multi-select |
| `portSize` / `vesselSize` | `Large,Medium` | Multi-select facets |
| `minChannelDepth` | `10` | Minimum channel sounding (m) |
| `minTidalRange` / `maxTidalRange` | `0.5` / `3` | Tidal window (m) |
| `restriction` | `tide,ice` | `tide`, `swell`, `ice`, `other` |
| `sort` / `order` | `channel_depth_max_m` / `desc` | Nulls always sort last |
| `page` / `pageSize` | `1` / `25` | `pageSize` clamped to 10–100 |

---

## 📁 Project Structure

<details>
<summary>Expand directory layout</summary>

```text
├── api/index.ts                 # Vercel serverless entry (reuses buildApiApp)
├── data/ports.json               # NGA World Port Index (5,410 records)
├── docs/architecture.md          # Full system design deep-dive
├── public/
│   ├── land.json                 # Natural Earth coastline vectors (SVG map)
│   └── logo.svg                   # Nautical branding
├── scripts/                      # Data pipeline (UN/LOCODE join)
├── src/
│   ├── components/ports/         # PortsTable, FilterSidebar, PortDetailSheet,
│   │                              # PortMap (legacy SVG) + astronomy/weather/
│   │                              # tide/timezone cards + shared types
│   ├── components/ui/             # Accessible UI primitives
│   ├── map/                       # MapLibre GL renderer (PortsMap, CountryList, config)
│   ├── lib/                       # ports.ts data layer, apiApp.ts Express API,
│   │                              # astronomy/tides/weather/timezone proxies + tests
│   └── App.tsx
├── server.ts                     # Local/self-host: Express API + Vite middleware
├── vercel.json                   # Vercel rewrites + serverless function config
└── package.json
```

</details>

---

## 📊 Data Source & Disclaimer

- **Dataset:** NGA Publication 150 *World Port Index* (2019 edition), via [tayljordan/ports](https://github.com/tayljordan/ports)
- **Cartography:** Natural Earth admin-0 vectors (public domain)
- **Astronomy:** [SunriseSunset.io](https://sunrisesunset.io) — daily sun/moon transit times per port (free API, no key, cached 12 h server-side)
- **Weather, sea state & tides:** [Open-Meteo](https://open-meteo.com) Forecast + Marine APIs — key-free, proxied server-side with CDN caching
- **Base cartography:** © OpenStreetMap contributors (raster tiles) with an optional OpenSeaMap seamarks overlay; Natural Earth vectors power the offline SVG fallback
- **Country flags:** [flagcdn.com](https://flagcdn.com) — free CDN, no API key, addressed by the ISO 3166-1 alpha-2 codes already mapped in `src/lib/countryCodes.ts`

> [!WARNING]
> Soundings are single recorded observations. They do not reflect real-time silting, dredging, or weather.
> **Never use this application for active maritime navigation.**

---

## 🗺️ Roadmap

**Near-term (v1.1)**

- [ ] URL query-parameter sync (shareable filtered views)
- [ ] CSV / GeoJSON export of filtered results
- [ ] Great-circle distance calculator between two ports

**Mid-term (v1.2)**

- [ ] Vessel draught + UKC clearance screener
- [ ] Side-by-side port comparison
- [ ] PWA / offline support

See [TODO.md](TODO.md) for the full backlog.

## 👤 Author

**Alfred Jose** — developer & maintainer

Alfred is a Third Officer on ocean-going tankers and a full-stack developer. He builds software for real-world problems — at sea and beyond — including web apps for navigation, shipboard admin and everyday routines, designed to stay usable on the weak connections you often have at sea.

[![Portfolio](https://img.shields.io/badge/Portfolio-alfred--panakkal-2F6B4F?style=flat-square)](https://alfred-panakkal.vercel.app)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-in%2Falfredpanakkal-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/alfredpanakkal/)
[![GitHub](https://img.shields.io/badge/GitHub-@alfredpanakkal-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/alfredpanakkal)

---
## 🤝 Contributing

We welcome improvements! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Branch & Conventional Commit conventions
- PR checklist (`npm run lint` + `npm run build` + `npm test` must pass)
- Performance & accessibility expectations

---

<sub>Built for maritime curiosity by <a href="https://alfred-panakkal.vercel.app">Alfred Jose</a> • Powered by React 19 + Vite + Express</sub>
