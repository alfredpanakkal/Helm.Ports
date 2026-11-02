"use client";

import { useState } from "react";
import { fmtTime, heightLabel, type TideDay } from "@/lib/tides";

interface Props {
  day: TideDay;
  unit: "m" | "ft";
  isToday: boolean;
  nowMinutes: number;
}

const W = 720;
const H = 240;
const PAD = { l: 48, r: 14, t: 16, b: 28 };

function xOf(minutes: number): number {
  return PAD.l + (minutes / 1440) * (W - PAD.l - PAD.r);
}

function clampMinutes(m: number): number {
  return Math.max(0, Math.min(1440, m));
}

/** Index of the segment [i, i+1] that contains `minutes` (works with gaps). */
function segmentIndex(series: { minutes: number }[], minutes: number): number {
  let i = 0;
  // Advance while the next point still starts at or before `minutes`
  while (i < series.length - 2 && series[i + 1].minutes <= minutes) i++;
  return i;
}

function interpHeight(series: { minutes: number; height: number }[], minutes: number): number {
  if (series.length === 0) return 0;
  if (series.length === 1) return series[0].height;
  const idx = segmentIndex(series, minutes);
  const a = series[idx];
  const b = series[idx + 1];
  const span = b.minutes - a.minutes || 1;
  const frac = Math.max(0, Math.min(1, (minutes - a.minutes) / span));
  return a.height + (b.height - a.height) * frac;
}

/** Catmull-Rom to cubic bezier: a smooth path through the hourly points. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  let d = "M " + pts[0].x.toFixed(1) + " " + pts[0].y.toFixed(1);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += " C " + c1x.toFixed(1) + " " + c1y.toFixed(1) + ", " + c2x.toFixed(1) + " " + c2y.toFixed(1) + ", " + p2.x.toFixed(1) + " " + p2.y.toFixed(1);
  }
  return d;
}

/**
 * Inline SVG tide curve for one port-local day: smooth sea-level line,
 * H/L markers at the day's highest high and lowest low, a dashed "now"
 * line (today only) and a scrubbable readout (pointer + keyboard).
 */
