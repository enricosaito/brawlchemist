import { notFound } from "next/navigation"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { List, Trophy } from "lucide-react"
import { cn } from "@/lib/utils"
import { DataTable } from "@/components/site/data-table"
import { buildLeaderboardColumns } from "@/components/site/leaderboard-columns"
import { LeaderboardPodium } from "@/components/site/leaderboard-podium"
import { LeaderboardSearch } from "@/components/site/leaderboard-search"
import { Pagination } from "@/components/site/pagination"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import {
  API_REGIONS,
  type ApiGameMode,
  type ApiRegion,
  getRankedLeaderboard,
  isApiRegion,
  type RankedEntry,
} from "@/lib/brawlhalla-api"
import { getPlayersByIds } from "@/lib/sync/players"
import { getValhallanCutoffs } from "@/lib/sync/valhallan-cutoff"
import { getProLeaderboard } from "@/lib/sync/pro-leaderboard"
import { getOverridesMap } from "@/lib/sync/player-overrides"
import type { PlayerRow } from "@/lib/db/schema"

const QUEUES: { id: ApiGameMode; label: string }[] = [
  { id: "1v1", label: "1v1" },
  { id: "2v2", label: "2v2" },
  { id: "solo_2v2", label: "Solo 2v2" },
]

const PAGE_SIZE = 50

/** ALL ⟷ PRO switch — shown only on the ALL 1v1 board. Flips to verified
 * pros only. Each click navigates to the opposite state. */
function ProToggle({ pro }: { pro: boolean }) {
  const allHref = "/leaderboards/1v1?region=ALL"
  const proHref = "/leaderboards/1v1?region=ALL&pro=1"
  return (
    <Link
      href={pro ? allHref : proHref}
      aria-label={pro ? "Show all players" : "Show verified pros only"}
      className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-2.5 py-2.5 sm:ml-auto"
    >
      <span
        className={cn(
          "flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider transition-colors",
          pro ? "text-muted-foreground" : "text-foreground",
        )}
      >
        <List className="size-3.5" />
        All
      </span>
      <span
        className={cn(
          "relative inline-flex h-4 w-8 shrink-0 items-center rounded-full transition-colors",
          pro ? "bg-gradient-to-r from-mystic to-tier-s" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute size-3 rounded-full bg-white shadow transition-transform",
            pro ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </span>
      <span
        className={cn(
          "flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider transition-colors",
          pro ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <Trophy className="size-3.5" />
        Pro
      </span>
    </Link>
  )
}

/** Valid path modes. "pro" is a separate static route, not handled here. */
function parseMode(mode: string): ApiGameMode | null {
  return mode === "1v1" || mode === "2v2" || mode === "solo_2v2" ? mode : null
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ mode: string }>
}): Promise<Metadata> {
  const { mode } = await params
  const meta =
    mode === "2v2"
      ? {
          title: "2v2 Teams",
          description: "Top Brawlhalla 2v2 teams, ranked live per region.",
        }
      : mode === "solo_2v2"
        ? {
            title: "Solo 2v2",
            description:
              "Top Brawlhalla solo-queue 2v2 players, ranked live per region.",
          }
        : {
            title: "1v1 Ranking",
            description: "Top Brawlhalla 1v1 players, ranked live per region.",
          }
  return {
    title: `${meta.title} · Brawlchemist`,
    description: meta.description,
  }
}

export default async function LeaderboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ mode: string }>
  searchParams: Promise<{ region?: string; page?: string; pro?: string }>
}) {
  const { mode } = await params
  const gameMode = parseMode(mode)
  if (!gameMode) notFound()

  const sp = await searchParams
  const region: ApiRegion =
    sp.region && isApiRegion(sp.region) ? sp.region : "ALL"
  const requestedPage = Math.max(1, Number(sp.page ?? "1") || 1)
  const modePath = `/leaderboards/${gameMode}`
  const baseQuery =
    gameMode === "1v1" && region === "ALL" && sp.pro === "1"
      ? `region=${region}&pro=1`
      : `region=${region}`

  // Pro-only view — a toggle available on the ALL 1v1 board.
  const canPro = gameMode === "1v1" && region === "ALL"
  const proView = canPro && sp.pro === "1"

  // The Valhallan cutoff is region-specific, so it only shows for a single
  // region — hidden on the ALL board where it'd be a variable breakdown.
  const cutoffRegions: ApiRegion[] = region === "ALL" ? [] : [region]

  // Admin-curated previews (PRO badge/handle, favorite skin) for the podium
  // and the table's pro name treatment.
  const overrides = await getOverridesMap()

  // Data source: verified pros (toggle on) or the live ladder.
  let rows: RankedEntry[] = []
  let totalPages = 1
  let loadError: string | null = null
  let cutoffs: Awaited<ReturnType<typeof getValhallanCutoffs>> = new Map()

  if (proView) {
    // Pros come back as one fully-ranked list; page it 50 at a time like the
    // live ladder. Each row keeps its global `rank`, so slicing is safe.
    const allPros = await getProLeaderboard("ALL")
    totalPages = Math.max(1, Math.ceil(allPros.length / PAGE_SIZE))
    const proPage = Math.min(requestedPage, totalPages)
    rows = allPros.slice((proPage - 1) * PAGE_SIZE, proPage * PAGE_SIZE)
  } else {
    const [result, cuts] = await Promise.all([
      getRankedLeaderboard({
        gameMode,
        region,
        page: requestedPage,
        maxResults: PAGE_SIZE,
      }),
      getValhallanCutoffs(gameMode, cutoffRegions),
    ])
    cutoffs = cuts
    if (result.ok) {
      rows = result.data.rankings
      totalPages = Math.max(1, result.data.total_pages)
    } else {
      loadError = result.error
    }
  }
  const page = Math.min(requestedPage, totalPages)

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

  // Pro rows show the blue "Pro Player" tag in place of the tier (the default
  // treatment), including in the toggled pro view.
  const columns = buildLeaderboardColumns(
    playersMap,
    gameMode,
    region,
    overrides,
  )

  return (
    <div className="min-h-svh">
      <SiteHeader />
      <main className="pb-16">
        <div className="px-4 pt-8 sm:px-6 sm:pt-10">
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

            {canPro && <ProToggle pro={proView} />}

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

          {loadError ? (
            <div className="mx-auto max-w-[1280px] rounded-xl border border-negative/30 bg-negative/5 p-6 text-sm text-muted-foreground">
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-negative">
                Leaderboard unavailable
              </div>
              <p>{loadError}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="mx-auto max-w-[1280px] rounded-xl border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
              {proView
                ? "No verified pros to show yet."
                : `No rankings returned for ${gameMode} · ${region}.`}
            </div>
          ) : (
            <div className="mx-auto max-w-[1280px]">
              {page === 1 && (
                <LeaderboardPodium
                  entries={rows}
                  playersMap={playersMap}
                  gameMode={gameMode}
                  previews={overrides}
                  showRegion={region === "ALL"}
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
              <Pagination
                page={page}
                totalPages={totalPages}
                ariaLabel="Leaderboard pagination"
                hrefFor={(p) => `${modePath}?${baseQuery}&page=${p}`}
              />
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
