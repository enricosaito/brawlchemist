import { notFound } from "next/navigation"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { DataTable } from "@/components/site/data-table"
import { buildLeaderboardColumns } from "@/components/site/leaderboard-columns"
import { LeaderboardPodium } from "@/components/site/leaderboard-podium"
import { LeaderboardSearch } from "@/components/site/leaderboard-search"
import { PageHero } from "@/components/site/page-hero"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import {
  API_REGIONS,
  type ApiGameMode,
  type ApiRegion,
  getRankedLeaderboard,
  isApiRegion,
} from "@/lib/brawlhalla-api"
import { getPlayersByIds } from "@/lib/sync/players"
import { getValhallanCutoffs } from "@/lib/sync/valhallan-cutoff"
import { getOverridesMap } from "@/lib/sync/player-overrides"
import type { PlayerRow } from "@/lib/db/schema"

const CUTOFF_REGIONS: ApiRegion[] = ["US-E", "EU", "BRZ"]

const QUEUES: { id: ApiGameMode; label: string }[] = [
  { id: "1v1", label: "1v1" },
  { id: "2v2", label: "2v2" },
]

const PAGE_SIZE = 50

/** Valid path modes. "pro" is a separate static route, not handled here. */
function parseMode(mode: string): ApiGameMode | null {
  return mode === "1v1" || mode === "2v2" ? mode : null
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ mode: string }>
}): Promise<Metadata> {
  const { mode } = await params
  const is2v2 = mode === "2v2"
  const title = is2v2 ? "2v2 Teams" : "1v1 Ranking"
  return {
    title: `${title} · Brawlchemist`,
    description: is2v2
      ? "Top Brawlhalla 2v2 teams, ranked live per region."
      : "Top Brawlhalla 1v1 players, ranked live per region.",
  }
}

export default async function LeaderboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ mode: string }>
  searchParams: Promise<{ region?: string; page?: string }>
}) {
  const { mode } = await params
  const gameMode = parseMode(mode)
  if (!gameMode) notFound()

  const sp = await searchParams
  const region: ApiRegion =
    sp.region && isApiRegion(sp.region) ? sp.region : "BRZ"
  const requestedPage = Math.max(1, Number(sp.page ?? "1") || 1)
  const modePath = `/leaderboards/${gameMode}`
  const baseQuery = `region=${region}`

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
  const page = Math.min(requestedPage, totalPages)

  const rows = result.ok ? result.data.rankings : []

  // Cached player rows for legend enrichment. Fail open if the DB is down.
  let playersMap = new Map<number, PlayerRow>()
  if (rows.length > 0) {
    const ids = rows.flatMap((r) => r.players.map((p) => p.id))
    try {
      playersMap = await getPlayersByIds(ids)
    } catch (err) {
      console.error("[leaderboards] player cache lookup failed:", err)
    }
  }

  const selectedCutoff =
    region !== "ALL" ? cutoffs.get(region)?.rating ?? null : null

  // Admin-curated previews (PRO badge/handle, favorite skin) for the podium
  // and the table's pro name-swap.
  const overrides = await getOverridesMap()
  const columns = buildLeaderboardColumns(
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
          title={gameMode === "2v2" ? "2v2 Teams" : "1v1 Ranking"}
          subtitle="Top-ranked players, pulled live from the Brawlhalla v1 API."
        />
        <div className="px-4 sm:px-6">
          {/* Search · Mode · Region on one line; Valhallan cutoff pushed right. */}
          <div className="mx-auto mb-4 flex max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-3">
            <LeaderboardSearch className="w-full sm:w-auto sm:min-w-[220px]" />

            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Mode
              </span>
              <div
                role="tablist"
                aria-label="Queue"
                className="flex items-center rounded-md border border-border/60 bg-muted/40 p-1"
              >
                {QUEUES.map((q) => (
                  <Link
                    key={q.id}
                    role="tab"
                    aria-selected={gameMode === q.id}
                    href={`/leaderboards/${q.id}?region=${region}`}
                    className={cn(
                      "rounded-md px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors",
                      gameMode === q.id
                        ? "bg-card text-foreground shadow-[0_0_0_1px_oklch(1_0_0_/_0.06)]"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {q.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Region
              </span>
              <div className="flex flex-wrap items-center gap-1 rounded-md border border-border/60 bg-muted/40 p-1">
                {API_REGIONS.map((r) => (
                  <Link
                    key={r}
                    href={`${modePath}?region=${r}`}
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

            {cutoffs.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
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
                searchValue={(r) => r.players.map((p) => p.username).join(" ")}
              />
              <p
                id="leaderboard-no-match"
                hidden
                className="mt-3 text-sm text-muted-foreground"
              >
                No players match your search.
              </p>
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
                        href={`${modePath}?${baseQuery}&page=${page - 1}`}
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
                        href={`${modePath}?${baseQuery}&page=${page + 1}`}
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
