# ⚓ Helm.Ports — World Maritime Ports Explorer

<p align="center">
  <img src="public/logo.svg" alt="Helm.Ports logo" width="96" height="96">
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
| **LOD world map** | Custom SVG map, ~150 KB points payload (~45 KB gzipped), zero tile services or API keys |
| **Navigational screening** | Channel depth, tidal range, vessel size & entrance restrictions at a glance |
| **Self-contained cartography** | Natural Earth coastlines served locally — fully offline-capable |
| **Modern UX** | Dark/light/system themes, mobile drawer, instant detail sheets, null-safe sorting |

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
<summary>🗺️ Interactive SVG Map with Level-of-Detail</summary>

| Zoom | Visible ports |
|------|---------------|
| 1×   | Tier 1 — major international hubs (~160) |
| 2×+  | + Tier 2 — small / regional ports (~1,137) |
| 4×+  | + Tier 3 — minor ports (~1,499) |
| 8×+  | + Tier 4 — very small ports & anchorages (all 5,410) |

Dots are colored by maximum channel depth:

`<5 m` · `5–10 m` · `10–15 m` · `15–20 m` · `20 m+` · `no data` (gray)

Viewport culling and selected-port highlighting run on every pan/zoom frame.

</details>

<details>
<summary>📋 Table & Detail Views</summary>

- Sortable, paginated table (10–100 rows per page) with **null-safe ordering** — missing soundings always sort last
- Slide-over detail sheet with all soundings: channel, anchorage, cargo pier, oil terminal
- Restriction badges and tidal-range display

</details>

<details>
<summary>🎨 Modern Design System</summary>

- Light / dark / system theme with persistent storage
- Responsive layout: sticky sidebar ≥ 1024 px, collapsible filter drawer with active-filter badge below
- Radix UI primitives + Tailwind CSS v4 OKLCH design tokens
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
- **Static Natural Earth SVG paths** → no Mapbox/Leaflet tile services, no API keys, offline-friendly

See [docs/architecture.md](docs/architecture.md) for the full deep-dive.

---

## 📡 API Overview

| Endpoint | Description |
|----------|-------------|
| `GET /api/ports` | Filtered, sorted, paginated list — or `?format=points` for the compact map payload |
| `GET /api/ports/:id` | Single port by WPI ID |
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
├── data/ports.json               # NGA World Port Index (5,410 records)
├── docs/architecture.md          # Full system design deep-dive
├── public/
│   ├── land.json                 # Natural Earth coastline vectors
│   └── logo.svg                  # Nautical branding
├── src/
│   ├── components/ports/         # PortMap, PortsTable, FilterSidebar, PortDetailSheet
│   ├── components/ui/             # Accessible UI primitives
│   ├── lib/ports.ts              # Data layer + ranking helpers
│   └── App.tsx
├── server.ts                     # Express API + Vite middleware
└── package.json
```

</details>

---

## 📊 Data Source & Disclaimer

- **Dataset:** NGA Publication 150 *World Port Index* (2019 edition), via [tayljordan/ports](https://github.com/tayljordan/ports)
- **Cartography:** Natural Earth admin-0 vectors (public domain)

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

---

## 🤝 Contributing

We welcome improvements! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Branch & Conventional Commit conventions
- PR checklist (`npm run lint` + `npm run build` must pass)
- Performance & accessibility expectations

---

<sub>Built for maritime curiosity • Powered by React 19 + Vite + Express</sub>
