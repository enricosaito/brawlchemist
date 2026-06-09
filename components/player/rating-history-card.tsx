import { TrendingDown, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { getRatingHistory } from "@/lib/sync/snapshots"
import { TIER_FLOOR } from "@/lib/tier"
import type { Tier } from "@/lib/types"
import {
  RatingChart,
  type Band,
  type ChartPoint,
  type TierLine,
} from "./rating-chart"

const WINDOW_DAYS = 30

/**
 * RatingHistoryCard — the profile's "rating over time" section (dpm.lol-style).
 * Reads the snapshot series recorded by every fresh /ranked payload (zero
 * extra API calls; see lib/sync/snapshots.ts) and renders the 30-day chart
 * with tier-threshold lines, peak marker, and window delta.
 */
export async function RatingHistoryCard({
  brawlhallaId,
  valhallanCutoff,
  tier,
  embedded = false,
}: {
  brawlhallaId: number
  /** The region's live Valhallan cutoff — drawn as the top threshold line. */
  valhallanCutoff: number | null
  /** Player's current tier — drives the line color. */
  tier: Tier | null
  /** When true, drop the outer section/width wrapper so a parent can place
   * the card in its own layout (e.g. an Overview grid column). */
  embedded?: boolean
}) {
  let history: Awaited<ReturnType<typeof getRatingHistory>> = []
  try {
    history = await getRatingHistory(brawlhallaId, WINDOW_DAYS)
  } catch (err) {
    console.error("[rating-history] read failed:", err)
  }

  const heading = (
    <div className="mb-3 flex items-center gap-2">
      <h2 className="font-display text-lg font-semibold">Rating History</h2>
      <span className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Last {WINDOW_DAYS}d
      </span>
    </div>
  )

  const card = (body: React.ReactNode) => {
    const inner = (
      <>
        {heading}
        <div className="rounded-2xl border border-border/60 bg-card/50 p-5 backdrop-blur-sm sm:p-6">
          {body}
        </div>
      </>
    )
    if (embedded) return inner
    return (
      <section className="mt-8 px-4 sm:px-6">
        <div className="mx-auto max-w-[1280px]">{inner}</div>
      </section>
    )
  }

  // History accrues from each fresh sync — brand-new (to us) players start
  // empty. One point can't draw a line either.
  if (history.length < 2) {
    return card(
      <p className="py-6 text-center font-mono text-xs uppercase tracking-wider text-muted-foreground">
        Rating history records from each profile visit — check back after a few
        games.
      </p>,
    )
  }

  const points: ChartPoint[] = history.map((h) => ({
    t: h.takenAt.getTime(),
    rating: h.rating,
  }))
  const ratings = points.map((p) => p.rating)
  const lo = Math.min(...ratings)
  const hi = Math.max(...ratings)
  const peak = hi
  const current = points[points.length - 1].rating
  const delta = current - points[0].rating

  // --- Tier-anchored Y domain ------------------------------------------------
  // Bracket the series with the nearest tier boundaries so the chart reads as
  // "where in the ladder am I" (dpm.lol-style) rather than a line floating in
  // padded space. A boundary further than REACH from the data is ignored (we
  // don't zoom out to a distant Diamond floor and flatten everything); that
  // side falls back to a data-proportional pad. MIN_RANGE stops a pair of
  // near-equal snapshots from zooming in absurdly.
  const boundaries: TierLine[] = (
    Object.entries(TIER_FLOOR) as [Exclude<Tier, "Valhallan">, number][]
  ).map(([t, rating]) => ({ tier: t, rating }))
  if (valhallanCutoff != null) {
    boundaries.push({ tier: "Valhallan", rating: valhallanCutoff })
  }
  boundaries.sort((a, b) => a.rating - b.rating)

  const dataRange = hi - lo
  const REACH = Math.max(150, dataRange * 1.6)
  const PAD = Math.max(24, Math.round(dataRange * 0.5))

  const above = boundaries.find((b) => b.rating > hi)
  const below = [...boundaries].reverse().find((b) => b.rating < lo)

  let yMax = above && above.rating - hi <= REACH ? above.rating + 8 : hi + PAD
  let yMin = below && lo - below.rating <= REACH ? below.rating - 8 : lo - PAD

  const MIN_RANGE = 90
  if (yMax - yMin < MIN_RANGE) {
    const mid = (yMax + yMin) / 2
    yMin = mid - MIN_RANGE / 2
    yMax = mid + MIN_RANGE / 2
  }

  // Threshold lines: every boundary inside the visible domain.
  const tierLines = boundaries.filter(
    (b) => b.rating >= yMin && b.rating <= yMax,
  )

  // Tier zones: contiguous bands spanning the domain, each owned by the tier
  // whose floor sits at-or-below the band's midpoint.
  const inside = boundaries.filter((b) => b.rating > yMin && b.rating < yMax)
  const edges = [yMin, ...inside.map((b) => b.rating), yMax]
  const bands: Band[] = []
  for (let i = 0; i < edges.length - 1; i++) {
    const bandLo = edges[i]
    const bandHi = edges[i + 1]
    const mid = (bandLo + bandHi) / 2
    let bandTier: Tier = boundaries[0]?.tier ?? "Tin"
    for (const b of boundaries) if (b.rating <= mid) bandTier = b.tier
    bands.push({ tier: bandTier, lo: bandLo, hi: bandHi })
  }

  // Honest span label — data often covers far less than the 30d window.
  const spanDays =
    (points[points.length - 1].t - points[0].t) / 86_400_000
  const spanLabel =
    spanDays >= WINDOW_DAYS * 0.8
      ? `Last ${WINDOW_DAYS}d`
      : spanDays < 1
        ? "Past 24h"
        : `Last ${Math.ceil(spanDays)}d`

  // Distance to the Valhallan cutoff — the framing the top band visualizes.
  const toValhallan =
    valhallanCutoff != null && current < valhallanCutoff
      ? valhallanCutoff - current
      : null

  return card(
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-xs tabular-nums",
            delta >= 0
              ? "border-positive/30 bg-positive/10 text-positive"
              : "border-negative/30 bg-negative/10 text-negative",
          )}
        >
          {delta >= 0 ? (
            <TrendingUp className="size-3.5" />
          ) : (
            <TrendingDown className="size-3.5" />
          )}
          {delta >= 0 ? "+" : ""}
          {delta.toLocaleString()}
          <span className="text-[9px] uppercase tracking-wider opacity-80">
            {spanLabel}
          </span>
        </span>
        {toValhallan != null && toValhallan <= 600 && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-tier-valhallan/30 bg-tier-valhallan/10 px-2 py-1 font-mono text-xs tabular-nums text-tier-valhallan">
            {toValhallan.toLocaleString()}
            <span className="text-[9px] uppercase tracking-wider opacity-80">
              to Valhallan
            </span>
          </span>
        )}
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Peak <span className="text-foreground">{peak.toLocaleString()}</span>
          <span className="px-1.5 opacity-60">·</span>
          {points.length} snapshots
        </span>
      </div>

      <RatingChart
        points={points}
        tierLines={tierLines}
        bands={bands}
        yMin={yMin}
        yMax={yMax}
        lineTier={tier ?? "Diamond"}
      />
    </>,
  )
}
