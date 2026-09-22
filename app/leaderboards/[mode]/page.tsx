import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import Image from "next/image"

import { DataTable } from "@/components/site/data-table"
import { buildLeaderboardColumns } from "@/components/site/leaderboard-columns"
import { LeaderboardPodium } from "@/components/site/leaderboard-podium"
import { LeaderboardPlayerSearch } from "@/components/site/leaderboard-player-search"
import { OtherFilter, type OtherOption } from "@/components/site/other-filter"
import { ViewSwitch } from "@/components/site/view-switch"
import { RegionFilter } from "@/components/site/region-filter"
import { ladderView, VIEWS_IN_GROUP } from "@/lib/boards"
import { OtpBoard } from "@/components/site/otp-board"
import { Pagination } from "@/components/site/pagination"
import { LEGEND_ROSTER, rosterEntryBySlug } from "@/lib/legends-roster"
import {
  API_REGIONS,
  type ApiGameMode,
  type ApiRegion,
  getRankedLeaderboard,
  isApiRegion,
  type RankedEntry,
} from "@/lib/brawlhalla-api"
import { RememberRegion } from "@/components/site/remember-region"
import { getSessionUser } from "@/lib/auth/session"
import {
  parseRememberedRegion,
  REGION_COOKIE,
  resolvePreferredRegion,
} from "@/lib/region-preference"
import { getViewerDefaultRegion } from "@/lib/sync/viewer-prefs"
import { getPlayersByIds } from "@/lib/sync/players"
import { getValhallanCutoffs } from "@/lib/sync/valhallan-cutoff"
import { getProLeaderboard } from "@/lib/sync/pro-leaderboard"
import { getProfilesMap } from "@/lib/sync/profiles"
import { getFlairMap } from "@/lib/sync/customizations"
import { getSmurfMap, type SmurfMap } from "@/lib/sync/smurf"
import type { PlayerRow } from "@/lib/db/schema"
import { InfoTip } from "@/components/site/info-tip"

const PAGE_SIZE = 50

/** Where the cutoff chip falls back to when we know nothing about the viewer —
 * a combined cutoff doesn't exist, so the ALL board has to name *a* ladder, and
 * US-E is the largest. */
const FALLBACK_CUTOFF_REGION: ApiRegion = "US-E"

// Neither the ALL/PRO switch, the Mode tablist nor the LEGEND picker lives here
// any more. Queue *is* the view now, and so is a legend: Ranked 1v1, Ranked 2v2
// and Power Rankings under TYPE, and everything else — Solo 2v2, 3v3, Pros only
// and all seventy mains boards — under OTHER. Four controls became two, split
// by how often each is asked for rather than by how the data happens to be
// stored.

/** Valid path modes. "pro" is a separate static route, not handled here. */
function parseMode(mode: string): ApiGameMode | null {
  return mode === "1v1" ||
    mode === "2v2" ||
    mode === "solo_2v2" ||
    mode === "3v3"
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
              title: "3v3 Leaderboard",
              description:
                "Top Brawlhalla 3v3 players, ranked live per region.",
            }
          : {
              title: "1v1 Leaderboard",
              description:
                "Top Brawlhalla 1v1 players, ranked live per region.",
            }
  return {
    title: `Brawlchemist | ${meta.title}`,
    description: meta.description,
  }
}

