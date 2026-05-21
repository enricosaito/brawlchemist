import { LEGENDS, WEAPON_NAMES } from "@/lib/mock-data"
import { formatPercent } from "@/lib/format"
import { LEGEND_TIER_RANK } from "@/lib/types"
import { PreviewCard } from "./preview-card"
import { Delta, LegendChip, TierLetter } from "./primitives"

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
      href="/tier-list"
      viewAllLabel="view full tier list"
      meta={
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          1v1 · last 7d
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
              <span className="truncate text-sm font-medium">{legend.name}</span>
              <span className="truncate font-mono text-[10px] text-muted-foreground">
                {WEAPON_NAMES[legend.weapons[0]]} · {WEAPON_NAMES[legend.weapons[1]]}
              </span>
            </div>
            <div className="flex flex-col items-end gap-0.5">
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
