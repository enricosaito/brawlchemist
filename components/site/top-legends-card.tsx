import { CURRENT_PATCH, getLegend } from "@/lib/mock-data"
import { formatPercent } from "@/lib/format"
import { PreviewCard } from "./preview-card"
import { LegendChip, StanceLabel, TierLetter } from "./primitives"

/**
 * Featured legends on the homepage Top Legends card. Order is the user's
 * curated "Valhallan+ popular meta" ranking; the games counts are pulled
 * from the most recent /legends Popular snapshot (rounded for display).
 *
 * Stays hardcoded so the card stays deterministic and lightweight —
 * future iteration can swap to a live DB read via getValhallanLegendStats.
 */
const TOP_LEGENDS = [
  { id: "cassidy", games: 10_361 },
  { id: "mordex", games: 9_577 },
  { id: "teros", games: 8_399 },
  { id: "bodvar", games: 7_120 },
  { id: "diana", games: 7_306 },
  { id: "asuri", games: 6_179 },
]

export function TopLegendsCard() {
  const rows = TOP_LEGENDS.map((entry) => ({
    ...entry,
    legend: getLegend(entry.id),
  })).filter((r) => r.legend)

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
        {rows.map(({ legend, games }) => {
          if (!legend) return null
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
                  {formatPercent(legend.winRate)}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                  {games.toLocaleString()} games
                </span>
              </div>
            </li>
          )
        })}
      </ol>
    </PreviewCard>
  )
}
