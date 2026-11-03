# Project Roadmap & Backlog — Helm.Ports

This document tracks planned features, enhancements, and technical debt items for **Helm.Ports**.

---

## 📌 Near-Term Priorities (v1.1)

- [ ] **URL Query Parameter Synchronization**:
  - Sync active filter state (`q`, `country`, `portSize`, `minChannelDepth`, `tab`) into the browser URL query string.
  - Enable deep linking and shareable filter URLs.
  - Note: the GL map already syncs its country selection to `?country=`; this item covers the remaining filter and tab state.

- [ ] **Data Export Capabilities**:
  - Add "Export CSV" and "Export GeoJSON" buttons in the table view header.
  - Export filtered results directly from memory without additional server requests.

- [ ] **Nautical Distance Calculator**:
  - Allow selecting two ports to compute the great-circle navigational distance in nautical miles (NM) and kilometers.
  - Draw a great-circle arc overlay on the interactive SVG map.

---

## 🚀 Mid-Term Features (v1.2)

- [ ] **Vessel Draught Clearance Screener**:
  - Input field for vessel draft (e.g. `14.5 m`) and under-keel clearance (UKC) margin.
  - Instant map/table highlight of accessible vs. restricted ports.

- [ ] **Port Comparison Mode**:
  - Side-by-side comparison modal for 2–3 selected ports (channel vs anchorage depths, cargo pier limits, tidal windows, entrance restrictions).

- [ ] **Offline & PWA Integration**:
  - Implement a Service Worker to cache `public/land.json` and pre-fetch `/api/ports?format=points`.
  - Offline-first maritime reference capability.

---

## 🛠️ Technical Debt & Optimization

- [x] Migrate Next.js 15 monolith to standalone React 19 + Express + Vite architecture.
- [x] Normalize 220 raw WPI country abbreviations into 209 canonical country names.
- [x] Configure Tailwind CSS v4 OKLCH token system.
- [x] Add per-port Solar & Lunar transit panel (Merpas, nautical twilight, moon phase) via `GET /api/astronomy` with 12 h caching.
- [x] Add automated unit tests with `node:test` covering `src/lib/ports.ts` filtering and sorting invariants. (Wired into `npm test`; `src/lib/contrast.test.ts` additionally pins WCAG AA pairs for the moss palette.)
- [x] Adopt the NGA Updated Pub 150 dataset (portsv2, 117 fields, 3,814 served records) as the primary database; legacy 2019 `ports.json` kept as automatic fallback (PR #41).
- [x] Zero-API single-glance port popup — bundled tz lookup, size/vessel/restriction pills, channel + tide summary — with 16 px invisible hit targets and label clicks (PRs #39–#40).
- [x] Country-first GL world view: compact uniform moss country markers with count labels, per-country tier-coloured pins with decluttered name labels, clustering removed, `?country=` deep links (PRs #37–#38).
- [x] Country flag in the port detail sheet via key-free flagcdn (PR #34).
- [ ] Add Playwright browser test suite for pan/zoom interactions and filter drawer on mobile viewports.

- [ ] **Moss harmonization follow-ups (deferred from the palette PR)**:
  - Done: port pins use the moss tier ramp, light + dark palettes in `src/map/config.ts` (amber clusters were removed with clustering entirely).
  - Done: world-view country dots / labels recoloured to the moss palette — compact uniform markers, theme-aware paint.
  - Replace the List/Map toggle pill gradient (hard-coded `from-[#DDEFE0] to-[#E9F6CE]` / dark equivalents) with semantic tokens.
  - Fix table column overflow on small screens and align the mobile/desktop explorer layout.
  - Re-token the legacy SVG map depth ramp (`depthColor()` in `src/components/ports/types.ts`).

- [ ] **Template leftovers (audit)**: `@google/genai` and `motion` are declared in `package.json` but no imports were found in the reviewed `src/` tree, and the `GEMINI_API_KEY` / `APP_URL` blocks in `.env.example` are AI Studio template remnants — verify and remove (or wire up).
- [ ] **Port data filename**: `data/portsv2-117 field.json` contains a space; `resolveDataFile()` already prefers a plain `portsv2.json` — renaming would simplify shell quoting and globs.
- [ ] **Retire the legacy UN/LOCODE join**: `scripts/join-unlocode.ts` / `npm run data:unlocode` only affect the legacy `data/ports.json` fallback now that portsv2 ships `un_locode` natively; keep, repoint, or remove.
- [ ] **Intentionally untouched**: `metadata.json`'s description still says "5,410 ports" — AGENTS.md §7 forbids touching that file; revisit only if the maintainer retires the rule.
