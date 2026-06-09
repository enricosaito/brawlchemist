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

/** A horizontal tier zone shaded behind the line (rating units). */
export interface Band {
  tier: Tier
  lo: number
  hi: number
}

/**
 * RatingChart — the SVG line chart behind the profile's rating history card.
 *
 * Geometry only lives in the SVG (0–100 coordinate space, preserveAspectRatio
 * "none", non-scaling strokes); every label, tier icon, marker dot, and the
 * hover tooltip are HTML overlays positioned by percentage — so nothing
 * stretches with the responsive container.
 *
 * The vertical axis is tier-anchored (see rating-history-card): shaded tier
 * zones sit behind the line, the line is segment-colored by the tier it's
 * travelling through, and sparse histories render their actual snapshot dots
 * so a 3-point series reads as "3 recorded points", not a fabricated trend.
 */
export function RatingChart({
  points,
  tierLines,
  bands,
  yMin,
  yMax,
  lineTier,
}: {
  points: ChartPoint[]
  tierLines: TierLine[]
  bands: Band[]
  yMin: number
  yMax: number
  /** Fallback tier color (hover/peak dot) when a rating sits outside all bands. */
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

  // Tier owning a given rating — drives segment + dot color.
  const tierForRating = (r: number): Tier => {
    for (const b of bands) if (r >= b.lo && r <= b.hi) return b.tier
    return lineTier
  }

  const current = points[points.length - 1].rating
  const peakIndex = useMemo(() => {
    let peak = 0
    for (let i = 1; i < points.length; i++) {
      if (points[i].rating > points[peak].rating) peak = i
    }
    return peak
  }, [points])

  // Per-segment polyline, colored by the tier at each segment's midpoint.
  const segments = useMemo(
    () =>
      points.slice(1).map((p, i) => {
        const a = points[i]
        return {
          x1: xFor(a.t),
          y1: yFor(a.rating),
          x2: xFor(p.t),
          y2: yFor(p.rating),
          tier: tierForRating((a.rating + p.rating) / 2),
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, yMin, yMax, bands],
  )

  // Show the real snapshot dots when the series is sparse — honesty over a
  // smooth line that implies data we don't have.
  const showDots = points.length <= 14

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
    hover != null && hover > 0
      ? points[hover].rating - points[hover - 1].rating
      : null

  // x-axis labels: add the hour for short spans (so "Jun 8" doesn't repeat),
  // then drop any middle label that collides with a neighbour or an endpoint.
  const dateLabels = useMemo(() => {
    const spanDays = tSpan / 86_400_000
    const opts: Intl.DateTimeFormatOptions =
      spanDays <= 2
        ? { month: "short", day: "numeric", hour: "numeric" }
        : { month: "short", day: "numeric" }
    const n = Math.min(5, points.length)
    const raw = Array.from({ length: n }, (_, i) => {
      const t = t0 + (tSpan * i) / Math.max(1, n - 1)
      return {
        x: (i / Math.max(1, n - 1)) * 100,
        label: new Date(t).toLocaleDateString("en-US", opts),
      }
    })
    const first = raw[0].label
    const last = raw[raw.length - 1].label
    return raw.filter((d, i) => {
      if (i === 0 || i === raw.length - 1) return true
      return d.label !== raw[i - 1].label && d.label !== first && d.label !== last
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
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-visible"
          aria-hidden
        >
          {/* Tier zone shading — the band holding the current rating is lifted
              so "where I sit" reads at a glance. */}
          {bands.map((b, i) => {
            const isCurrent = current >= b.lo && current <= b.hi
            return (
              <rect
                key={i}
                x="0"
                width="100"
                y={yFor(b.hi)}
                height={Math.max(0, yFor(b.lo) - yFor(b.hi))}
                fill="currentColor"
                className={cn(
                  TIER_TEXT_COLOR[b.tier],
                  isCurrent ? "opacity-[0.16]" : "opacity-[0.06]",
                )}
              />
            )
          })}

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
              className={cn(TIER_TEXT_COLOR[l.tier], "opacity-50")}
            />
          ))}

          {/* Rating line — one colored segment per step. */}
          {segments.map((s, i) => (
            <line
              key={i}
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className={TIER_TEXT_COLOR[s.tier]}
            />
          ))}

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

        {/* Snapshot dots (sparse series only). */}
        {showDots &&
          points.map((p, i) => (
            <span
              key={i}
              className={cn(
                "pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background",
                TIER_TEXT_COLOR[tierForRating(p.rating)],
              )}
              style={{
                left: `${xFor(p.t)}%`,
                top: `${yFor(p.rating)}%`,
                backgroundColor: "currentcolor",
              }}
            />
          ))}

        {/* Peak marker. */}
        <div
          className={cn(
            "pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center",
            TIER_TEXT_COLOR[tierForRating(points[peakIndex].rating)],
          )}
          style={{
            left: `${xFor(points[peakIndex].t)}%`,
            top: `${yFor(points[peakIndex].rating)}%`,
          }}
        >
          <span
            className="size-2.5 rounded-full border-2 border-background"
            style={{ backgroundColor: "currentcolor" }}
          />
        </div>

        {/* Hover dot + tooltip. */}
        {hovered && (
          <>
            <span
              className={cn(
                "pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background",
                TIER_TEXT_COLOR[tierForRating(hovered.rating)],
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
