import { TrendingDown, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { TIER_COLOR_VAR } from "@/components/site/primitives"
import { getRatingHistory } from "@/lib/sync/snapshots"
import { RatingTrendChart } from "./rating-trend-chart"
import type { Tier } from "@/lib/types"

const WINDOW_DAYS = 30

/**
 * RatingHistoryCard — the profile's "rating over time" section. Reads the
 * snapshot series recorded by every fresh /ranked payload (zero extra API
 * calls; see lib/sync/snapshots.ts) and renders the 30-day trend.
 *
 * The chart is deliberately one line in one colour — the player's current tier
 * — rather than the tier-banded version this replaced. That chart carried more
 * information (zone shading, threshold lines, rank helms) but read as a
 * diagram; the shape of the climb is what people actually come here for. The
 * numbers that framed it survive as the chips above: window delta, distance to
 * Valhallan, peak, sample size.
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

  const points = history.map((h) => ({
    t: h.takenAt.getTime(),
    rating: h.rating,
  }))
  const ratings = points.map((p) => p.rating)
  const peak = Math.max(...ratings)
  const current = ratings[ratings.length - 1]
  const delta = current - ratings[0]

  // Short, dense-safe tick labels — the chart thins them to ~5 across the axis.
  const labels = points.map((p) =>
    new Date(p.t).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  )
  const lineColor = TIER_COLOR_VAR[tier ?? "Diamond"]

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

      <RatingTrendChart ratings={ratings} labels={labels} color={lineColor} />
    </>,
  )
}
