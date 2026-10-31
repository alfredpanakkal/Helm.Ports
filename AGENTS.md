# AGENTS.md — AI Coding Agent Constitution & Playbook

Welcome, AI Agent. This document defines the engineering standards, architecture, hard constraints, and operational rules for working on **Helm.Ports** (formerly Ports Explorer). Read this before modifying or creating any code.

---

## 1. Project Purpose & Remake Goals

Helm.Ports is a specialized maritime data explorer that visualizes and queries **5,410 worldwide maritime ports** from the NGA World Port Index.

### Primary Goals:
- **Zero-lag queries**: All searching, filtering, and sorting across 5,410 records must stay sub-5ms in-memory on the backend.
- **Lightweight map payloads**: The SVG map must never receive the full 3.3 MB dataset. It must consume the compact `/api/ports?format=points` payload (~150 KB).
- **Single-port full-stack execution**: Dev server and API run together on port 3000 via `server.ts` mounting `vite.middlewares`.
- **Absolute stability**: Type-safe code (`tsc --noEmit`), resilient null handling for missing hydrographic soundings, and smooth UI performance without layout shifts.

---

## 2. Tech Stack & Key Libraries

| Layer | Technology | Key Libraries |
|---|---|---|
| **Runtime** | Node.js (v20+) | `tsx`, `express` |
| **Build & Bundler** | Vite 8 + `@vitejs/plugin-react` | `@tailwindcss/vite` 4 |
| **Frontend UI** | React 19 (Functional / Hooks) | `@tanstack/react-query` v5, `lucide-react` |
| **Primitives** | Radix UI | `@radix-ui/react-dialog`, `@radix-ui/react-select`, `@radix-ui/react-slider`, `@radix-ui/react-checkbox`, `@radix-ui/react-tabs`, `@radix-ui/react-scroll-area`, `@radix-ui/react-separator`, `@radix-ui/react-slot`, `@radix-ui/react-label` |
| **CSS Utilities** | Tailwind CSS v4 + OKLCH colors | `clsx`, `tailwind-merge`, `class-variance-authority`, `tw-animate-css` |
| **Data Storage** | Static JSON | `data/ports.json` (3.27 MB, 5,410 records) |
| **Cartography** | Equirectangular SVG | `public/land.json` (Natural Earth coastlines) |

---

## 3. Directory Structure

```
├── data/
│   └── ports.json                 # Primary database: loaded ONCE at module scope in server/lib
├── docs/
│   └── architecture.md            # Detailed system design & data flow documentation
├── public/
│   ├── land.json                  # World coastline SVG paths (1000x500 viewBox)
│   └── logo.svg                   # Nautical brand logo
├── src/
│   ├── components/
│   │   ├── ports/
│   │   │   ├── FilterSidebar.tsx  # Search/filter controls (country, depths, tides, restrictions)
│   │   │   ├── PortDetailSheet.tsx# Detailed slide-over view for individual port
│   │   │   ├── PortMap.tsx        # Interactive SVG map, LOD rendering, projection
│   │   │   ├── PortsTable.tsx     # Paginated and sortable table
│   │   │   └── types.ts           # Shared interfaces (Port, Filters, MapPoint, Stats)
│   │   ├── theme-provider.tsx     # React ThemeContext (light/dark/system)
│   │   └── ui/                    # Curated UI primitives (button, sheet, table, etc.)
│   ├── lib/
│   │   ├── ports.ts               # Core data layer: getPorts(), getMetadata(), country mapping
│   │   └── utils.ts               # cn() class merging utility
│   ├── App.tsx                    # Main orchestrator component
│   ├── index.css                  # Tailwind v4 import + @theme tokens
│   └── main.tsx                   # React DOM root mounting
├── index.html                     # HTML root template with synced SEO meta tags
├── package.json                   # Project scripts and dependencies
├── server.ts                      # Express API routes + Vite dev middleware
├── tsconfig.json                  # Strict TypeScript configuration
└── vite.config.ts                 # Vite config with alias '@' -> './src'
```

---

## 4. Coding Conventions & Style Rules

1. **Path Aliasing**:
   - Always import application source files using the `@/` prefix (e.g. `import { Button } from "@/components/ui/button"`).
   - In `vite.config.ts` and `tsconfig.json`, `@` maps strictly to `./src`. Never alter this to root `.`.
2. **TypeScript Strictness**:
   - No `any` types unless interfacing with raw JSON in normalization helpers.
   - All hydrographic soundings (`channel_depth_*`, `anchorage_depth_*`, `cargo_pier_depth_*`, `oil_terminal_depth_*`, `mean_tidal_range_m`) are nullable (`number | null`). Always use null-safe checks.
