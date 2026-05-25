import Image from "next/image"
import Link from "next/link"
import { cn } from "@/lib/utils"
import {
  LegendChip,
  PlayerLink,
  RankIcon,
  RegionPill,
  TIER_TEXT_COLOR,
} from "@/components/site/primitives"
import { DataTable, type ColDef } from "@/components/site/data-table"
import { LeaderboardPodium } from "@/components/site/leaderboard-podium"
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
  type PlayerRanked,
  type PlayerRankedLegend,
  type RankedEntry,
} from "@/lib/brawlhalla-api"
import { getPlayersByIds } from "@/lib/sync/players"
import { getValhallanCutoffs } from "@/lib/sync/valhallan-cutoff"
import { getOverridesMap } from "@/lib/sync/player-overrides"
import { isFallenValhallan } from "@/lib/tier"
import { FallenEmblem } from "@/components/site/fallen-valhallan"
import { PlayerName } from "@/components/site/pro-badge"
import type { PlayerPreview } from "@/lib/player-previews"
import type { PlayerRow } from "@/lib/db/schema"

const TOP_LEGENDS_LIMIT = 5

/**
 * Pull up to N most-played legends from a player's cached rankedJson.
 * Returns slugs (in games-desc order), filtering out anything we can't map
 * back to a roster entry.
 */
function topLegendSlugsFor(player: PlayerRow | undefined): string[] {
  if (!player?.rankedJson) return []
  const ranked = player.rankedJson as PlayerRanked
  const legends: PlayerRankedLegend[] = Array.isArray(ranked.legends)
    ? ranked.legends
    : []
  return legends
    .filter((l) => typeof l.games === "number" && l.games > 0)
    .sort((a, b) => b.games - a.games)
    .slice(0, TOP_LEGENDS_LIMIT)
    .map((l) => slugForLegendId(l.legend_id))
    .filter((s): s is string => !!s)
}

