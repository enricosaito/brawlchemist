import { TrendingDown, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { getRatingHistory } from "@/lib/sync/snapshots"
import { TIER_FLOOR } from "@/lib/tier"
import type { Tier } from "@/lib/types"
import {
  RatingChart,
  type ChartPoint,
  type TierLine,
} from "./rating-chart"

const WINDOW_DAYS = 30
/** Breathing room above/below the series before tier lines are considered. */
const Y_PAD = 30

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
}: {
  brawlhallaId: number
  /** The region's live Valhallan cutoff — drawn as the top threshold line. */
  valhallanCutoff: number | null
  /** Player's current tier — drives the line color. */
  tier: Tier | null
}) {
  let history: Awaited<ReturnType<typeof getRatingHistory>> = []
  try {
    history = await getRatingHistory(brawlhallaId, WINDOW_DAYS)
  } catch (err) {
    console.error("[rating-history] read failed:", err)
  }

  const card = (body: React.ReactNode) => (
    <section className="mt-8 px-4 sm:px-6">
      <div className="mx-auto mb-3 flex max-w-[1280px] items-center gap-2">
        <h2 className="font-display text-lg font-semibold">Rating History</h2>
        <span className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Last {WINDOW_DAYS}d
        </span>
      </div>
      <div className="mx-auto max-w-[1280px]">
        <div className="rounded-2xl border border-border/60 bg-card/50 p-5 backdrop-blur-sm sm:p-6">
          {body}
        </div>
      </div>
    </section>
  )

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
  const delta = points[points.length - 1].rating - points[0].rating

  // Y-domain: pad the series, then stretch to include any tier line that sits
  // close enough to be worth showing (within one extra pad of the data).
  let yMin = lo - Y_PAD
  let yMax = hi + Y_PAD
  const candidates: TierLine[] = (
    Object.entries(TIER_FLOOR) as [Exclude<Tier, "Valhallan">, number][]
  ).map(([t, rating]) => ({ tier: t, rating }))
  if (valhallanCutoff != null) {
    candidates.push({ tier: "Valhallan", rating: valhallanCutoff })
  }
  const tierLines = candidates.filter(
    (l) => l.rating >= lo - Y_PAD * 2 && l.rating <= hi + Y_PAD * 2,
  )
  for (const l of tierLines) {
    yMin = Math.min(yMin, l.rating - 10)
    yMax = Math.max(yMax, l.rating + 10)
  }

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
            Last {WINDOW_DAYS}d
          </span>
        </span>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Peak{" "}
          <span className="text-foreground">{peak.toLocaleString()}</span>
          <span className="px-1.5 opacity-60">·</span>
          {points.length} snapshots
        </span>
      </div>

      <RatingChart
        points={points}
        tierLines={tierLines}
        yMin={yMin}
        yMax={yMax}
        lineTier={tier ?? "Diamond"}
      />
    </>,
  )
}