3. **Styling & CSS**:
   - Use Tailwind CSS v4 utility classes.
   - Do NOT create separate `.css` files.
   - Do NOT write inline `style={{ ... }}` except for dynamic geometric coordinates in SVG projection (e.g. tooltip placement, dot radius calculations).
   - Use standard design tokens defined in `src/index.css` (`bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-card`).
4. **React Components**:
   - Pure functional components with hooks.
   - Debounce search input (default: 300 ms) to avoid thrashing filter queries while typing.
   - Keep page reset (`setPage(1)`) triggered whenever filter criteria change.

---

## 5. Verification Commands

Before concluding any code change sequence, you **must run both compilation and lint checks**:

```bash
# 1. Type check
npm run lint         # Runs 'tsc --noEmit'

# 2. Production build check
npm run build        # Runs 'vite build'
```

If dev server state needs refreshing after server or dependency changes:
```bash
# Restart server via the environment dev server tool
```

---

## 6. Things Agents MUST ALWAYS DO

- **Always maintain the single-server model**: All backend logic must remain in `server.ts` or imported helper modules in `src/lib/`. Express handles `/api/*` first, then hands off remaining routes to Vite.
- **Always preserve in-memory caching**: When querying `data/ports.json`, call `getPorts()` in `src/lib/ports.ts`. It loads and parses the file once into memory and returns the cached array. Never parse `ports.json` on every HTTP request.
- **Always keep the map payload compact**: When adding new fields to the map, keep them in `format=points` as single-letter or abbreviated keys (e.g., `i`, `n`, `c`, `la`, `lo`, `d`, `t`) to preserve the ~150 KB payload size.
- **Always keep nulls at the end when sorting**: When sorting ports by depth or tidal range, null values must sort to the end of the list in both ascending and descending directions.
- **Always support both Light and Dark themes**: Use Tailwind semantic classes so elements contrast properly in both themes. Map oceans, land masses, and borders have explicit light and dark variations.

---

## 7. Things Agents MUST NEVER DO

- **NEVER install Next.js packages**: This is a standalone React 19 + Vite app. Do not import `next/router`, `next/navigation`, `next/image`, `next/server`, or `next-themes`.
- **NEVER mount Express inside `vite.config.ts`**: Express is the outer wrapper in `server.ts`, which mounts `vite.middlewares`. Do not invert this relationship.
- **NEVER send `ports.json` directly to the client browser**: Loading 3.3 MB of raw JSON on client bootstrap causes network and memory bloat. Query via `/api/ports` and `/api/stats`.
- **NEVER use browser `window.alert()` or `window.confirm()`**: The app runs in an embedded iframe. Use Radix UI dialogs, sheets, or non-blocking feedback.
- **NEVER rename `metadata.json`**: The app name inside `metadata.json` was set on turn 1. Keep `metadata.json` intact.
- **NEVER import uninstalled Radix packages**: Before using a new UI component from shadcn, verify the underlying Radix package is installed in `package.json`.

---

## 8. Common Pitfalls & Edge Cases

| Pitfall | Root Cause | Solution |
|---|---|---|
| **Port ID Lookup in Detail Sheet** | `selected` can be either a full `Port` object (from table click) or a numeric `portId` (from map click). | In `PortDetailSheet.tsx`, extract `portId = typeof port === 'number' ? port : port?.wpi_port_id`, and enable query only when `portId != null`. |
| **Map Dots Overcrowding** | 5,410 dots at zoom 1x would create an unreadable blob. | The Level of Detail (LOD) filter displays Tier 1 (Major) at scale 1x, Tier 2 at 2x, Tier 3 at 4x, Tier 4 at 8x. Maintain this behavior. |
| **Equirectangular Projection Bounds** | Longitude ranges [-180, 180] and Latitude [-90, 90]. | `project(lon, lat)` maps to `x = ((lon + 180)/360) * 1000` and `y = ((90 - lat)/180) * 500`. Do not modify viewBox dimensions `1000 x 500` without updating `public/land.json`. |
| **Missing Channel Sounding Data** | ~2,278 ports do not record a channel depth. | Map dots without depth must use `--dot-none` (`#94a3b8` light, `#475569` dark). Never default missing depths to `0m`. |
| **Country Name Divergence** | WPI data has legacy abbreviations (e.g. `U.S.A.`, `Congo, D.R.`). | Use `COUNTRY_FIXES` in `src/lib/ports.ts` so filter dropdowns match normalized country names. |

---

## 9. Pointer to Other Documentation

- **Architecture Details**: See `docs/architecture.md` for sequence diagrams, caching strategy, and data models.
- **Contribution Workflow**: See `CONTRIBUTING.md` for PR flow, commit styling, and branch naming.
- **Feature Roadmap**: See `TODO.md` for planned capabilities and backlog items.
