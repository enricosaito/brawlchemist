import Link from "next/link"
import { cn } from "@/lib/utils"
import {
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
import { CURRENT_PATCH } from "@/lib/mock-data"
import { slugForLegendId } from "@/lib/legends-roster"
import type { Tier } from "@/lib/types"
import {
  API_REGIONS,
  type ApiGameMode,
  type ApiRegion,
  getRankedLeaderboard,
  isApiRegion,
  type RankedEntry,
} from "@/lib/brawlhalla-api"
import { getPlayersByIds } from "@/lib/sync/players"
import type { PlayerRow } from "@/lib/db/schema"

const QUEUES: { id: ApiGameMode; label: string }[] = [
  { id: "1v1", label: "1v1" },
  { id: "2v2", label: "2v2" },
]

const KNOWN_TIERS: readonly Tier[] = [
  "Tin",
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Diamond",
  "Valhallan",
]

function toTier(value: string | null): Tier | null {
  if (!value) return null
  return (KNOWN_TIERS as readonly string[]).includes(value)
    ? (value as Tier)
    : null
}

function formatWinRate(wins: number | null, losses: number | null): string {
  if (wins == null || losses == null) return "—"
  const total = wins + losses
  if (total === 0) return "—"
  return formatPercent((wins / total) * 100)
}

function formatNullableElo(value: number | null): string {
  return value == null ? "—" : formatElo(value)
}

function buildColumns(
  playersMap: Map<number, PlayerRow>,
): ColDef<RankedEntry>[] {
  return [
    {
      id: "rank",
      label: "#",
      width: "56px",
      align: "right",
      render: (r) => (
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {r.rank}
        </span>
      ),
    },
    {
      id: "rank-icon",
      label: "Rank",
      width: "72px",
      align: "center",
      render: (r) => {
        const tier = toTier(r.tier)
        return tier ? (
          <RankIcon tier={tier} size={32} className="mx-auto" />
        ) : null
      },
    },
    {
      id: "mains",
      label: "Mains",
      width: "92px",
      render: (r) => (
        <div className="flex flex-col gap-1">
          {r.players.map((p) => {
            const row = playersMap.get(p.id)
            const ids = row?.mainLegendIds ?? []
            if (ids.length === 0) {
              return (
                <span
                  key={p.id}
                  className="font-mono text-[10px] text-muted-foreground/60"
                >
                  —
                </span>
              )
            }
            return (
              <div key={p.id} className="flex items-center gap-1">
                {ids.slice(0, 3).map((lid) => {
                  const slug = slugForLegendId(lid)
                  if (!slug) return null
                  return (
                    <LegendChip
                      key={lid}
                      legendId={slug}
                      size="sm"
                      showName={false}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>
      ),
    },
    {
      id: "player",
      label: "Player",
      render: (r) => (
        <div className="flex min-w-0 flex-col gap-1">
          {r.players.length > 0 ? (
            r.players.map((p) => (
              <span
                key={p.id}
                className="truncate text-sm font-medium leading-5"
              >
                {p.username}
              </span>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </div>
      ),
    },
    {
      id: "region",
      label: "Region",
      width: "84px",
      render: (r) =>
        r.region ? (
          <RegionPill region={r.region} />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "tier",
      label: "Tier",
      width: "110px",
      render: (r) => {
        const tier = toTier(r.tier)
        return (
          <span
            className={cn(
              "font-mono text-[11px] font-medium uppercase tracking-wider",
              tier ? TIER_TEXT_COLOR[tier] : "text-muted-foreground",
            )}
          >
            {r.tier ?? "—"}
          </span>
        )
      },
    },
    {
      id: "rating",
      label: "Rating",
      align: "right",
      width: "100px",
      render: (r) => (
        <span className="font-mono text-sm tabular-nums">
          {formatNullableElo(r.rating)}
        </span>
      ),
    },
    {
      id: "peak",
      label: "Peak",
      align: "right",
      width: "100px",
      render: (r) => (
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {formatNullableElo(r.best_rating)}
        </span>
      ),
    },
    {
      id: "record",
      label: "W – L",
      align: "right",
      width: "110px",
      render: (r) => (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          <span className="text-positive">{r.wins ?? "—"}</span>
          <span className="px-1 opacity-60">–</span>
          <span className="text-negative">{r.losses ?? "—"}</span>
        </span>
      ),
    },
    {
      id: "winrate",
      label: "Win Rate",
      align: "right",
      width: "100px",
      render: (r) => (
        <span className="font-mono text-sm tabular-nums">
          {formatWinRate(r.wins, r.losses)}
        </span>
      ),
    },
  ]
}

export default async function LeaderboardsPage({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string; region?: string }>
}) {
  const params = await searchParams
  const gameMode: ApiGameMode = params.queue === "2v2" ? "2v2" : "1v1"
  const region: ApiRegion =
    params.region && isApiRegion(params.region) ? params.region : "BRZ"

  const result = await getRankedLeaderboard({
    gameMode,
    region,
    page: 1,
    maxResults: 30,
  })

  const rows = result.ok ? result.data.rankings : []

  // Fetch any cached player rows for legend enrichment. If the DB isn't
  // configured yet, fail open — the leaderboard renders without main legends.
  let playersMap = new Map<number, PlayerRow>()
  if (rows.length > 0) {
    const ids = rows.flatMap((r) => r.players.map((p) => p.id))
    try {
      playersMap = await getPlayersByIds(ids)
    } catch (err) {
      console.error("[leaderboards] player cache lookup failed:", err)
    }
  }

  const columns = buildColumns(playersMap)

  return (
    <div className="min-h-svh">
      <SiteHeader />
      <main className="pb-16">
        <PageHero
          title="Leaderboards"
          subtitle="Top-ranked players, pulled live from the Brawlhalla v1 API. Main legends update every ~24h."
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
                    aria-selected={gameMode === q.id}
                    href={`/leaderboards?queue=${q.id}&region=${region}`}
                    className={cn(
                      "rounded-[5px] px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
                      gameMode === q.id
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
          <div className="mx-auto mb-3 flex max-w-[1280px] flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Region
            </span>
            <div className="flex flex-wrap items-center gap-1 rounded-md border border-border/60 bg-muted/40 p-0.5">
              {API_REGIONS.map((r) => (
                <Link
                  key={r}
                  href={`/leaderboards?queue=${gameMode}&region=${r}`}
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

          {!result.ok ? (
            <div className="mx-auto max-w-[1280px] rounded-xl border border-negative/30 bg-negative/5 p-6 text-sm text-muted-foreground">
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-negative">
                Leaderboard unavailable
              </div>
              <p>{result.error}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="mx-auto max-w-[1280px] rounded-xl border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
              No rankings returned for {gameMode} · {region}.
            </div>
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r) => `${r.rank}-${r.players[0]?.id ?? "x"}`}
            />
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
