# AGENTS.md — AI Coding Agent Constitution & Playbook

Welcome, AI Agent. This document defines the engineering standards, architecture, hard constraints, and operational rules for working on **Helm.Ports** (formerly Ports Explorer). Read this before modifying or creating any code.

---

## 1. Project Purpose & Remake Goals

Helm.Ports is a specialized maritime data explorer that visualizes and queries **3,814 worldwide maritime ports** from the NGA World Port Index (Updated Pub 150 export).

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
| **Data Storage** | Static JSON | `data/portsv2-117 field.json` (13.4 MB, 3,814 records, 117 fields); legacy `data/ports.json` kept as automatic fallback |
| **Map Rendering** | MapLibre GL (default) + equirectangular SVG fallback (`VITE_USE_MAPLIBRE`) | `maplibre-gl`, `src/map/config.ts`, `public/land.json` |

---

## 3. Directory Structure

```
├── api/
│   └── index.ts                  # Vercel serverless entry — reuses buildApiApp(), no listener
├── data/
│   ├── portsv2-117 field.json     # Primary database (Updated Pub 150, 117 fields): loaded ONCE at module scope
│   └── ports.json                 # Legacy 2019 backup; automatic fallback when portsv2 is absent
├── docs/
│   └── architecture.md            # Detailed system design & data flow documentation
├── public/
│   ├── land.json                  # World coastline SVG paths (1000x500 viewBox)
│   └── logo.svg                   # Nautical brand logo
├── scripts/
│   └── join-unlocode.ts           # Idempotent UN/LOCODE join onto ports.json
├── src/
│   ├── components/
│   │   ├── InfoSheet.tsx          # About / credits slide-over
│   │   ├── ports/
│   │   │   ├── FilterSidebar.tsx  # Search/filter controls (country, depths, tides, restrictions)
│   │   │   ├── AstronomyCard.tsx  # Sun/moon transit panel (Merpas, twilight, moon phase)
│   │   │   ├── PortDetailSheet.tsx# Detailed slide-over view for individual port
│   │   │   ├── PortMap.tsx        # LEGACY interactive SVG map (VITE_USE_MAPLIBRE=false)
│   │   │   ├── PortsTable.tsx     # Paginated and sortable table
│   │   │   ├── TideCard.tsx       # Hourly sea-level (tide) panel
│   │   │   ├── TideChart.tsx      # SVG tide curve
│   │   │   ├── TimezoneCard.tsx   # Local time / DST calendar panel
│   │   │   ├── WeatherCard.tsx    # Current conditions + 7-day outlook
│   │   │   └── types.ts           # Shared interfaces + PORT_SIZE_STYLES port-size ramp
│   │   ├── theme-provider.tsx     # React ThemeContext (light/dark/system)
│   │   └── ui/                    # Curated UI primitives (button, sheet, table, etc.)
│   ├── lib/
│   │   ├── apiApp.ts              # Shared Express API app (all /api/* routes)
│   │   ├── ports.ts               # Core data layer: getPorts(), getMetadata(), country mapping
│   │   ├── astronomy.ts           # Sun/moon transit fetcher: SunriseSunset.io proxy + 12 h cache
│   │   ├── timezone.ts            # Time zone / DST fetcher (proxied)
│   │   ├── tides.ts               # Tide helpers
│   │   ├── weather.ts             # Open-Meteo forecast helpers
│   │   ├── weatherCodes.ts        # WMO weather-code → label map
│   │   ├── bounds.ts              # Geographic bounds helpers
│   │   ├── countryCodes.ts        # ISO2 mapping for the GL map country view
│   │   ├── ports.test.ts          # node:test — filtering/sorting invariants
│   │   ├── bounds.test.ts         # node:test — bounds helpers
│   │   ├── contrast.test.ts       # node:test — WCAG AA pairs for the moss palette
│   │   └── utils.ts               # cn() class merging utility
│   ├── map/
│   │   ├── PortsMap.tsx           # MapLibre GL map (DEFAULT renderer)
│   │   ├── CountryList.tsx        # Country-level world view
│   │   ├── config.ts              # Map style, tile sources, glyphs, env switches
│   │   └── geo.ts                 # Geo helpers for the GL map
│   ├── App.tsx                    # Main orchestrator component
│   ├── index.css                  # Tailwind v4 import + @theme tokens (moss palette)
│   └── main.tsx                   # React DOM root mounting
├── index.html                     # HTML root: SEO meta + pre-paint theme script
├── package.json                   # Project scripts and dependencies
├── server.ts                      # Local/self-host: Express API + Vite dev middleware
├── tsconfig.json                  # Strict TypeScript configuration
├── vercel.json                    # Vercel rewrites + serverless function config
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
   - Use standard design tokens defined in `src/index.css` (`bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-card`). The palette is the **moss theme**: warm off-white + mint accent (light), near-black + mint (dark). Never hard-code Tailwind palette colours (`teal-*`, `blue-*`, `amber-*`, ...) in UI components — express every colour through a semantic token.
   - Interactive controls (checkbox, slider, selected chips/toggles) use the `sidebar-primary` token pair for their "on" state; links and icons use `accent-foreground`.
   - Port-size colours come ONLY from `PORT_SIZE_STYLES` in `src/components/ports/types.ts` (one hue at four strengths). Do not re-derive badge colours per component.
   - Any token change must keep `src/lib/contrast.test.ts` green: text pairs >= 4.5:1, control fills >= 3:1, in both themes.
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

# 3. Unit + invariant tests (ports filtering/sorting, map bounds)
npm test

# 4. Contrast tests (WCAG AA pairs for the moss palette)
node --import tsx --test src/lib/contrast.test.ts
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
- **Always route astronomy data through the server proxy**: Sun/moon transit data comes from `GET /api/astronomy` (backed by `src/lib/astronomy.ts`, which proxies SunriseSunset.io and caches success responses for 12 h, keyed on 2-decimal coordinates). Never call `api.sunrisesunset.io` from the browser; never cache failed responses (a transient upstream error must not block a port for 12 h).
- **Always support both Light and Dark themes**: Use Tailwind semantic classes so elements contrast properly in both themes. Map oceans, land masses, and borders have explicit light and dark variations.
- **Always keep the pre-paint theme script and `color-scheme` declaration**: The inline script in `index.html` applies the saved/system theme before first paint (no light-to-dark flash), and `color-scheme: light`/`dark` in `src/index.css` stops mobile browsers (Android auto-dark, Edge forced dark) from applying their own fading filter. Removing either re-introduces the faded-app bug on mobile.
- **Always keep decorative masks on their own layer**: `.hero-grid` (and any masked decoration) must sit on its own absolutely-positioned, `pointer-events-none` element behind the content — never on a content-bearing element. A CSS mask on a parent fades everything inside it.
- **Always keep the MapLibre GL map as the default renderer** and the legacy SVG map (`PortMap.tsx`) functional behind `VITE_USE_MAPLIBRE=false`. The switch lives in `App.tsx`; both consume the same `/api/ports` payloads.
- **Always route new endpoints through `buildApiApp()` in `src/lib/apiApp.ts`**: it is shared verbatim by `server.ts` (local/self-host) and `api/index.ts` (Vercel serverless). Never duplicate routes in an entry point.

---

## 7. Things Agents MUST NEVER DO

- **NEVER install Next.js packages**: This is a standalone React 19 + Vite app. Do not import `next/router`, `next/navigation`, `next/image`, `next/server`, or `next-themes`.
- **NEVER mount Express inside `vite.config.ts`**: Express is the outer wrapper in `server.ts`, which mounts `vite.middlewares`. Do not invert this relationship.
- **NEVER send `ports.json` directly to the client browser**: Loading 3.3 MB of raw JSON on client bootstrap causes network and memory bloat. Query via `/api/ports` and `/api/stats`.
- **NEVER use browser `window.alert()` or `window.confirm()`**: The app runs in an embedded iframe. Use Radix UI dialogs, sheets, or non-blocking feedback.
- **NEVER rename `metadata.json`**: The app name inside `metadata.json` was set on turn 1. Keep `metadata.json` intact.
- **NEVER import uninstalled Radix packages**: Before using a new UI component from shadcn, verify the underlying Radix package is installed in `package.json`.
- **NEVER hard-code palette colours in UI**: no `teal-*`, `blue-*`, `amber-*` etc. in component markup. Use the moss semantic tokens. (Exception: map layer paints in `src/map/config.ts`, tracked as a known debt item in `TODO.md`.)
- **NEVER remove or bypass `apiApp.ts`**: both entry points build from the same `buildApiApp()`. Duplicating routes in `server.ts` or `api/index.ts` will drift.

---

## 8. Common Pitfalls & Edge Cases

| Pitfall | Root Cause | Solution |
|---|---|---|
| **Port ID Lookup in Detail Sheet** | `selected` can be either a full `Port` object (from table click) or a numeric `portId` (from map click). | In `PortDetailSheet.tsx`, extract `portId = typeof port === 'number' ? port : port?.wpi_port_id`, and enable query only when `portId != null`. |
| **Map Dots Overcrowding** | 5,410 dots at zoom 1x would create an unreadable blob. | The Level of Detail (LOD) filter displays Tier 1 (Major) at scale 1x, Tier 2 at 2x, Tier 3 at 4x, Tier 4 at 8x. Maintain this behavior. |
| **Equirectangular Projection Bounds** | Longitude ranges [-180, 180] and Latitude [-90, 90]. | `project(lon, lat)` maps to `x = ((lon + 180)/360) * 1000` and `y = ((90 - lat)/180) * 500`. Do not modify viewBox dimensions `1000 x 500` without updating `public/land.json`. |
| **Missing Channel Sounding Data** | ~2,278 ports do not record a channel depth. | Map dots without depth must use `--dot-none` (`#94a3b8` light, `#475569` dark). Never default missing depths to `0m`. |
| **Country Name Divergence** | WPI data has legacy abbreviations (e.g. `U.S.A.`, `Congo, D.R.`). | Use `COUNTRY_FIXES` in `src/lib/ports.ts` so filter dropdowns match normalized country names. |
| **Nullable Moon Rise/Set** | SunriseSunset.io omits `moonrise`/`moonset` on days the moon stays up/down. | Type them `string \| null` (as in `src/lib/astronomy.ts`) and render `—` when null. Never treat missing as "12:00 AM". |
| **Faded hero on mobile** | The `.hero-grid` CSS mask was once applied to the whole hero `<section>`, fading the heading, search box and stat cards. | Keep the grid on its own masked, `pointer-events-none` layer (`<div className="hero-grid ..."/>`); the content wrapper sits above it with `relative`. |
| **Mobile browsers re-darken / fade the app** | Android Chrome auto-dark and Edge forced-dark apply their own filter to pages that do not declare dark-awareness. | `color-scheme` is declared per theme in `src/index.css` plus `<meta name="color-scheme">` in `index.html`. Do not remove them. |
| **Weather/marine 502 for inland ports** | Open-Meteo wave/sea models only cover the sea. | 502 with "unavailable for this location" is the designed response; clients hide the section. Do not convert it to 500 and do not cache failures. |
| **portsv2 single soundings** | The Updated Pub 150 export records one depth per facility (min === max); 0 in the source means "no data" (stored as null). | `formatRange` collapses min === max to a single value. Never default a missing depth to 0 m. |
| **port_size label sets differ per file** | portsv2 carries the raw Harbor Size labels ("Very Small"/"Small"/"Medium"/"Large"); legacy ports.json used "Major"/"Minor". | `PORT_SIZE_STYLES`, `PORT_SIZE_ORDER` and `PORT_SIZE_TIER` cover both sets. Keep the legacy entries — ports.json is the fallback file. |
| **wpi_port_id is not unique in portsv2** | IDs 400, 9510, 49454 and 49460 each appear twice. | `GET /api/ports/:id` returns the first match; identify a port by id + name + coordinates. |
| **Compatibility-only fields are null in portsv2** | `state`, `max_vessel_size` and `point_of_interest` have no source column and are always null. | Do not re-derive values silently; search quality is preserved via `alternate_port_name` (matchesQuery searches it). |

---

## 9. Pointer to Other Documentation

- **Architecture Details**: See `docs/architecture.md` for sequence diagrams, caching strategy, and data models.
- **Contribution Workflow**: See `CONTRIBUTING.md` for PR flow, commit styling, and branch naming.
- **Feature Roadmap**: See `TODO.md` for planned capabilities and backlog items.
