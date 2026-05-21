import Link from "next/link"
import { cn } from "@/lib/utils"
import {
  Delta,
  LegendChip,
  RankIcon,
  RegionPill,
  TIER_TEXT_COLOR,
} from "@/components/site/primitives"
import { DataTable, type ColDef } from "@/components/site/data-table"
import { PageHero } from "@/components/site/page-hero"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { formatElo, formatPercent } from "@/lib/format"
import {
  CURRENT_PATCH,
  TOP_PLAYERS_1V1,
  TOP_PLAYERS_2V2,
} from "@/lib/mock-data"
import type { Player, Queue } from "@/lib/types"

const columns: ColDef<Player>[] = [
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
    id: "rank-icon",
    label: "Rank",
    width: "72px",
    align: "center",
    render: (p) => <RankIcon tier={p.rank.tier} size={32} className="mx-auto" />,
  },
  {
    id: "player",
    label: "Player",
    render: (p) => (
      <div className="flex items-center gap-2">
        <LegendChip legendId={p.avatarLegendId} size="md" showName={false} />
        <span className="truncate text-sm font-medium">{p.name}</span>
      </div>
    ),
  },
  {
    id: "region",
    label: "Region",
    width: "84px",
    render: (p) => <RegionPill region={p.region} />,
  },
  {
    id: "tier",
    label: "Tier",
    width: "110px",
    render: (p) => (
      <span
        className={cn(
          "font-mono text-[11px] font-medium uppercase tracking-wider",
          TIER_TEXT_COLOR[p.rank.tier],
        )}
      >
        {p.rank.tier}
      </span>
    ),
  },
  {
    id: "elo",
    label: "ELO",
    align: "right",
    width: "100px",
    render: (p) => (
      <span className="font-mono text-sm tabular-nums">
        {formatElo(p.rank.elo)}
      </span>
    ),
  },
  {
    id: "winrate",
    label: "Win Rate",
    align: "right",
    width: "100px",
    render: (p) => (
      <span className="font-mono text-sm tabular-nums text-muted-foreground">
        {formatPercent(p.stats.winRate)}
      </span>
    ),
  },
  {
    id: "delta",
    label: "Δ 24h",
    align: "right",
    width: "90px",
    render: (p) => <Delta value={p.rank.delta24h} />,
  },
]

const QUEUES: { id: Queue; label: string }[] = [
  { id: "1v1", label: "1v1" },
  { id: "2v2", label: "2v2" },
]

export default async function LeaderboardsPage({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string }>
}) {
  const params = await searchParams
  const queue: Queue = params.queue === "2v2" ? "2v2" : "1v1"
  const rows = queue === "1v1" ? TOP_PLAYERS_1V1 : TOP_PLAYERS_2V2

  return (
    <div className="min-h-svh">
      <SiteHeader />
      <main className="pb-16">
        <PageHero
          title="Leaderboards"
          subtitle="Top-ranked players in 1v1 and 2v2. Mock data — Brawlhalla API integration coming soon."
          meta={
            <>
              <span className="rounded border border-copper/40 bg-copper/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-copper">
                Patch {CURRENT_PATCH}
              </span>
              <div
                role="tablist"
                aria-label="Queue"
                className="flex items-center rounded-md border border-border/60 bg-muted/40 p-0.5"
              >
                {QUEUES.map((q) => (
                  <Link
                    key={q.id}
                    role="tab"
                    aria-selected={queue === q.id}
                    href={`/leaderboards?queue=${q.id}`}
                    className={cn(
                      "rounded-[5px] px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
                      queue === q.id
                        ? "bg-card text-foreground shadow-[0_0_0_1px_oklch(1_0_0_/_0.06)]"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {q.label}
                  </Link>
                ))}
              </div>
            </>
          }
        />
        <div className="px-4 sm:px-6">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(p) => p.id}
          />
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
