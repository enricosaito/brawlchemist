import { Delta, LegendChip } from "@/components/site/primitives"
import { DataTable, type ColDef } from "@/components/site/data-table"
import { PageHero } from "@/components/site/page-hero"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { formatPercent } from "@/lib/format"
import { CURRENT_PATCH, WEAPONS, getLegend } from "@/lib/mock-data"
import type { Weapon } from "@/lib/types"

const columns: ColDef<Weapon>[] = [
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
    id: "weapon",
    label: "Weapon",
    render: (w) => <span className="text-sm font-medium">{w.name}</span>,
  },
  {
    id: "bestOn",
    label: "Best on",
    render: (w) => {
      const legend = getLegend(w.topLegendId)
      return legend ? <LegendChip legendId={legend.id} size="md" /> : null
    },
  },
  {
    id: "pickRate",
    label: "Pick Rate",
    align: "right",
    width: "120px",
    render: (w) => (
      <span className="font-mono tabular-nums">{formatPercent(w.pickRate)}</span>
    ),
  },
  {
    id: "winRate",
    label: "Win Rate",
    align: "right",
    width: "120px",
    render: (w) => (
      <span className="font-mono tabular-nums text-muted-foreground">
        {formatPercent(w.winRate)}
      </span>
    ),
  },
  {
    id: "delta",
    label: "Δ WR",
    align: "right",
    width: "90px",
    render: (w) => (
      <Delta value={Number(w.deltaWR.toFixed(1))} suffix="%" />
    ),
  },
]

export default function WeaponsPage() {
  const sorted = [...WEAPONS].sort((a, b) => b.pickRate - a.pickRate)

  return (
    <div className="min-h-svh">
      <SiteHeader />
      <main className="pb-16">
        <PageHero
          title="Weapons"
          subtitle="All 14 weapons in Brawlhalla, ranked by pick rate. Mock data — Brawlhalla API integration coming soon."
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
            rowKey={(w) => w.id}
          />
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
