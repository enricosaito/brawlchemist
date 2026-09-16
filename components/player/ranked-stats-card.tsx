import { TrendingDown, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { TIER_COLOR_VAR } from "@/components/site/primitives"
import { formatElo, formatPercent } from "@/lib/format"
import { CURRENT_SEASON } from "@/lib/mock-data"
import { getRatingHistory } from "@/lib/sync/snapshots"
import { RatingTrendChart } from "./rating-trend-chart"
import type { Tier } from "@/lib/types"

const WINDOW_DAYS = 30

export interface RankedStats {
  /** Current 1v1 rating. */
  rating: number | null
  /** Career peak, not the window peak the chart would otherwise report. */
  peak: number | null
  tier: Tier | null
  /** Spelled-out tier, for the tooltip on the helm-less bands. */
  tierName: string
  /**
   * Global 1v1 ladder position, when the live snapshot holds them.
   *
   * Joined onto the tier for Valhallans only, and not as decoration: every
   * other tier is a rating band, so "2,925" and "Valhallan" say different
   * things and the band explains the number. Valhallan is not a band — it is
   * the top of the ladder, with no fixed floor — so the rank is the only thing
   * that says what the rating actually bought, which is why it reads as part
   * of the tier name rather than a separate note beside it.
   */
  globalRank?: number | null
  /** 1v1 + every 2v2 team, matching what the profile counts elsewhere. */
  wins: number
  games: number
}

/**
 * RankedStatsCard — the profile's ranked section: the season's numbers and the
 * shape of how they got there.
 *
 * This was "Rating History", a chart on its own. The header above it carried
 * the numbers, which meant the two halves of one story sat in different parts
 * of the page and the header had to shrink every figure to fit them beside the
 * art. Together they read as one panel and each gets room.
 *
 * The chart is deliberately one line in one colour — the player's current tier
 * — rather than the tier-banded version this replaced. That chart carried more
 * information (zone shading, threshold lines, rank helms) but read as a
 * diagram; the shape of the climb is what people actually come here for.
 */
export async function RankedStatsCard({
  brawlhallaId,
  valhallanCutoff,
  stats,
  ratingSlot,
  mostPlayedSlot,
  embedded = false,
}: {
  brawlhallaId: number
  /** The region's live Valhallan cutoff — drives the "to Valhallan" chip. */
  valhallanCutoff: number | null
  stats: RankedStats
  /** The rating figure (helm + number + unit), rendered by the page. */
  ratingSlot?: React.ReactNode
  /** Legend heads + weapon shares, rendered by the page. */
  mostPlayedSlot?: React.ReactNode
  /** Drop the outer section/width wrapper so a parent can place the card. */
  embedded?: boolean
}) {
  let history: Awaited<ReturnType<typeof getRatingHistory>> = []
  try {
    history = await getRatingHistory(brawlhallaId, WINDOW_DAYS)
  } catch (err) {
    console.error("[ranked-stats] history read failed:", err)
  }

  const losses = Math.max(0, stats.games - stats.wins)

  const metrics = (
    <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
      {/* The tier spelled out under the number. The helm beside the rating
          carries it for anyone who reads helms, but it's the one figure in
          this row whose unit is a word rather than a count — and "2,895" means
          nothing without knowing 2,895 is Valhallan. It goes in the same sub
          line the other metrics use, so the row stays on one baseline grid. */}
      <Metric
        label="1v1 Rating"
        sub={
          stats.tier ? (
            // One string, one colour. For a Valhallan the rank is not a second
            // fact alongside the tier — it is what the tier means, so
            // "VALHALLAN #1" reads as the full name of where they sit rather
            // than a label with a footnote. See globalRank.
            <span
              className="font-semibold uppercase tabular-nums"
              style={{ color: TIER_COLOR_VAR[stats.tier] }}
            >
              {stats.tierName}
              {stats.tier === "Valhallan" &&
                stats.globalRank != null &&
                ` #${stats.globalRank.toLocaleString()}`}
            </span>
          ) : undefined
        }
      >
        {ratingSlot}
      </Metric>
      <Metric
        label="Win Rate"
        sub={`${stats.wins.toLocaleString()}W · ${losses.toLocaleString()}L`}
      >
        <span className="text-positive">
          {stats.games > 0
            ? formatPercent((stats.wins / stats.games) * 100)
            : "—"}
        </span>
      </Metric>
      <Metric label="Games">{stats.games.toLocaleString()}</Metric>
      <Metric label="Peak Elo">
        {stats.peak != null ? formatElo(stats.peak) : "—"}
      </Metric>
      {mostPlayedSlot && (
        <div className="min-w-0">{mostPlayedSlot}</div>
      )}
    </div>
  )

  const card = (body: React.ReactNode) => {
    const inner = (
      <>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="font-display text-lg font-semibold">
            Ranked Season {CURRENT_SEASON}
          </h2>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/50 p-5 backdrop-blur-sm sm:p-6">
          {metrics}
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
      <p className="mt-5 border-t border-border/60 pt-5 text-center font-mono text-xs uppercase tracking-wider text-muted-foreground">
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
  const current = ratings[ratings.length - 1]
  const delta = current - ratings[0]

  // Short, dense-safe tick labels — the chart thins them to ~5 across the axis.
  const labels = points.map((p) =>
    new Date(p.t).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  )
  const lineColor = TIER_COLOR_VAR[stats.tier ?? "Diamond"]

  // Honest span label — data often covers far less than the 30d window.
  const spanDays = (points[points.length - 1].t - points[0].t) / 86_400_000
  const spanLabel =
    spanDays >= WINDOW_DAYS * 0.8
      ? `Last ${WINDOW_DAYS}d`
      : spanDays < 1
        ? "Past 24h"
        : `Last ${Math.ceil(spanDays)}d`

  // Distance to the Valhallan cutoff — the framing the top band visualized.
  const toValhallan =
    valhallanCutoff != null && current < valhallanCutoff
      ? valhallanCutoff - current
      : null

  return card(
    <div className="mt-5 border-t border-border/60 pt-5">
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
        {/* No peak here any more — it's a metric above, and two "peak" numbers
            meaning different things (career vs this window) was the confusing
            part of the old card. */}
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {points.length} snapshots
        </span>
      </div>

      <RatingTrendChart ratings={ratings} labels={labels} color={lineColor} />
    </div>,
  )
}

/** One label / big-value / optional-sub column in the metrics strip. */
function Metric({
  label,
  sub,
  children,
}: {
  label: string
  sub?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="mt-1 flex h-8 items-center font-display text-2xl font-semibold tabular-nums">
        {children}
      </span>
      <span className="mt-0.5 h-4 truncate font-mono text-[10px] text-muted-foreground">
        {sub}
      </span>
    </div>
  )
}