const CUTOFF_REGIONS: ApiRegion[] = ["US-E", "EU", "BRZ"]

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
  // The leaderboard endpoint returns tier with a division suffix ("Gold 3",
  // "Platinum 1") — strip it down to the base tier for icon/color lookup.
  const base = value.split(" ")[0]
  return (KNOWN_TIERS as readonly string[]).includes(base)
    ? (base as Tier)
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
  gameMode: ApiGameMode,
  region: ApiRegion,
  valhallanCutoff: number | null,
  previews: Map<number, PlayerPreview>,
): ColDef<RankedEntry>[] {
  const regionColumn: ColDef<RankedEntry> = {
    id: "region",
    label: "Region",
    width: "84px",
    render: (r) =>
      r.region ? (
        <RegionPill region={r.region} />
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  }
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
        if (
          isFallenValhallan(
            r.tier,
            r.rating,
            r.best_rating,
            valhallanCutoff,
            r.wins,
          )
        ) {
          return <FallenEmblem size={32} className="mx-auto" />
        }
        const tier = toTier(r.tier)
        return tier ? (
          <RankIcon tier={tier} size={32} className="mx-auto" />
        ) : null
      },
    },
    {
      id: "main-legend",
      label: "Main",
      width: "56px",
      align: "center",
      render: (r) => (
        <div className="flex flex-col items-center gap-1">
          {r.players.map((p) => {
            const lid = playersMap.get(p.id)?.topLegendId
            const slug = lid ? slugForLegendId(lid) : null
            if (!slug) {
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
              <LegendChip
                key={p.id}
                legendId={slug}
                size="md"
                showName={false}
              />
            )
          })}
        </div>
      ),
    },
    {
      id: "player",
      label: "Player",
      render: (r) => {
        const tier = toTier(r.tier)
        // Pro rows hide the tier and show the PRO handle by default; hovering
        // swaps to the in-game username and reveals the tier (one group/pro).
        const rowPro = r.players.some((p) => !!previews.get(p.id)?.verified)
        return (
          <div
            className={cn("flex min-w-0 flex-col gap-0.5", rowPro && "group/pro")}
          >
            {r.players.length > 0 ? (
              r.players.map((p) => {
                const handle = previews.get(p.id)?.verified?.handle
                return (
                  <PlayerLink
                    key={p.id}
                    id={p.id}
                    className="text-sm font-medium leading-5"
                  >
                    {handle ? (
                      <PlayerName
                        username={p.username}
                        handle={handle}
                        tier={r.tier}
                        tierClassName={tier ? TIER_TEXT_COLOR[tier] : undefined}
                      />
                    ) : (
                      <span className="truncate">{p.username}</span>
                    )}
                  </PlayerLink>
                )
              })
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
            {/* Pro rows show the tier inline next to the name on hover instead. */}
            {tier && !rowPro && (
              <span
                className={cn(
                  "mt-0.5 font-mono text-[10px] font-medium uppercase tracking-wider",
                  TIER_TEXT_COLOR[tier],
                )}
              >
                {r.tier}
              </span>
            )}
          </div>
        )
      },
    },
    // Hide the region column when the user has already narrowed to one
    // region — every row in the result set would be identical anyway.
    ...(region === "ALL" ? [regionColumn] : []),
    {
      id: "rating",
      label: "Rating",
      align: "right",
      width: "120px",
      render: (r) => (
        <span className="font-mono text-sm tabular-nums">
          {formatNullableElo(r.rating)}
          {r.rating != null && (
            <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              ELO
            </span>
          )}
        </span>
      ),
    },
    // 1v1: show up to 5 most-played legends pulled from cached ranked_json.
    // 2v2: fall back to the textual tier column — best-legends would be
    // ambiguous across the team's two players.
    gameMode === "1v1"
      ? {
          id: "best-legends",
          label: "Best Legends",
          width: "200px",
          render: (r) => {
            const player = r.players[0]
            const slugs = player
              ? topLegendSlugsFor(playersMap.get(player.id))
              : []
            if (slugs.length === 0) {
              return (
                <span className="font-mono text-[10px] text-muted-foreground/60">
                  —
                </span>
              )
            }
            return (
              <div className="flex items-center gap-1.5">
                {slugs.map((slug) => (
                  <LegendChip
                    key={slug}
                    legendId={slug}
                    size="md"
                    showName={false}
                  />
                ))}
              </div>
            )
          },
        }
      : {
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

const PAGE_SIZE = 50

export default async function LeaderboardsPage({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string; region?: string; page?: string }>
}) {
  const params = await searchParams
  const gameMode: ApiGameMode = params.queue === "2v2" ? "2v2" : "1v1"
  const region: ApiRegion =
    params.region && isApiRegion(params.region) ? params.region : "BRZ"
  const requestedPage = Math.max(1, Number(params.page ?? "1") || 1)

  // When narrowed to a single region, the cutoff strip collapses to just that
  // region; "ALL" keeps the multi-region reference breakdown.
  const cutoffRegions: ApiRegion[] =
    region === "ALL" ? CUTOFF_REGIONS : [region]

  const [result, cutoffs] = await Promise.all([
    getRankedLeaderboard({
      gameMode,
      region,
      page: requestedPage,
      maxResults: PAGE_SIZE,
    }),
    getValhallanCutoffs(gameMode, cutoffRegions),
  ])
  const totalPages = result.ok ? Math.max(1, result.data.total_pages) : 1
  // Clamp current page in case the user requested past the end.
  const page = Math.min(requestedPage, totalPages)
  const baseQuery = `queue=${gameMode}&region=${region}`

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

  // Only meaningful when filtered to one region — "ALL" mixes regions, each
  // with its own cutoff, so we can't mark fallen players there.
  const selectedCutoff =
    region !== "ALL" ? cutoffs.get(region)?.rating ?? null : null

  // Admin-curated previews (PRO badge/handle, favorite skin) for the podium
  // and the table's pro name-swap.
  const overrides = await getOverridesMap()
  const columns = buildColumns(
    playersMap,
    gameMode,
    region,
    selectedCutoff,
    overrides,
  )

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
                    href={`/leaderboards?queue=${q.id}&region=${region}&page=1`}
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
                  href={`/leaderboards?queue=${gameMode}&region=${r}&page=1`}
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

          {cutoffs.size > 0 && (
            <div className="mx-auto mb-3 flex max-w-[1280px] flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Valhallan cutoff
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {cutoffRegions.map((r) => {
                  const c = cutoffs.get(r)
                  if (!c) return null
                  return (
                    <span
                      key={r}
                      className="inline-flex items-center gap-1.5 rounded border border-border/60 bg-card/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-foreground"
                      title={`#${c.rank} ${c.username} — ${c.count} Valhallans total`}
                    >
                      <Image
                        src="/assets/valhallan-helm.png"
                        alt=""
                        width={16}
                        height={16}
                        className="shrink-0 select-none object-contain"
                      />
                      <span className="text-muted-foreground">{r}</span>
                      <span className="tabular-nums">
                        {c.rating.toLocaleString()}
                      </span>
                    </span>
                  )
                })}
              </div>
            </div>
          )}

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
            <div className="mx-auto max-w-[1280px]">
              {page === 1 && (
                <LeaderboardPodium
                  entries={rows}
                  playersMap={playersMap}
                  gameMode={gameMode}
                  previews={overrides}
                />
              )}
              <DataTable
                columns={columns}
                rows={page === 1 ? rows.slice(3) : rows}
                rowKey={(r) => `${r.rank}-${r.players[0]?.id ?? "x"}`}
              />
              {totalPages > 1 && (
                <nav
                  aria-label="Leaderboard pagination"
                  className="mt-4 flex flex-wrap items-center justify-between gap-3"
                >
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Page {page} of {totalPages.toLocaleString()}
                  </span>
                  <div className="flex items-center gap-2">
                    {page > 1 ? (
                      <Link
                        href={`/leaderboards?${baseQuery}&page=${page - 1}`}
                        className="rounded-md border border-border/60 bg-card/60 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-foreground transition-colors hover:bg-muted"
                      >
                        ← Prev
                      </Link>
                    ) : (
                      <span className="rounded-md border border-border/30 bg-card/30 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">
                        ← Prev
                      </span>
                    )}
                    {page < totalPages ? (
                      <Link
                        href={`/leaderboards?${baseQuery}&page=${page + 1}`}
                        className="rounded-md border border-border/60 bg-card/60 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-foreground transition-colors hover:bg-muted"
                      >
                        Next →
                      </Link>
                    ) : (
                      <span className="rounded-md border border-border/30 bg-card/30 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">
                        Next →
                      </span>
                    )}
                  </div>
                </nav>
              )}
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
