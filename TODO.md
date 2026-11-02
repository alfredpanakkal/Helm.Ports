# Project Roadmap & Backlog — Helm.Ports

This document tracks planned features, enhancements, and technical debt items for **Helm.Ports**.

---

## 📌 Near-Term Priorities (v1.1)

- [ ] **URL Query Parameter Synchronization**:
  - Sync active filter state (`q`, `country`, `portSize`, `minChannelDepth`, `tab`) into the browser URL query string.
  - Enable deep linking and shareable filter URLs.

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
- [ ] Add Playwright browser test suite for pan/zoom interactions and filter drawer on mobile viewports.

- [ ] **Moss harmonization follow-ups (deferred from the palette PR)**:
  - Recolour the MapLibre layer paints in `src/map/config.ts` (blue `#0b6ea8` dots, amber clusters) to the moss palette.
  - Replace the List/Map toggle pill gradient (hard-coded `from-[#DDEFE0] to-[#E9F6CE]` / dark equivalents) with semantic tokens.
  - Fix table column overflow on small screens and align the mobile/desktop explorer layout.
  - Re-token the legacy SVG map depth ramp (`depthColor()` in `src/components/ports/types.ts`).
