import { CURRENT_PATCH, WEAPON_NAMES } from "@/lib/mock-data"
import { slugForLegendId } from "@/lib/legends-roster"
import { getValhallanWeaponStats } from "@/lib/sync/valhallan"
import { PreviewCard } from "./preview-card"
import { LegendChip, WeaponIcon } from "./primitives"

export async function WeaponMetaCard() {
  const { weapons } = await getValhallanWeaponStats()
  // Sort the homepage preview by WR so it answers "what's winning at top
  // level" rather than "what's getting played". /weapons page keeps its
  // games-desc default for the full table.
  const top = [...weapons]
    .filter((w) => w.games > 0)
    .sort((a, b) => b.win_rate - a.win_rate)
    .slice(0, 6)

  return (
    <PreviewCard
      title="Weapon meta"
      href="/weapons"
      viewAllLabel="view weapon meta"
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
        {top.map((weapon, i) => {
          const topSlug = weapon.top_legend_id
            ? slugForLegendId(weapon.top_legend_id)
            : null
          return (
            <li
              key={weapon.weapon_id}
              className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
            >
              <span className="w-4 text-right font-mono text-xs text-muted-foreground tabular-nums">
                {i + 1}
              </span>
              <WeaponIcon weaponId={weapon.weapon_id} size={28} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">
                  {WEAPON_NAMES[weapon.weapon_id]}
                </span>
                {topSlug && (
                  <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="font-mono uppercase tracking-wider">
                      top on
                    </span>
                    <LegendChip legendId={topSlug} size="sm" />
                  </span>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="font-mono text-sm tabular-nums">
                  {weapon.win_rate.toFixed(1)}%
                </span>
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                  {weapon.games.toLocaleString()} games
                </span>
              </div>
            </li>
          )
        })}
      </ol>
    </PreviewCard>
  )
}
