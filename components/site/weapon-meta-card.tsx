import { WEAPONS, getLegend } from "@/lib/mock-data"
import { formatPercent } from "@/lib/format"
import { PreviewCard } from "./preview-card"
import { Delta, LegendChip } from "./primitives"

export function WeaponMetaCard() {
  const top = [...WEAPONS].sort((a, b) => b.pickRate - a.pickRate).slice(0, 6)

  return (
    <PreviewCard
      title="Weapon meta"
      href="/weapons"
      viewAllLabel="view weapon meta"
      meta={
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          by pick rate
        </span>
      }
    >
      <ol className="divide-y divide-border/60">
        {top.map((weapon, i) => {
          const topLegend = getLegend(weapon.topLegendId)
          return (
            <li
              key={weapon.id}
              className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
            >
              <span className="w-4 text-right font-mono text-xs text-muted-foreground tabular-nums">
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">
                  {weapon.name}
                </span>
                {topLegend && (
                  <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="font-mono uppercase tracking-wider">best on</span>
                    <LegendChip legendId={topLegend.id} size="sm" />
                  </span>
                )}
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className="font-mono text-sm tabular-nums">
                  {formatPercent(weapon.pickRate)}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                  WR {formatPercent(weapon.winRate)}{" "}
                  <Delta value={Number(weapon.deltaWR.toFixed(1))} suffix="%" />
                </span>
              </div>
            </li>
          )
        })}
      </ol>
    </PreviewCard>
  )
}
