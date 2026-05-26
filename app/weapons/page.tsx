import Link from "next/link"
import { cn } from "@/lib/utils"
import { LegendChip, WeaponIcon } from "@/components/site/primitives"
import {
  PopularityLabel,
  type PopularityTier,
} from "@/components/site/popularity-label"
import { DataTable, type ColDef } from "@/components/site/data-table"
import { PageHero } from "@/components/site/page-hero"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { CURRENT_PATCH, WEAPON_NAMES } from "@/lib/mock-data"
import { rosterEntryByLegendId, slugForLegendId } from "@/lib/legends-roster"
import { API_REGIONS, isApiRegion, type ApiRegion } from "@/lib/brawlhalla-api"
import { getValhallanWeaponStats, type WeaponStat } from "@/lib/sync/valhallan"

const REGION_OPTIONS = API_REGIONS

/**
 * Popularity band for a weapon. Only ~14 weapons split the pool, so the bands
 * are deliberately forgiving and top out at "Very Popular": ≥10% → Very
 * Popular, 2–10% → Popular, <2% → Unpopular.
 */
function weaponPopularityTier(pickRate: number): PopularityTier {
  if (pickRate >= 10) return "very-popular"
  if (pickRate >= 2) return "popular"
  return "unpopular"
}

const columns: ColDef<WeaponStat>[] = [
  {
    id: "rank",
    label: "#",
    width: "56px",
    align: "right",
    render: (_, i) => (
      <span className="font-mono text-xs text-muted-foreground tabular-nums">
        {i + 1}
      </span>
    ),
  },
  {
    id: "icon",
    label: "",
    width: "52px",
    align: "center",
    render: (w) => (
      <WeaponIcon weaponId={w.weapon_id} size={32} className="mx-auto" />
    ),
  },
  {
    id: "weapon",
    label: "Weapon",
    width: "200px",
    render: (w) => (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium leading-tight">
          {WEAPON_NAMES[w.weapon_id]}
        </span>
        <PopularityLabel tier={weaponPopularityTier(w.pick_rate)} />
      </div>
    ),
  },
  {
    id: "pickRate",
    label: "Pick Rate",
    align: "right",
    width: "100px",
    render: (w) => (
      <span className="font-mono text-sm font-medium tabular-nums text-copper">
        {w.pick_rate.toFixed(2)}%
      </span>
    ),
  },
  {
    id: "winRate",
    label: "Win Rate",
    align: "right",
    width: "100px",
    render: (w) => (
      <span className="font-mono text-sm font-medium tabular-nums text-positive">
        {w.win_rate.toFixed(2)}%
      </span>
    ),
  },
  {
    id: "games",
    label: "Games",
    align: "right",
    width: "100px",
    render: (w) => (
      <span className="font-mono text-sm tabular-nums text-muted-foreground">
        {w.games.toLocaleString()}
      </span>
    ),
  },
  {
    id: "legends",
    label: "Legends",
    align: "right",
    width: "80px",
    render: (w) => (
      <span className="font-mono text-sm tabular-nums text-muted-foreground">
        {w.legend_count}
      </span>
    ),
  },
  {
    id: "topLegends",
    label: "Top Legends",
    render: (w) => {
      if (w.top_legend_ids.length === 0) return null
      return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {w.top_legend_ids.map((id) => {
            const slug = slugForLegendId(id)
            const name = rosterEntryByLegendId(id)?.name
            if (!slug || !name) return null
            return (
              <span key={id} className="flex items-center gap-1.5">
                <LegendChip legendId={slug} size="sm" showName={false} />
                <span className="text-sm font-medium">{name}</span>
              </span>
            )
          })}
        </div>
      )
    },
  },
]

export default async function WeaponsPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string }>
}) {
  const params = await searchParams
  const region: ApiRegion =
    params.region && isApiRegion(params.region) ? params.region : "ALL"
  const regionFilter = region === "ALL" ? null : region

  const { weapons, sampleSize } = await getValhallanWeaponStats({
    region: regionFilter,
  })

  return (
    <div className="min-h-svh">
      <SiteHeader />
      <main className="pb-16">
        <PageHero
          title="Weapons"
          subtitle="All weapons in the roster, ranked by games played in the elite Valhallan pool. Stats aggregate from every legend that wields the weapon — full attribution, so pick rates sum to 200% (each game counts twice)."
          meta={
            <>
              <span className="rounded border border-tier-valhallan/40 bg-tier-valhallan/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-tier-valhallan">
                {sampleSize} players
              </span>
              <span className="rounded border border-copper/40 bg-copper/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-copper">
                Patch {CURRENT_PATCH}
              </span>
            </>
          }
        />
        <div className="px-4 sm:px-6">
          <div className="mx-auto mb-4 flex max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Region
              </span>
              <div className="flex flex-wrap items-center gap-1 rounded-md border border-border/60 bg-muted/40 p-1">
                {REGION_OPTIONS.map((r) => (
                  <Link
                    key={r}
                    href={`/weapons?region=${r}`}
                    aria-current={region === r ? "true" : undefined}
                    className={cn(
                      "rounded-md px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors",
                      region === r
                        ? "bg-card text-foreground shadow-[0_0_0_1px_oklch(1_0_0_/_0.06)]"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {r}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {weapons.length === 0 ? (
            <div className="mx-auto max-w-[1280px] rounded-xl border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
              No weapon data for {region} yet. The Valhallan pool only seeds the
              competitive regions (US-E, EU, BRZ) — try ALL, or one of those.
            </div>
          ) : (
            <DataTable
              columns={columns}
              rows={weapons}
              rowKey={(w) => w.weapon_id}
            />
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