export default async function LeaderboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ mode: string }>
  searchParams: Promise<{
    region?: string
    page?: string
    pro?: string
    legend?: string
  }>
}) {
  const { mode } = await params
  const gameMode = parseMode(mode)
  if (!gameMode) notFound()

  const sp = await searchParams

  // Which ladder to open on. Same rule /queue uses, from the same module, so
  // the two can't drift on what "my region" means: an explicit ?region wins,
  // then the signed-in viewer's own region, then the one they last had open,
  // then the global board.
  //
  // Both lookups are cheap and both fail open — the cookie is a string already
  // on the request, and getViewerDefaultRegion is one primary-key round trip
  // behind a five-minute cache. A signed-out visitor pays only the cookie read.
  const [cookieStore, user] = await Promise.all([cookies(), getSessionUser()])
  const viewerRegion = user ? await getViewerDefaultRegion(user.id) : null
  const rememberedRegion = parseRememberedRegion(
    cookieStore.get(REGION_COOKIE)?.value
  )
  const region = resolvePreferredRegion<ApiRegion>({
    requested: sp.region,
    viewer: viewerRegion,
    remembered: rememberedRegion,
    fallback: "ALL",
    isValid: isApiRegion,
  })
  const requestedPage = Math.max(1, Number(sp.page ?? "1") || 1)
  const modePath = `/leaderboards/${gameMode}`

  // Legend filter — folds the old /otps "mains" board into the 1v1 ladder. The
  // OTP data is 1v1-only, so the filter is offered only there; an invalid slug
  // falls through to the normal ladder.
  const canFilterLegend = gameMode === "1v1"
  const legendActive =
    canFilterLegend && sp.legend && rosterEntryBySlug(sp.legend)
      ? sp.legend
      : null

  // Pro-only view — a toggle available on every 1v1 board (region-aware). It's
  // mutually exclusive with the legend filter (mains aren't pro-scoped).
  const canPro = gameMode === "1v1" && !legendActive
  const proView = canPro && sp.pro === "1"
  const view = ladderView(gameMode, proView)
  const baseQuery = proView ? `region=${region}&pro=1` : `region=${region}`

  // The Valhallan cutoff is region-specific, and the question it answers —
  // "what rating do I need" — is about the ladder *you* play, not the one you
  // happen to be reading. So it follows the board when the board names a
  // region, and falls back to your own region on ALL: linked account first,
  // then the region you last had open, same precedence resolvePreferredRegion
  // uses. One chip either way. It used to print three on ALL, which cost three
  // cutoff walks against a 180/15min budget to answer a question nobody asks in
  // triplicate.
  const cutoffRegion: ApiRegion =
    region !== "ALL"
      ? region
      : viewerRegion && isApiRegion(viewerRegion) && viewerRegion !== "ALL"
        ? viewerRegion
        : isApiRegion(rememberedRegion) && rememberedRegion !== "ALL"
          ? rememberedRegion
          : FALLBACK_CUTOFF_REGION
  const cutoffRegions: ApiRegion[] = [cutoffRegion]

  // Admin-curated previews (PRO badge/handle, favorite skin) for the podium
  // and the table's pro name treatment.
  const overrides = await getProfilesMap()

  // Data source: verified pros (toggle on) or the live ladder.
  let rows: RankedEntry[] = []
  let totalPages = 1
  let loadError: string | null = null
  let cutoffs: Awaited<ReturnType<typeof getValhallanCutoffs>> = new Map()

  if (legendActive) {
    // OtpBoard owns its own rows; we only need the cutoff chips for the
    // control row here.
    cutoffs = await getValhallanCutoffs(gameMode, cutoffRegions)
  } else if (proView) {
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
  // Only the 1v1/solo board renders the best-picks column (which reads
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
  const [flairs, smurfs] = await Promise.all([
    getFlairMap(),
    getSmurfMap().catch((err): SmurfMap => {
      console.error("[leaderboards] smurf map failed:", err)
      return new Map()
    }),
  ])
  const columns = buildLeaderboardColumns(
    playersMap,
    gameMode,
    region,
    overrides,
    flairs,
    smurfs
  )

  // Region links carry the active legend so switching ladders keeps the filter.
  const legendSuffix = legendActive ? `&legend=${legendActive}` : ""

  // Everything OTHER offers, in one list: the three off-ladder queues first,
  // then every legend's mains board alphabetically. Hrefs are built here, on
  // the server, so the dropdown stays a list of plain links — it never has to
  // know about regions, pro flags or which page serves which view.
  const otherOptions: OtherOption[] = [
    ...VIEWS_IN_GROUP.other.map((v) => ({
      key: v.id,
      label: v.label,
      // The button drops "Ranked" the same way a legend drops "Mains": the menu
      // is where the full name has to disambiguate, the button only has to name
      // what you are already looking at, and it has a fixed width to keep.
      short: v.label.replace(/^Ranked /, ""),
      section: "Queues",
      href: `/leaderboards/${v.mode}?region=${region}${v.pro ? "&pro=1" : ""}`,
    })),
    ...[...LEGEND_ROSTER]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((l) => ({
        key: `legend:${l.slug}`,
        label: `${l.name} Mains`,
        short: l.name,
        section: "Legend mains",
        icon: `/assets/legends/${l.slug}.png`,
        // Mains boards are 1v1-only data, so they always land on that ladder
        // whichever board you pick them from.
        href: `/leaderboards/1v1?region=${region}&legend=${l.slug}`,
      })),
  ]
  const otherKey = legendActive
    ? `legend:${legendActive}`
    : VIEWS_IN_GROUP.other.some((v) => v.id === view)
      ? view
      : null

  return (
    <main className="pb-16">
      {/* Records whatever ladder is actually on screen, however they got
            there — a region click, a shared link, or the back button. */}
      <RememberRegion region={region} />
      <div className="px-4 pt-8 sm:px-6 sm:pt-10">
        {/* One control row, one line: Search · Region · Type · Other, with
              the Valhallan cutoff closing it out on the right.

              Region leads the three pickers because it qualifies all of them —
              every view below is "this ranking, in this region", and reading
              the row left to right now spells the question out in that order.
              Type then Other is the same split as before, by how often each is
              asked for. The old LEGEND picker is gone as a separate control:
              seventy mains boards are more of OTHER, not a different kind of
              filter, and two dropdowns that could both light at once were
              claiming a selection the page can only make one of. */}
        <div className="mx-auto mb-4 flex max-w-[1280px] flex-wrap items-center gap-x-2 gap-y-3">
          {/* The one elastic control. Everything after it is a fixed-width
              picker, so search absorbs the slack and gives it back on a narrow
              desktop — which is what keeps the cutoff on this line instead of
              wrapping to one of its own. */}
          <LeaderboardPlayerSearch className="w-full sm:w-auto sm:max-w-[240px] sm:min-w-[140px] sm:flex-1 sm:basis-[152px]" />

          {/* Region as a dropdown. Ten chips were the heaviest thing in this
                row, paying for a choice almost nobody makes: resolvePreferredRegion
                already opens on the region you play. */}
          <RegionFilter
            regions={API_REGIONS}
            selected={region}
            basePath={modePath}
            suffix={`${proView ? "&pro=1" : ""}${legendSuffix}`}
          />

          {/* A mains board is a selection in OTHER, so TYPE goes dark for it
              rather than leaving RANKED 1V1 lit beside an OTHER reading "Ada
              Mains" — which is the two-selections-at-once this row exists to
              stop showing. */}
          <ViewSwitch
            group="type"
            label="Type"
            current={legendActive ? null : view}
            region={region}
            mode={gameMode}
          />

          <OtherFilter options={otherOptions} selectedKey={otherKey} />

          {/* Valhallan cutoff — closes out the same row rather than wrapping
                to one of its own, because it is the answer to a question the
                filters ask ("how far is the top of this ladder") and not a
                caption for the table. The helm carries the meaning, the tooltip
                holds the detail, and the region token says which ladder it is
                quoting — which matters on ALL, where it quotes yours. */}
          {(() => {
            const c = cutoffs.get(cutoffRegion)
            if (!c) return null
            return (
              <div className="ml-auto flex items-center">
                <InfoTip
                  label={`${cutoffRegion} Valhallan cutoff — #${c.rank} ${c.username}, ${c.count} Valhallans total`}
                >
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card/60 px-2 py-1.5 font-mono text-[10px] tracking-wider text-foreground uppercase">
                    <Image
                      src="/assets/ranks/valhallan-helm.png"
                      alt="Valhallan cutoff"
                      width={16}
                      height={16}
                      className="shrink-0 object-contain select-none"
                    />
                    <span className="text-muted-foreground">
                      {cutoffRegion}
                    </span>
                    <span className="tabular-nums">
                      {c.rating.toLocaleString()}
                    </span>
                  </span>
                </InfoTip>
              </div>
            )
          })()}
        </div>

        {legendActive ? (
          <OtpBoard
            legendSlug={legendActive}
            region={region}
            page={requestedPage}
            basePath={modePath}
          />
        ) : loadError ? (
          <div className="mx-auto max-w-[1280px] rounded-xl border border-negative/30 bg-negative/5 p-6 text-sm text-muted-foreground">
            <div className="mb-1 font-mono text-[10px] tracking-wider text-negative uppercase">
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
                flairs={flairs}
                smurfs={smurfs}
                showRegion={region === "ALL"}
              />
            )}
            {/* The podium highlights the top 3, but the table still lists
                  them — starting at #4 read like rows were missing. */}
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r) => `${r.rank}-${r.players[0]?.id ?? "x"}`}
              rowPlayer={(r) => {
                // Only single-player rows: a 2v2 team has two players and
                // so no one destination the row could mean.
                const id = r.players.length === 1 ? r.players[0]?.id : null
                return id ? { id, href: `/player/${id}` } : null
              }}
            />
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
