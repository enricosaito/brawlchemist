"use client"

import { useMemo, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import type { Tier } from "@/lib/types"
import { RankIcon, TIER_TEXT_COLOR } from "@/components/site/primitives"

export interface ChartPoint {
  /** Epoch ms. */
  t: number
  rating: number
}

export interface TierLine {
  tier: Tier
  rating: number
}

/**
 * RatingChart — the SVG line chart behind the profile's rating history card.
 *
 * Geometry only lives in the SVG (0–100 coordinate space, preserveAspectRatio
 * "none", non-scaling strokes); every label, tier icon, marker dot, and the
 * hover tooltip are HTML overlays positioned by percentage — so nothing
 * stretches with the responsive container. Client component solely for the
 * hover crosshair/tooltip.
 */
export function RatingChart({
  points,
  tierLines,
  yMin,
  yMax,
  lineTier,
}: {
  points: ChartPoint[]
  tierLines: TierLine[]
  yMin: number
  yMax: number
  /** Tier driving the line/fill color (the player's current tier). */
  lineTier: Tier
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const t0 = points[0].t
  const t1 = points[points.length - 1].t
  const tSpan = Math.max(1, t1 - t0)
  const ySpan = Math.max(1, yMax - yMin)

  const xFor = (t: number) => ((t - t0) / tSpan) * 100
  const yFor = (rating: number) => 100 - ((rating - yMin) / ySpan) * 100

  const { linePath, areaPath, peakIndex } = useMemo(() => {
    const coords = points.map((p) => [xFor(p.t), yFor(p.rating)] as const)
    const line = coords
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
      .join(" ")
    const area = `${line} L100 100 L0 100 Z`
    let peak = 0
    for (let i = 1; i < points.length; i++) {
      if (points[i].rating > points[peak].rating) peak = i
    }
    return { linePath: line, areaPath: area, peakIndex: peak }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, yMin, yMax])

  // Nearest point by x fraction of the plot width.
  function onMove(e: React.PointerEvent) {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return
    const fx = ((e.clientX - rect.left) / rect.width) * 100
    let best = 0
    let bestDist = Infinity
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(xFor(points[i].t) - fx)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    }
    setHover(best)
  }

  const hovered = hover != null ? points[hover] : null
  const hoverDelta =
    hover != null && hover > 0 ? points[hover].rating - points[hover - 1].rating : null
  const lineColor = TIER_TEXT_COLOR[lineTier]
  const gradientId = "rating-fill"

  // ~4 evenly-spaced x-axis date labels.
  const dateLabels = useMemo(() => {
    const n = Math.min(4, points.length)
    return Array.from({ length: n }, (_, i) => {
      const t = t0 + (tSpan * i) / Math.max(1, n - 1)
      return {
        x: (i / Math.max(1, n - 1)) * 100,
        label: new Date(t).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points])

  return (
    <div className="select-none">
      <div
        ref={wrapRef}
        className="relative h-52 w-full cursor-crosshair"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {/* The svg carries the line-tier color class so currentColor (line,
            gradient stops) inherits it; tier lines override per-tier. */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className={cn(
            "absolute inset-0 h-full w-full overflow-visible",
            lineColor,
          )}
          aria-hidden
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Tier threshold lines. */}
          {tierLines.map((l) => (
            <line
              key={l.tier}
              x1="0"
              x2="100"
              y1={yFor(l.rating)}
              y2={yFor(l.rating)}
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="3 4"
              vectorEffect="non-scaling-stroke"
              className={cn(TIER_TEXT_COLOR[l.tier], "opacity-40")}
            />
          ))}

          {/* Area fill + rating line. */}
          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path
            d={linePath}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Hover crosshair. */}
          {hovered && (
            <line
              x1={xFor(hovered.t)}
              x2={xFor(hovered.t)}
              y1="0"
              y2="100"
              stroke="currentColor"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              className="text-foreground/25"
            />
          )}
        </svg>

        {/* Tier line labels — icon + rating at the left edge of each line. */}
        {tierLines.map((l) => (
          <div
            key={l.tier}
            className="pointer-events-none absolute left-0 flex -translate-y-1/2 items-center gap-1"
            style={{ top: `${yFor(l.rating)}%` }}
          >
            <RankIcon tier={l.tier} size={16} />
            <span
              className={cn(
                "font-mono text-[9px] tabular-nums opacity-80",
                TIER_TEXT_COLOR[l.tier],
              )}
            >
              {l.rating.toLocaleString()}
            </span>
          </div>
        ))}

        {/* Peak marker. */}
        <div
          className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
          style={{
            left: `${xFor(points[peakIndex].t)}%`,
            top: `${yFor(points[peakIndex].rating)}%`,
          }}
        >
          <span
            className={cn(
              "size-2 rounded-full border-2 border-background",
              lineColor,
            )}
            style={{ backgroundColor: "currentcolor" }}
          />
        </div>

        {/* Hover dot + tooltip. */}
        {hovered && (
          <>
            <span
              className={cn(
                "pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background",
                lineColor,
              )}
              style={{
                left: `${xFor(hovered.t)}%`,
                top: `${yFor(hovered.rating)}%`,
                backgroundColor: "currentcolor",
              }}
            />
            <div
              className="pointer-events-none absolute z-10 -translate-y-full whitespace-nowrap rounded-md border border-border/60 bg-card/95 px-2.5 py-1.5 shadow-lg backdrop-blur-md"
              style={{
                left: `min(max(${xFor(hovered.t)}%, 12%), 88%)`,
                top: `calc(${yFor(hovered.rating)}% - 12px)`,
                transform: "translate(-50%, -100%)",
              }}
            >
              <div className="font-mono text-sm font-semibold tabular-nums">
                {hovered.rating.toLocaleString()}
                <span className="ml-1 text-[9px] uppercase tracking-wider text-muted-foreground">
                  ELO
                </span>
                {hoverDelta != null && hoverDelta !== 0 && (
                  <span
                    className={cn(
                      "ml-1.5 text-[10px]",
                      hoverDelta > 0 ? "text-positive" : "text-negative",
                    )}
                  >
                    {hoverDelta > 0 ? "+" : ""}
                    {hoverDelta}
                  </span>
                )}
              </div>
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                {new Date(hovered.t).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* X-axis dates. */}
      <div className="relative mt-2 h-4">
        {dateLabels.map((d, i) => (
          <span
            key={i}
            className={cn(
              "absolute font-mono text-[9px] uppercase tracking-wider text-muted-foreground",
              i === 0
                ? "left-0"
                : i === dateLabels.length - 1
                  ? "right-0"
                  : "-translate-x-1/2",
            )}
            style={
              i === 0 || i === dateLabels.length - 1
                ? undefined
                : { left: `${d.x}%` }
            }
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  )
}
