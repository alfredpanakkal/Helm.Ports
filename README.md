# Helm.Ports — World Maritime Ports Explorer

A high-performance, interactive web visualization and querying system for **5,410 worldwide maritime ports and anchorages**, derived from the NGA Publication 150 *World Port Index* (2019 edition).

This project is a modern full-stack remake designed to run seamlessly as a lightweight, lightning-fast application powered by **React 19**, **Vite**, **Express**, and **Tailwind CSS v4**.

---

## What This Remake Achieves

1. **Standalone Full-Stack Architecture**: Replaces monolithic framework overhead with a nimble Node.js/Express backend (`server.ts`) and Vite client, hosting both API and frontend on port 3000.
2. **Sub-millisecond In-Memory Query Engine**: 5,410 port records (~3.3 MB JSON) are parsed once and held in module cache. Filter, search, and sort operations execute in 1–3 ms without database lockups.
3. **Compact Level-of-Detail (LOD) World Map**: Custom equirectangular SVG world map with 4-tier Level of Detail. Instead of streaming 3.3 MB to the client for maps, the backend provides an ultra-compact payload (`format=points`, ~150 KB) that renders instantly with zero external tile dependencies.
4. **Comprehensive Navigational Screening**: Instant filtering by country, port size, maximum vessel draft/size, channel depth sounding, mean tidal range window, and entrance restrictions (tide, swell, ice, other).
5. **Modern Design Constitution**: Accessible dark/light theming, responsive layout with mobile drawer filters, null-safe sorting, and instant port detail slide-overs.

---

## Tech Stack

- **Runtime & Language**: Node.js 20+ / TypeScript 5+ (ES2022, ESM)
- **Frontend**: React 19, `@tanstack/react-query` v5, Lucide React icons
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`), Radix UI primitives (`@radix-ui/react-*`), `clsx`, `tailwind-merge`
- **Backend & Middleware**: Express 4, Vite middleware mode (`vite.middlewares`), tsx execution
- **Map & Geography**: Equirectangular Natural Earth vector paths (`public/land.json`), SVG projection with viewport culling

---

## Quick Start

### 1. Prerequisites
- Node.js 20.x or higher
- npm 10.x or higher

### 2. Installation
```bash
npm install
```

### 3. Development
Start the unified full-stack server (runs Express API + Vite dev middleware on port 3000):
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Build & Production
```bash
# Build production client bundle
npm run build

# Start production server
npm start
```

### 5. Type Checking & Verification
```bash
# Verify TypeScript without emitting files
npm run lint

# Verify full compilation
npm run build
```

---

## Project Structure

```
├── data/
│   └── ports.json                 # NGA World Port Index (5,410 port records)
├── docs/
│   └── architecture.md            # In-depth architectural & design documentation
├── public/
│   ├── land.json                  # Natural Earth coastline vectors (1000x500 viewBox)
│   ├── logo.svg                   # Nautical compass / anchor branding
│   └── robots.txt
├── src/
│   ├── components/
│   │   ├── ports/
│   │   │   ├── FilterSidebar.tsx  # Multi-faceted filter panel with sliders & badges
│   │   │   ├── PortDetailSheet.tsx# Slide-over sheet displaying all sounding depths & metadata
│   │   │   ├── PortMap.tsx        # Interactive SVG map with zoom, drag, LOD, tooltips
│   │   │   ├── PortsTable.tsx     # Paginated, sortable data table with restriction badges
│   │   │   └── types.ts           # Shared TypeScript interfaces & helper functions
│   │   ├── theme-provider.tsx     # Client-side dark/light theme provider & hook
│   │   └── ui/                    # Accessible UI primitives (button, sheet, table, etc.)
│   ├── lib/
│   │   ├── ports.ts               # Core data layer: parsing, country normalization, ranks
│   │   └── utils.ts               # Tailwind cn helper utility
│   ├── App.tsx                    # Top-level application component
│   ├── index.css                  # Global Tailwind v4 styles and theme tokens
│   └── main.tsx                   # React root entry point
├── AGENTS.md                      # AI coding agent rules, conventions, and guidelines
├── CONTRIBUTING.md                # Contribution workflow & guidelines
├── index.html                     # HTML shell and metadata
├── package.json                   # Dependencies and scripts
├── server.ts                      # Express API server + Vite middleware
├── tsconfig.json                  # TypeScript compiler settings
└── vite.config.ts                 # Vite bundler configuration
```

---

## Core Features & Capabilities

- **Omni-Search**: Search across port name, country, state/province, point of interest, and numeric WPI ID.
- **Vessel Draft Screening**: Filter ports by minimum recorded channel sounding depth.
- **Tidal Range Window**: Dual-handle slider to filter by mean tidal amplitude (meters).
- **Entrance Restrictions**: Instant toggle for tidal, heavy swell, ice, and navigational restrictions.
- **Level of Detail (LOD) Engine**:
  - Zoom 1x: Major international shipping hubs only.
  - Zoom 2x+: Secondary and regional ports.
  - Zoom 4x+: Minor ports and coastal stations.
  - Zoom 8x+: Very small ports and classified anchorages.
- **Sounding Color Scale**: Visual depth classification across `<5m`, `5–10m`, `10–15m`, `15–20m`, and `20m+`.

---

## Data Source & Disclaimer

- **Dataset**: Compiled from the National Geospatial-Intelligence Agency (NGA) Publication 150 *World Port Index* (2019 edition) via [tayljordan/ports](https://github.com/tayljordan/ports).
- **Cartography**: Natural Earth admin-0 vector data (public domain).
- **Disclaimer**: Sounding depths represent single recorded bathymetric observations and do not reflect real-time silting, dredging, or storm changes. **Never use for active maritime navigation.**
