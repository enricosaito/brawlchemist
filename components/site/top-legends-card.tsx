import { LEGENDS, WEAPON_NAMES } from "@/lib/mock-data"
import { formatPercent } from "@/lib/format"
import { PreviewCard } from "./preview-card"
import { Delta, LegendChip, TierLetter } from "./primitives"

export function TopLegendsCard() {
  const top = [...LEGENDS]
    .sort((a, b) => b.winRate - a.winRate)
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
        {top.map((legend, i) => (
          <li
            key={legend.id}
            className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
          >
            <span className="w-4 text-right font-mono text-xs text-muted-foreground tabular-nums">
              {i + 1}
            </span>
            <TierLetter tier={legend.tier} size="sm" />
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <LegendChip legendId={legend.id} size="sm" showName={false} />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{legend.name}</span>
                <span className="truncate font-mono text-[10px] text-muted-foreground">
                  {WEAPON_NAMES[legend.weapons[0]]} · {WEAPON_NAMES[legend.weapons[1]]}
                </span>
              </div>
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
