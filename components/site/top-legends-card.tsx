import { CURRENT_PATCH, getLegend } from "@/lib/mock-data"
import { formatPercent } from "@/lib/format"
import { legendIdForSlug } from "@/lib/legends-roster"
import { getValhallanLegendStats } from "@/lib/sync/valhallan"
import { PreviewCard } from "./preview-card"
import { LegendChip, StanceLabel, TierLetter } from "./primitives"

/**
 * Featured legends on the homepage Top Legends card. Order is the user's
 * curated "Valhallan+ popular meta" ranking. Tier and best-stance stay
 * hardcoded via the mock-data DETAILED_LEGENDS entries; WR and game count
 * come from the live Valhallan-tier Popular aggregation.
 */
const FEATURED_SLUGS = [
  "cassidy",
  "mordex",
  "teros",
  "bodvar",
  "diana",
  "asuri",
] as const

export async function TopLegendsCard() {
  // Live popular-method stats across the competitive Valhallan pool. Falls
  // back gracefully if the DB lookup fails (e.g. DATABASE_URL not set).
  let liveStats = new Map<number, { winRate: number; games: number }>()
  try {
    const { legends } = await getValhallanLegendStats({
      method: "popular",
      region: null,
      minGames: 100,
    })
    liveStats = new Map(
      legends.map((l) => [
        l.legend_id,
        { winRate: l.win_rate, games: l.games },
      ]),
    )
  } catch (err) {
    console.error("[top-legends-card] stats lookup failed:", err)
  }

  // The 6 candidates come from the curated popular-meta pool. Cassidy is
  // pinned at #1 as the marquee S+ legend; the remaining five sort by WR
  // descending with games as the tiebreaker.
  const PINNED_FIRST = "cassidy"
  const rows = FEATURED_SLUGS.map((slug) => {
    const legend = getLegend(slug)
    const legendId = legendIdForSlug(slug)
    const live = legendId != null ? liveStats.get(legendId) : undefined
    return { slug, legend, live }
  })
    .filter((r) => r.legend)
    .sort((a, b) => {
      if (a.slug === PINNED_FIRST) return -1
      if (b.slug === PINNED_FIRST) return 1
      const aWr = a.live?.winRate ?? a.legend!.winRate
      const bWr = b.live?.winRate ?? b.legend!.winRate
      if (bWr !== aWr) return bWr - aWr
      const aGames = a.live?.games ?? 0
      const bGames = b.live?.games ?? 0
      return bGames - aGames
    })

  return (
    <PreviewCard
      title="Top legends"
      href="/legends"
      viewAllLabel="view full tier list"
      meta={
        <>
          <span className="rounded border border-tier-valhallan/40 bg-tier-valhallan/15 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-tier-valhallan">
            Valhallan+
          </span>
          <span className="rounded border border-copper/40 bg-copper/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-copper">
            Patch {CURRENT_PATCH}
          </span>
        </>
      }
    >
      <ol className="divide-y divide-border/60">
        {rows.map(({ legend, live }) => {
          if (!legend) return null
          // Prefer the live aggregation when available; fall back to mock
          // numbers if the row hasn't been synced yet (cron still seeding).
          const winRate = live?.winRate ?? legend.winRate
          const games = live?.games ?? null
          return (
            <li
              key={legend.id}
              className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
            >
              <TierLetter tier={legend.tier} />
              <LegendChip legendId={legend.id} size="md" showName={false} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">
                  {legend.name}
                </span>
                {legend.bestStance && (
                  <StanceLabel stance={legend.bestStance} />
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="font-mono text-sm tabular-nums">
                  {formatPercent(winRate)}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                  {games != null ? `${games.toLocaleString()} games` : "—"}
                </span>
              </div>
            </li>
          )
        })}
      </ol>
    </PreviewCard>
  )
}
