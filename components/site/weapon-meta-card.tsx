import Link from "next/link"
import { CURRENT_PATCH, WEAPON_NAMES } from "@/lib/mock-data"
import { rosterEntryByLegendId, slugForLegendId } from "@/lib/legends-roster"
import { getValhallanWeaponStats } from "@/lib/sync/valhallan"
import { PreviewCard } from "./preview-card"
import { LegendChip, WeaponIcon } from "./primitives"

export async function WeaponMetaCard() {
  const { weapons } = await getValhallanWeaponStats()
  // weapons comes pre-sorted by games desc from the aggregation.
  const top = weapons.slice(0, 6)

  return (
    <PreviewCard
      title="Popular weapons"
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
          const topLegends = weapon.top_legend_ids
            .map((id) => {
              const slug = slugForLegendId(id)
              const name = rosterEntryByLegendId(id)?.name
              return slug && name ? { id, slug, name } : null
            })
            .filter((x): x is { id: number; slug: string; name: string } => !!x)
          return (
            <li
              key={weapon.weapon_id}
              className="flex min-h-16 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
            >
              <span className="w-4 text-right font-mono text-xs text-muted-foreground tabular-nums">
                {i + 1}
              </span>
              <WeaponIcon weaponId={weapon.weapon_id} size={28} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">
                  {WEAPON_NAMES[weapon.weapon_id]}
                </span>
                {topLegends.length > 0 && (
                  <span className="flex min-w-0 items-center gap-x-1.5 text-xs text-muted-foreground">
                    {topLegends.map((l, idx) => (
                      <Link
                        key={l.id}
                        href={`/otps?legend=${l.slug}`}
                        className="flex min-w-0 items-center gap-1 rounded transition-colors hover:text-foreground"
                      >
                        <LegendChip
                          legendId={l.slug}
                          size="sm"
                          showName={false}
                        />
                        <span className="truncate text-xs">
                          {l.name}
                          {idx < topLegends.length - 1 ? "," : ""}
                        </span>
                      </Link>
                    ))}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="font-mono text-sm tabular-nums">
                  {weapon.games.toLocaleString()}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  games
                </span>
              </div>
            </li>
          )
        })}
      </ol>
    </PreviewCard>
  )
}
