import { LegendChip, WeaponIcon } from "@/components/site/primitives"
import { DataTable, type ColDef } from "@/components/site/data-table"
import { PageHero } from "@/components/site/page-hero"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { CURRENT_PATCH, WEAPON_NAMES } from "@/lib/mock-data"
import { slugForLegendId } from "@/lib/legends-roster"
import { getValhallanWeaponStats, type WeaponStat } from "@/lib/sync/valhallan"

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
    render: (w) => (
      <span className="text-sm font-medium">{WEAPON_NAMES[w.weapon_id]}</span>
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
    id: "topLegend",
    label: "Top Legend",
    render: (w) => {
      const slug = w.top_legend_id ? slugForLegendId(w.top_legend_id) : null
      return slug ? <LegendChip legendId={slug} size="md" /> : null
    },
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
    id: "pickRate",
    label: "Pick Rate",
    align: "right",
    width: "100px",
    render: (w) => (
      <span className="font-mono text-sm tabular-nums text-muted-foreground">
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
]

export default async function WeaponsPage() {
  const { weapons, sampleSize } = await getValhallanWeaponStats()

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
          <DataTable columns={columns} rows={weapons} rowKey={(w) => w.weapon_id} />
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
