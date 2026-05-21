import { Delta, LegendChip, TierLetter } from "@/components/site/primitives"
import { DataTable, type ColDef } from "@/components/site/data-table"
import { PageHero } from "@/components/site/page-hero"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { formatPercent } from "@/lib/format"
import { CURRENT_PATCH, LEGENDS, WEAPON_NAMES } from "@/lib/mock-data"
import { LEGEND_TIER_RANK, type Legend } from "@/lib/types"

const columns: ColDef<Legend>[] = [
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
    id: "legend",
    label: "Legend",
    render: (legend) => <LegendChip legendId={legend.id} size="md" />,
  },
  {
    id: "weapons",
    label: "Weapons",
    render: (legend) => (
      <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        {WEAPON_NAMES[legend.weapons[0]]} · {WEAPON_NAMES[legend.weapons[1]]}
      </span>
    ),
  },
  {
    id: "tier",
    label: "Tier",
    align: "center",
    width: "80px",
    render: (legend) => <TierLetter tier={legend.tier} />,
  },
  {
    id: "winRate",
    label: "Win Rate",
    align: "right",
    width: "110px",
    render: (legend) => (
      <span className="font-mono tabular-nums">
        {formatPercent(legend.winRate)}
      </span>
    ),
  },
  {
    id: "pickRate",
    label: "Pick Rate",
    align: "right",
    width: "110px",
    render: (legend) => (
      <span className="font-mono tabular-nums text-muted-foreground">
        {formatPercent(legend.pickRate)}
      </span>
    ),
  },
  {
    id: "delta",
    label: "Δ WR",
    align: "right",
    width: "90px",
    render: (legend) => (
      <Delta value={Number(legend.deltaWR.toFixed(1))} suffix="%" />
    ),
  },
]

export default function TierListPage() {
  const sorted = [...LEGENDS].sort((a, b) => {
    const t = LEGEND_TIER_RANK[a.tier] - LEGEND_TIER_RANK[b.tier]
    if (t !== 0) return t
    return b.winRate - a.winRate
  })

  return (
    <div className="min-h-svh">
      <SiteHeader />
      <main className="pb-16">
        <PageHero
          title="Tier List"
          subtitle={`All ${LEGENDS.length} legends ranked by tier and win rate. Mock data — Brawlhalla API integration coming soon.`}
          meta={
            <>
              <span className="rounded border border-copper/40 bg-copper/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-copper">
                Patch {CURRENT_PATCH}
              </span>
              <span className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                1v1 · last 7d
              </span>
            </>
          }
        />
        <div className="px-4 sm:px-6">
          <DataTable
            columns={columns}
            rows={sorted}
            rowKey={(l) => l.id}
          />
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
