import { CURRENT_PATCH, LEGENDS } from "@/lib/mock-data"
import { formatPercent } from "@/lib/format"
import { LEGEND_TIER_RANK } from "@/lib/types"
import { PreviewCard } from "./preview-card"
import { Delta, LegendChip, StanceLabel, TierLetter } from "./primitives"

export function TopLegendsCard() {
  const top = [...LEGENDS]
    .sort((a, b) => {
      const tierDiff = LEGEND_TIER_RANK[a.tier] - LEGEND_TIER_RANK[b.tier]
      if (tierDiff !== 0) return tierDiff
      return b.winRate - a.winRate
    })
    .slice(0, 6)

  return (
    <PreviewCard
      title="Top legends"
      href="/tierlist"
      viewAllLabel="view full tier list"
      meta={
        <span className="rounded border border-copper/40 bg-copper/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-copper">
          Patch {CURRENT_PATCH}
        </span>
      }
    >
      <ol className="divide-y divide-border/60">
        {top.map((legend) => (
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
              <Delta value={Number(legend.deltaWR.toFixed(1))} suffix="%" />
            </div>
          </li>
        ))}
      </ol>
    </PreviewCard>
  )
}