export function TideChart({ day, unit, isToday, nowMinutes }: Props) {
  const [scrubMin, setScrubMin] = useState<number | null>(null);
  const series = day.series;
  if (series.length < 2) return null;

  const heights = series.map((s) => s.height);
  const dataMin = Math.min(...heights);
  const dataMax = Math.max(...heights);
  const span = Math.max(0.05, dataMax - dataMin);
  const minH = dataMin - span * 0.2;
  const maxH = dataMax + span * 0.2;
  const yOf = (h: number) => PAD.t + ((maxH - h) / (maxH - minH)) * (H - PAD.t - PAD.b);

  const points = series.map((s) => ({ x: xOf(s.minutes), y: yOf(s.height) }));
  const path = smoothPath(points);

  const setFromPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const viewBoxX = ((e.clientX - rect.left) / rect.width) * W;
    const t = (viewBoxX - PAD.l) / (W - PAD.l - PAD.r);
    setScrubMin(clampMinutes(t * 1440));
  };

  const high = day.highestHigh;
  const low = day.lowestLow;
  const nowX = xOf(clampMinutes(nowMinutes));

  let readout = "";
  if (scrubMin != null) {
    const idx = segmentIndex(series, scrubMin);
    const rising = series[idx + 1].height >= series[idx].height;
    readout =
      fmtTime(scrubMin) +
      " · " +
      heightLabel(interpHeight(series, scrubMin), unit) +
      " · " +
      (rising ? "rising" : "falling");
  } else if (isToday) {
    const nextHigh = day.highs.find((x) => x.minutes > nowMinutes);
    const nextLow = day.lows.find((x) => x.minutes > nowMinutes);
    const next = nextHigh ?? nextLow ?? null;
    if (next) {
      const delta = Math.max(0, Math.round(next.minutes - nowMinutes));
      readout =
        (next.type === "high" ? "Next high at " : "Next low at ") +
        fmtTime(next.minutes) +
        " (in " +
        Math.floor(delta / 60) +
        " h " +
        (delta % 60) +
        " min)";
    }
  }

  const aria =
    "Tide curve for " + day.date + ". " +
    (high ? "Highest high " + heightLabel(high.height, unit) + " at " + fmtTime(high.minutes) + ". " : "") +
    (low ? "Lowest low " + heightLabel(low.height, unit) + " at " + fmtTime(low.minutes) + ". " : "") +
    "Use left and right arrow keys to move the scrub line.";

  return (
    <div className="mt-2" style={{ touchAction: "pan-y" }}>
      <svg
        viewBox={"0 0 " + W + " " + H}
        role="img"
        aria-label={aria}
        tabIndex={0}
        className="w-full rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setFromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons > 0) setFromPointer(e);
        }}
        onKeyDown={(e) => {
          const cur = scrubMin ?? (isToday ? clampMinutes(nowMinutes) : 720);
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            setScrubMin(clampMinutes(Math.round(cur) - 10));
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            setScrubMin(clampMinutes(Math.round(cur) + 10));
          } else if (e.key === "Home") {
            e.preventDefault();
            setScrubMin(0);
          } else if (e.key === "End") {
            e.preventDefault();
            setScrubMin(1440);
          }
        }}
      >
        {[dataMin, (dataMin + dataMax) / 2, dataMax].map((v, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={yOf(v)} y2={yOf(v)} className="stroke-border" strokeWidth={1} />
            <text x={PAD.l - 6} y={yOf(v) + 3} textAnchor="end" className="fill-muted-foreground" fontSize={10}>
              {heightLabel(v, unit)}
            </text>
          </g>
        ))}
        {0 >= minH && 0 <= maxH && (
          <g>
            <line x1={PAD.l} x2={W - PAD.r} y1={yOf(0)} y2={yOf(0)} className="stroke-muted-foreground" strokeWidth={1} strokeDasharray="3 3" />
            <text x={W - PAD.r} y={yOf(0) - 4} textAnchor="end" className="fill-muted-foreground" fontSize={9}>
              MSL
            </text>
          </g>
        )}
        {[0, 360, 720, 1080, 1440].map((m) => (
          <text key={m} x={xOf(m)} y={H - 8} textAnchor="middle" className="fill-muted-foreground" fontSize={10}>
            {fmtTime(m)}
          </text>
        ))}
        <path d={path} fill="none" className="stroke-teal-600" strokeWidth={2} />
        {isToday && nowMinutes >= 0 && nowMinutes <= 1440 && (
          <g>
            <line x1={nowX} x2={nowX} y1={PAD.t} y2={H - PAD.b} className="stroke-muted-foreground" strokeWidth={1} strokeDasharray="4 3" />
            <text x={nowX} y={PAD.t + 2} textAnchor="middle" className="fill-muted-foreground" fontSize={9}>
              Now
            </text>
          </g>
        )}
        {high && (
          <g>
            <circle cx={xOf(clampMinutes(high.minutes))} cy={yOf(high.height)} r={4} className="fill-teal-600" />
            <text
              x={xOf(clampMinutes(high.minutes))}
              y={yOf(high.height) - 8}
              textAnchor="middle"
              className="fill-foreground"
              fontSize={10}
            >
              {"H " + fmtTime(high.minutes)}
            </text>
          </g>
        )}
        {low && (
          <g>
            <circle cx={xOf(clampMinutes(low.minutes))} cy={yOf(low.height)} r={4} className="fill-muted-foreground" />
            <text
              x={xOf(clampMinutes(low.minutes))}
              y={yOf(low.height) + 16}
              textAnchor="middle"
              className="fill-foreground"
              fontSize={10}
            >
              {"L " + fmtTime(low.minutes)}
            </text>
          </g>
        )}
        {scrubMin != null && (
          <g>
            <line x1={xOf(scrubMin)} x2={xOf(scrubMin)} y1={PAD.t} y2={H - PAD.b} className="stroke-foreground" strokeWidth={1} />
            <circle cx={xOf(scrubMin)} cy={yOf(interpHeight(series, scrubMin))} r={3.5} className="fill-foreground" />
          </g>
        )}
      </svg>
      {readout && (
        <p className="mt-1 text-center text-[11px] tabular-nums text-muted-foreground">{readout}</p>
      )}
    </div>
  );
}
