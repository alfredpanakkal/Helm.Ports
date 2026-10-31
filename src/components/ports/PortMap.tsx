"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { depthColor, type MapPoint } from "./types";

const W = 1000;
const H = 500;

/**
 * Zoom-based level-of-detail config.
 * LOD_MIN_ZOOM[i] = minimum map scale k at which tier i+1 becomes visible.
 * Tune on a real device — world view (k=1) shows only Major ports.
 */
const LOD_MIN_ZOOM = [1, 2, 4, 8];
/** Base dot radius per tier (1=Major … 4=Very Small); scaled down as k grows. */
const TIER_RADIUS = [3.4, 2.4, 1.8, 1.4];

interface Props {
  points: MapPoint[];
  total: number;
  loading: boolean;
  onSelect: (portId: number) => void;
}

interface PlacedPoint {
  p: MapPoint;
  cx: number;
  cy: number;
  tier: number; // 0-based tier index
}

function project(lon: number, lat: number): [number, number] {
  return [((lon + 180) / 360) * W, ((90 - lat) / 180) * H];
}

export function PortMap({ points, total, loading, onSelect }: Props) {
  const [paths, setPaths] = useState<string[]>([]);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const [hover, setHover] = useState<PlacedPoint | null>(null);
  /** Selected port is kept visible + highlighted even when its tier is hidden. */
  const [selectedPt, setSelectedPt] = useState<PlacedPoint | null>(null);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    fetch("/land.json")
      .then((r) => r.json())
      .then((d) => setPaths(d.paths ?? []))
      .catch(() => setPaths([]));
  }, []);

  const clampView = useCallback((v: { k: number; x: number; y: number }) => {
    const k = Math.min(24, Math.max(1, v.k));
    const maxX = 0;
    const minX = W - W * k;
    const maxY = 0;
    const minY = H - H * k;
    return {
      k,
      x: Math.min(maxX, Math.max(minX, v.x)),
      y: Math.min(maxY, Math.max(minY, v.y)),
    };
  }, []);

  const zoomBy = useCallback(
    (factor: number) => {
      setView((v) => {
        const k = Math.min(24, Math.max(1, v.k * factor));
        // zoom to center of viewport
        const cx = (W / 2 - v.x) / v.k;
        const cy = (H / 2 - v.y) / v.k;
        return clampView({ k, x: W / 2 - cx * k, y: H / 2 - cy * k });
      });
    },
    [clampView]
  );

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * W;
      const py = ((e.clientY - rect.top) / rect.height) * H;
      setView((v) => {
        const k = Math.min(24, Math.max(1, v.k * (e.deltaY < 0 ? 1.25 : 0.8)));
        const ux = (px - v.x) / v.k;
        const uy = (py - v.y) / v.k;
        return clampView({ k, x: px - ux * k, y: py - uy * k });
      });
    },
    [clampView]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      dragRef.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
    },
    [view]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      const svg = svgRef.current;
      if (!d || !svg) return;
      const rect = svg.getBoundingClientRect();
      const dx = ((e.clientX - d.sx) / rect.width) * W;
      const dy = ((e.clientY - d.sy) / rect.height) * H;
      setView((v) => clampView({ k: v.k, x: d.ox + dx, y: d.oy + dy }));
    },
    [clampView]
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // Split points into per-tier arrays once per data change (the "layer groups").
  const tierCircles = useMemo(() => {
    const tiers: PlacedPoint[][] = [[], [], [], []];
    for (const p of points) {
      const tier = Math.min(3, Math.max(0, (p.t ?? 4) - 1));
      const [cx, cy] = project(p.lo, p.la);
      tiers[tier].push({ p, cx, cy, tier });
    }
    return tiers;
  }, [points]);

  // LOD + viewport culling: only tiers whose min zoom is met, only points
  // inside the visible map rectangle. High tiers are appended first so that
  // tier 1 (Major) paints last and stays on top.
  const rendered = useMemo(() => {
    const margin = 8;
    const x0 = -view.x / view.k - margin;
    const x1 = (W - view.x) / view.k + margin;
    const y0 = -view.y / view.k - margin;
    const y1 = (H - view.y) / view.k + margin;
    const out: PlacedPoint[] = [];
    for (let ti = 3; ti >= 0; ti--) {
      if (view.k < LOD_MIN_ZOOM[ti]) continue;
      for (const c of tierCircles[ti]) {
        if (c.cx >= x0 && c.cx <= x1 && c.cy >= y0 && c.cy <= y1) out.push(c);
      }
    }
    // Selected port stays visible regardless of its tier.
    if (selectedPt) {
      if (!out.some((c) => c.p.i === selectedPt.p.i)) out.push(selectedPt);
    }
    return out;
  }, [tierCircles, view, selectedPt]);

  const dotR = (tier: number) => Math.max(0.8, TIER_RADIUS[tier] / Math.sqrt(view.k));
  const hiddenCount = Math.max(0, total - rendered.length);

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-[#f0f7f7] dark:bg-[#0c1518]">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={`block h-auto w-full select-none ${loading ? "opacity-60" : ""} ${
          view.k > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-default"
        }`}
        role="img"
        aria-label={`World map showing ${rendered.length.toLocaleString()} of ${total.toLocaleString()} ports at the current zoom`}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{ touchAction: "none", aspectRatio: "2 / 1" }}
      >
        <defs>
          <linearGradient id="ocean" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e3f1f0" />
            <stop offset="100%" stopColor="#d3e8e6" />
          </linearGradient>
          <linearGradient id="ocean-dark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0e1a1e" />
            <stop offset="100%" stopColor="#101f24" />
          </linearGradient>
        </defs>
        <rect
          x="0"
          y="0"
          width={W}
          height={H}
          fill="url(#ocean)"
          className="dark:hidden"
        />
        <rect x="0" y="0" width={W} height={H} fill="url(#ocean-dark)" className="hidden dark:block" />
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <g fill="#cbd5cd" className="dark:fill-[#1f2d33]">
            {paths.map((d, i) => (
              <path key={i} d={d} stroke="#b7c6bd" strokeWidth={0.4} className="dark:stroke-[#2c3d45]" />
            ))}
          </g>
          <g>
            {rendered.map(({ p, cx, cy, tier }) => {
              const isSel = selectedPt?.p.i === p.i;
              return (
                <g key={p.i}>
                  {isSel && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={dotR(tier) + 3 / Math.sqrt(view.k)}
                      fill="none"
                      stroke="#0f766e"
                      strokeWidth={1.5 / Math.sqrt(view.k)}
                      className="pointer-events-none"
                    />
                  )}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={dotR(tier)}
                    fill={depthColor(p.d)}
                    opacity={0.85}
                    onMouseEnter={() => setHover({ p, cx, cy, tier })}
                    onMouseLeave={() => setHover(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPt({ p, cx, cy, tier });
                      onSelect(p.i);
                    }}
                    className="cursor-pointer"
                  />
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {/* Hover tooltip */}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 max-w-56 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: `${(hover.cx * view.k + view.x) / W * 100}%`,
            top: `${(hover.cy * view.k + view.y) / H * 100}%`,
          }}
        >
          <p className="font-semibold text-popover-foreground">{hover.p.n}</p>
          <p className="text-muted-foreground">{hover.p.c}</p>
          <p className="text-muted-foreground">
            Channel depth: {hover.p.d != null ? `${hover.p.d.toFixed(1)} m` : "no data"}
          </p>
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute right-3 top-3 flex flex-col gap-1">
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8"
          onClick={() => zoomBy(1.6)}
          aria-label="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8"
          onClick={() => zoomBy(1 / 1.6)}
          aria-label="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8"
          onClick={() => setView({ k: 1, x: 0, y: 0 })}
          aria-label="Reset view"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex flex-col gap-1 rounded-md border border-border bg-background/90 px-2.5 py-2 text-[11px] backdrop-blur">
        <p className="font-medium text-foreground">Max channel depth</p>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-muted-foreground">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#f97316" }} />
            &lt;5 m
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#eab308" }} />
            5–10
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#84cc16" }} />
            10–15
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#14b8a6" }} />
            15–20
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#0d9488" }} />
            20+
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <span className="inline-block h-2.5 w-2.5 rounded-full border border-border bg-muted" />
            none
          </span>
        </div>
        <p className="text-muted-foreground/80">Dot size = port size · smaller ports appear as you zoom in</p>
      </div>

      <div className="absolute bottom-3 right-3 rounded-md border border-border bg-background/90 px-2.5 py-1.5 text-[11px] text-muted-foreground backdrop-blur">
        <span className="font-semibold tabular-nums text-foreground">
          {rendered.length.toLocaleString()}
        </span>{" "}
        of {total.toLocaleString()} ports shown
        {hiddenCount > 0 ? " · zoom in for smaller ports" : ""} · scroll to zoom, drag to pan
      </div>
    </div>
  );
}
