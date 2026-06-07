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
import { getProfilesMap } from "@/lib/sync/profiles"
import type { PlayerRow } from "@/lib/db/schema"

const QUEUES: { id: ApiGameMode; label: string }[] = [
  { id: "1v1", label: "1v1" },
  { id: "2v2", label: "2v2" },
  { id: "solo_2v2", label: "Solo 2v2" },
  { id: "3v3", label: "3v3" },
]

const PAGE_SIZE = 50

/** The three biggest ladders — their Valhallan cutoffs headline the global
 * (ALL) board, since a combined cutoff doesn't exist. */
const GLOBAL_CUTOFF_REGIONS: ApiRegion[] = ["US-E", "EU", "BRZ"]

/** ALL ⟷ PRO switch — shown on every 1v1 board (the pro list filters per
 * region). Each click navigates to the opposite state, keeping the region. */
function ProToggle({ pro, region }: { pro: boolean; region: ApiRegion }) {
  const allHref = `/leaderboards/1v1?region=${region}`
  const proHref = `/leaderboards/1v1?region=${region}&pro=1`
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
  return mode === "1v1" || mode === "2v2" || mode === "solo_2v2" || mode === "3v3"
    ? mode
    : null
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
        : mode === "3v3"
          ? {
              title: "3v3 Ranking",
              description: "Top Brawlhalla 3v3 players, ranked live per region.",
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

  // Pro-only view — a toggle available on every 1v1 board (region-aware).
  const canPro = gameMode === "1v1"
  const proView = canPro && sp.pro === "1"
  const baseQuery = proView ? `region=${region}&pro=1` : `region=${region}`

  // The Valhallan cutoff is region-specific; the ALL board shows the three
  // main ladders' cutoffs side by side.
  const cutoffRegions: ApiRegion[] =
    region === "ALL" ? GLOBAL_CUTOFF_REGIONS : [region]

  // Admin-curated previews (PRO badge/handle, favorite skin) for the podium
  // and the table's pro name treatment.
  const overrides = await getProfilesMap()

  // Data source: verified pros (toggle on) or the live ladder.
  let rows: RankedEntry[] = []
  let totalPages = 1
  let loadError: string | null = null
  let cutoffs: Awaited<ReturnType<typeof getValhallanCutoffs>> = new Map()

  if (proView) {
    // Pros come back as one fully-ranked list (filtered per region); page it
    // 50 at a time like the live ladder. Each row keeps its `rank`, so
    // slicing is safe.
    const [allPros, cuts] = await Promise.all([
      getProLeaderboard(region),
      getValhallanCutoffs(gameMode, cutoffRegions),
    ])
    cutoffs = cuts
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
  // Only the 1v1/solo board renders the best-legends column (which reads
  // ranked_json); 2v2 shows just the main-legend chip (topLegendId), so it
  // skips the ranked_json blob.
  let playersMap = new Map<number, PlayerRow>()
  if (rows.length > 0) {
    const ids = rows.flatMap((r) => r.players.map((p) => p.id))
    try {
      playersMap = await getPlayersByIds(ids, {
        includeRankedJson: gameMode !== "2v2",
      })
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
    <main className="pb-16">
        <div className="px-4 pt-8 sm:px-6 sm:pt-10">
          {/* Search · Mode · Region on one line; Valhallan cutoff pushed right. */}
          <div className="mx-auto mb-4 flex max-w-[1280px] flex-wrap items-center gap-x-3 gap-y-3">
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
                      "rounded-md px-2.5 py-1 font-mono text-xs uppercase tracking-wider transition-colors",
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

            {canPro && <ProToggle pro={proView} region={region} />}

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
                      "rounded-md px-2.5 py-1 font-mono text-xs uppercase tracking-wider transition-colors",
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

          {/* Valhallan cutoffs — their own line above the board (the filter
              row got crowded once the pro toggle went region-wide). The ALL
              board shows the three main ladders side by side. */}
          {cutoffs.size > 0 && (
            <div className="mx-auto mb-4 flex max-w-[1280px] flex-wrap items-center justify-end gap-2">
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
              {/* The podium highlights the top 3, but the table still lists
                  them — starting at #4 read like rows were missing. */}
              <DataTable
                columns={columns}
                rows={rows}
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
  )
}
