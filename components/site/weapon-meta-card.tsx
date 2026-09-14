import Link from "next/link"
import { CURRENT_PATCH, WEAPON_NAMES } from "@/lib/mock-data"
import { rosterEntryByLegendId, slugForLegendId } from "@/lib/legends-roster"
import { getValhallanWeaponStats } from "@/lib/sync/valhallan"
import { PreviewCard } from "./preview-card"
import { LegendChip, WeaponIcon } from "./primitives"

export async function WeaponMetaCard({
  className,
}: {
  className?: string
} = {}) {
  const { weapons } = await getValhallanWeaponStats()
  // weapons comes pre-sorted by games desc from the aggregation.
  const top = weapons.slice(0, 6)

  return (
    <PreviewCard
      title="Popular weapons"
      href="/weapons"
      viewAllLabel="view weapon meta"
      className={className}
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
      <ol className="grid auto-rows-fr divide-y divide-border/60">
        {top.map((weapon) => {
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
              className="group/row relative flex min-h-14 items-center gap-3 px-4 py-2 transition-colors hover:bg-muted/40"
            >
              {/* Invisible full-row link — see Live Rankings. pointer-events
                  gated so touch keeps the inline legend links. */}
              <Link
                href="/weapons"
                aria-label={`View ${WEAPON_NAMES[weapon.weapon_id]} weapon meta`}
                tabIndex={-1}
                className="pointer-events-none absolute inset-0 z-10 group-hover/row:pointer-events-auto"
              />
              {/* No rank number: the list is already ordered top-down and the
                  games column says by how much, so the index was a third way
                  of stating the same thing. The icon leads instead. */}
              <WeaponIcon weaponId={weapon.weapon_id} size={28} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">
                  {WEAPON_NAMES[weapon.weapon_id]}
                </span>
                {topLegends.length > 0 && (
                  <span className="flex min-w-0 items-center gap-x-1.5 text-xs text-muted-foreground">
                    {topLegends.map((l, idx) => (
                      // Above the full-row link, which otherwise swallows these
                      // on hover — and they go somewhere else entirely.
                      <Link
                        key={l.id}
                        href={`/leaderboards/1v1?legend=${l.slug}`}
                        className="relative z-20 flex min-w-0 items-center gap-1 rounded transition-colors hover:text-foreground"
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
