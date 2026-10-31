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
- [ ] Add automated unit tests with `node:test` covering `src/lib/ports.ts` filtering and sorting invariants.
- [ ] Add Playwright browser test suite for pan/zoom interactions and filter drawer on mobile viewports.
