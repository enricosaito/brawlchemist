import Link from "next/link"
import { cn } from "@/lib/utils"
import { DataTable, type ColDef } from "@/components/site/data-table"
import { PageHero } from "@/components/site/page-hero"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { LegendChip, PlayerLink } from "@/components/site/primitives"
import { getLegend } from "@/lib/mock-data"
import { slugForLegendId } from "@/lib/legends-roster"
import {
  type AggregationMethod,
  getTopValhallanMainers,
  getValhallanLegendStats,
  type LegendStat,
  type TopMainer,
} from "@/lib/sync/valhallan"

// "ALL" means no region filter (every Valhallan-rated player across the
// competitive regions — see COMPETITIVE_REGIONS in lib/sync/valhallan.ts).
const REGION_OPTIONS = ["ALL", "US-E", "EU", "BRZ"] as const
type RegionOption = (typeof REGION_OPTIONS)[number]

function isRegionOption(v: string | undefined): v is RegionOption {
  return !!v && (REGION_OPTIONS as readonly string[]).includes(v)
}

const METHOD_OPTIONS: { id: AggregationMethod; label: string }[] = [
  { id: "popular", label: "Popular" },
  { id: "avg", label: "Player WR" },
  { id: "pooled", label: "Pooled WR" },
]

function isMethod(v: string | undefined): v is AggregationMethod {
  return v === "pooled" || v === "avg" || v === "popular"
}

function buildColumns(
  method: AggregationMethod,
  mainers: Map<number, TopMainer[]>,
): ColDef<LegendStat>[] {
  const cols: ColDef<LegendStat>[] = [
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
      width: "180px",
      render: (row) => {
        const slug = slugForLegendId(row.legend_id)
        const legend = slug ? getLegend(slug) : null
        return (
          <div className="flex items-center gap-2">
            {slug ? (
              <LegendChip legendId={slug} size="md" showName={false} />
            ) : (
              <span
                className="size-7 shrink-0 rounded-md border border-border/60 bg-muted/30"
                aria-hidden
              />
            )}
            <span className="truncate text-sm font-medium">
              {legend?.name ?? slug ?? `legend #${row.legend_id}`}
            </span>
          </div>
        )
      },
    },
    {
      id: "mainers",
      label: "Top Mainers",
      width: "360px",
      render: (row) => {
        const tops = mainers.get(row.legend_id) ?? []
        if (tops.length === 0) {
          return (
            <span className="text-xs text-muted-foreground/60">—</span>
          )
        }
        return (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs leading-tight">
            {tops.map((m, i) => (
              <span key={i} className="flex items-baseline gap-1">
                <span className="font-mono text-[10px] tabular-nums text-tier-valhallan">
                  [{m.region} #{m.regionRank}]
                </span>
                <PlayerLink
                  id={m.brawlhallaId}
                  className="font-medium text-foreground/90"
                >
                  {m.username}
                </PlayerLink>
              </span>
            ))}
          </div>
        )
      },
    },
    {
      id: "winrate",
      label: "Win Rate",
      align: "right",
      width: "110px",
      render: (row) => (
        <span className="font-mono text-sm font-medium tabular-nums text-positive">
          {row.win_rate.toFixed(2)}%
        </span>
      ),
    },
  ]

  if (method === "pooled" || method === "popular") {
    cols.push({
      id: "record",
      label: "W – L",
      align: "right",
      width: "140px",
      render: (row) => (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          <span className="text-positive">{(row.wins ?? 0).toLocaleString()}</span>
          <span className="px-1 opacity-60">–</span>
          <span className="text-negative">
            {(row.games - (row.wins ?? 0)).toLocaleString()}
          </span>
        </span>
      ),
    })
  } else {
    cols.push({
      id: "players",
      label: "Players",
      align: "right",
      width: "90px",
      render: (row) => (
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {(row.players ?? 0).toLocaleString()}
        </span>
      ),
    })
  }

  cols.push(
    {
      id: "games",
      label: "Games",
      align: "right",
      width: "100px",
      render: (row) => (
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {row.games.toLocaleString()}
        </span>
      ),
    },
    {
      id: "pickrate",
      label: "Pick Rate",
      align: "right",
      width: "100px",
      render: (row) => (
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {row.pick_rate.toFixed(2)}%
        </span>
      ),
    },
  )

  return cols
}

export default async function LegendsPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string; method?: string }>
}) {
  const params = await searchParams
  const region: RegionOption = isRegionOption(params.region)
    ? params.region
    : "ALL"
  const regionFilter = region === "ALL" ? null : region
  const method: AggregationMethod = isMethod(params.method)
    ? params.method
    : "popular"

  // Minimum threshold scales with the population:
  //   - pooled/popular: minimum total games (so a niche legend with 30 total
  //     games doesn't show in the popular leaderboard).
  //   - avg: minimum games per player to qualify as a data point.
  const minGames =
    method === "avg"
      ? regionFilter
        ? 20
        : 30
      : regionFilter
        ? 20
        : 100

  const [{ legends, sampleSize }, mainers] = await Promise.all([
    getValhallanLegendStats({
      region: regionFilter,
      method,
      minGames,
    }),
    getTopValhallanMainers({ region: regionFilter, perLegend: 3 }),
  ])

  const columns = buildColumns(method, mainers)
  const methodCopy = (() => {
    if (method === "popular") {
      return "Sorted by total games across the Valhallan pool — the legends actually getting played at the top of the ladder. WR shown for context but ordering ignores it."
    }
    if (method === "avg") {
      return `Each Valhallan player contributes one data point per legend (≥ ${minGames} games on that legend to qualify), then averaged. Less influenced by high-volume mains.`
    }
    return "All Valhallan games and wins are summed and divided. Reflects total observed outcomes; high-volume players have proportional weight."
  })()

  return (
    <div className="min-h-svh">
      <SiteHeader />
      <main className="pb-16">
        <PageHero
          title="Legends"
          subtitle={`Per-legend stats across elite Valhallan players (rating ≥ 2400). ${methodCopy}`}
          meta={
            <span className="rounded border border-tier-valhallan/40 bg-tier-valhallan/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-tier-valhallan">
              {sampleSize} players sampled
            </span>
          }
        />
        <div className="px-4 sm:px-6">
          <div className="mx-auto mb-3 flex max-w-[1280px] flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Region
              </span>
              <div className="flex flex-wrap items-center gap-1 rounded-md border border-border/60 bg-muted/40 p-0.5">
                {REGION_OPTIONS.map((r) => (
                  <Link
                    key={r}
                    href={`/legends?region=${r}&method=${method}`}
                    aria-current={region === r ? "true" : undefined}
                    className={cn(
                      "rounded-[5px] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
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

            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Method
              </span>
              <div className="flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 p-0.5">
                {METHOD_OPTIONS.map((m) => (
                  <Link
                    key={m.id}
                    href={`/legends?region=${region}&method=${m.id}`}
                    aria-current={method === m.id ? "true" : undefined}
                    className={cn(
                      "rounded-[5px] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
                      method === m.id
                        ? "bg-card text-foreground shadow-[0_0_0_1px_oklch(1_0_0_/_0.06)]"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {m.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {legends.length === 0 ? (
            <div className="mx-auto max-w-[1280px] rounded-xl border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
              No legends meet the sample threshold for {region} · {method}. The
              cron is still seeding — check back in a few hours.
            </div>
          ) : (
            <DataTable
              columns={columns}
              rows={legends}
              rowKey={(l) => String(l.legend_id)}
            />
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
