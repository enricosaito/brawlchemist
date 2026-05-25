import {
  LegendChip,
  PlayerLink,
  RankIcon,
  RegionPill,
  TIER_TEXT_COLOR,
} from "@/components/site/primitives"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { BadgeCheck } from "lucide-react"
import { DataTable, type ColDef } from "@/components/site/data-table"
import { LeaderboardPodium } from "@/components/site/leaderboard-podium"
import { LeaderboardSearch } from "@/components/site/leaderboard-search"
import { LegendPicker } from "@/components/site/legend-picker"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { formatElo, formatPercent } from "@/lib/format"
import { getLegend } from "@/lib/mock-data"
import {
  LEGEND_ROSTER,
  rosterEntryBySlug,
  type RosterEntry,
} from "@/lib/legends-roster"
import {
  API_REGIONS,
  isApiRegion,
  type ApiRegion,
  type RankedEntry,
} from "@/lib/brawlhalla-api"
import { getOtpsForLegend, type OtpPlayer } from "@/lib/sync/otps"
import { getPlayersByIds } from "@/lib/sync/players"
import { getValhallanCutoffs } from "@/lib/sync/valhallan-cutoff"
import { getOverridesMap } from "@/lib/sync/player-overrides"
import type { PlayerRow } from "@/lib/db/schema"
import type { PlayerPreview } from "@/lib/player-previews"
import { deriveTier, isFallenValhallan, isValhallan, tierLabel } from "@/lib/tier"
import { FallenEmblem } from "@/components/site/fallen-valhallan"

const REGION_OPTIONS = ["ALL", ...API_REGIONS.filter((r) => r !== "ALL")] as const

function formatWinRate(wins: number | null, games: number | null): string {
  if (wins == null || games == null || games === 0) return "—"
  return formatPercent((wins / games) * 100)
}

const DEFAULT_LEGEND_SLUG = "cassidy"

function buildColumns(
  legendSlug: string,
  valhallanById: Map<number, boolean>,
  fallenById: Map<number, boolean>,
  previews: Map<number, PlayerPreview>,
  // The top 3 render in the podium, so the table starts at this rank.
  rankOffset = 0,
): ColDef<OtpPlayer>[] {
  return [
    {
      id: "rank",
      label: "#",
      width: "56px",
      align: "right",
      render: (_, i) => (
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {i + 1 + rankOffset}
        </span>
      ),
    },
    {
      id: "rank-icon",
      label: "Rank",
      width: "72px",
      align: "center",
      render: (p) => {
        if (fallenById.get(p.brawlhalla_id)) {
          return <FallenEmblem size={32} className="mx-auto" />
        }
        const tier = deriveTier(p.tier, valhallanById.get(p.brawlhalla_id) ?? false)
        return tier ? (
          <RankIcon tier={tier} size={32} className="mx-auto" />
        ) : null
      },
    },
    {
      id: "player",
      label: "Player",
      render: (p) => {
        const val = valhallanById.get(p.brawlhalla_id) ?? false
        const tier = deriveTier(p.tier, val)
        const tierText = tierLabel(p.tier, val)
        // Verified pros lead with their handle + badge and a "Pro Player" tag;
        // hovering the row reveals the in-game name and the real rank below it.
        const handle = previews.get(p.brawlhalla_id)?.verified?.handle
        return (
          <div className="flex items-center gap-2">
            <LegendChip legendId={legendSlug} size="md" showName={false} />
            <div
              className={cn(
                "flex min-w-0 flex-col gap-0.5",
                handle && "group/pro",
              )}
            >
              <PlayerLink
                id={p.brawlhalla_id}
                className="text-sm font-medium leading-5"
              >
                {handle ? (
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <span className="min-w-0 truncate">
                      <span className="group-hover/pro:hidden">{handle}</span>
                      <span className="hidden group-hover/pro:inline">
                        {p.username}
                      </span>
                    </span>
                    <BadgeCheck className="size-3.5 shrink-0 text-foreground group-hover/pro:hidden" />
                  </span>
                ) : (
                  <span className="truncate">{p.username}</span>
                )}
              </PlayerLink>
              {handle ? (
                <>
                  <span className="mt-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-mystic group-hover/pro:hidden">
                    Pro Player
                  </span>
                  {tier && (
                    <span
                      className={cn(
                        "mt-0.5 hidden font-mono text-[10px] font-medium uppercase tracking-wider group-hover/pro:block",
                        TIER_TEXT_COLOR[tier],
                      )}
                    >
                      {tierText}
                    </span>
                  )}
                </>
              ) : tier ? (
                <span
                  className={cn(
                    "mt-0.5 font-mono text-[10px] font-medium uppercase tracking-wider",
                    TIER_TEXT_COLOR[tier],
                  )}
                >
                  {tierText}
                </span>
              ) : null}
            </div>
          </div>
        )
      },
    },
    {
      id: "region",
      label: "Region",
      width: "84px",
      render: (p) =>
        p.region ? (
          <RegionPill region={p.region} />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "rating",
      label: "Rating",
      align: "right",
      width: "100px",
      render: (p) => (
        <span className="font-mono text-sm tabular-nums">
          {p.rating != null ? formatElo(p.rating) : "—"}
        </span>
      ),
    },
    {
      id: "peak",
      label: "Peak",
      align: "right",
      width: "100px",
      render: (p) => (
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {p.peak_rating != null ? formatElo(p.peak_rating) : "—"}
        </span>
      ),
    },
    {
      id: "pick-rate",
      label: "Pick Rate",
      align: "right",
      width: "110px",
      render: (p) => {
        const lGames = p.legend_games ?? 0
        const total = p.games ?? 0
        const share = total > 0 ? (lGames / total) * 100 : 0
        return (
          <span className="font-mono text-sm tabular-nums text-tier-s">
            {share.toFixed(1)}%
          </span>
        )
      },
    },
    {
      id: "winrate",
      label: "Legend WR",
      align: "right",
      width: "100px",
      render: (p) => (
        <span className="font-mono text-sm tabular-nums text-positive">
          {formatWinRate(p.legend_wins, p.legend_games)}
        </span>
      ),
    },
  ]
}

export default async function OtpsPage({
  searchParams,
}: {
  searchParams: Promise<{ legend?: string; region?: string }>
}) {
  const params = await searchParams
  const legendSlug =
    params.legend && rosterEntryBySlug(params.legend)
      ? params.legend
      : DEFAULT_LEGEND_SLUG
  const selectedLegend: RosterEntry =
    rosterEntryBySlug(legendSlug) ?? rosterEntryBySlug(DEFAULT_LEGEND_SLUG)!
  const legendData = getLegend(legendSlug)
  const region = params.region === "ALL"
    ? "ALL"
    : params.region && isApiRegion(params.region)
      ? params.region
      : "ALL"
  const regionFilter = region === "ALL" ? null : region

  const players = await getOtpsForLegend({
    legendId: selectedLegend.legendId,
    region: regionFilter,
    limit: 50,
  })

  // Valhallan vs Diamond (both 2000+) hinges on each player's regional ladder
  // cutoff. Fetch only the regions present here (cached, shared with the
  // leaderboard) and mark who clears it with the 100-win requirement.
  const regions = [
    ...new Set(
      players
        .map((p) => p.region)
        .filter(
          (r): r is ApiRegion => !!r && r !== "ALL" && isApiRegion(r),
        ),
    ),
  ]
  const cutoffs = await getValhallanCutoffs("1v1", regions)
  const cutoffFor = (region: string | null) =>
    region && isApiRegion(region) ? cutoffs.get(region)?.rating ?? null : null
  const valhallanById = new Map<number, boolean>(
    players.map((p) => [
      p.brawlhalla_id,
      isValhallan(p.rating, cutoffFor(p.region), p.wins),
    ]),
  )
  const fallenById = new Map<number, boolean>(
    players.map((p) => [
      p.brawlhalla_id,
      isFallenValhallan(
        p.tier,
        p.rating,
        p.peak_rating,
        cutoffFor(p.region),
        p.wins,
      ),
    ]),
  )

  // Admin-curated pro handles/badges for the player column.
  const overrides = await getOverridesMap()

  // Cached player rows enrich the podium's best-legends row. Fail open.
  let playersMap = new Map<number, PlayerRow>()
  try {
    playersMap = await getPlayersByIds(players.map((p) => p.brawlhalla_id))
  } catch (err) {
    console.error("[otps] player cache lookup failed:", err)
  }

  // Top 3 reuse the shared leaderboard podium — adapt OtpPlayer → RankedEntry,
  // deriving the real Valhallan tier (the /ranked tier caps at Diamond).
  const toEntry = (p: OtpPlayer, rank: number): RankedEntry => ({
    players: [{ id: p.brawlhalla_id, username: p.username }],
    best_rating: p.peak_rating,
    rank,
    rating: p.rating,
    wins: p.wins,
    losses:
      p.games != null && p.wins != null ? Math.max(0, p.games - p.wins) : null,
    region: p.region,
    tier: (valhallanById.get(p.brawlhalla_id) ?? false) ? "Valhallan" : p.tier,
  })
  const podiumEntries = players.slice(0, 3).map((p, i) => toEntry(p, i + 1))
  const tableRows = players.slice(3)

  const pickerOptions = [...LEGEND_ROSTER]
    .map((l) => ({ slug: l.slug, name: l.name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="min-h-svh">
      <SiteHeader />
      <main className="pb-16">
        <div className="px-4 pt-8 sm:px-6 sm:pt-10">
          <div className="mx-auto mb-4 max-w-[1280px]">
            <LegendPicker
              options={pickerOptions}
              selectedSlug={legendSlug}
              currentRegion={region}
            />
          </div>

          <div className="mx-auto mb-4 flex max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-3">
            <LeaderboardSearch className="w-full sm:w-auto sm:min-w-[220px]" />

            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Region
              </span>
              <div className="flex flex-wrap items-center gap-1 rounded-md border border-border/60 bg-muted/40 p-1">
                {REGION_OPTIONS.map((r) => (
                  <Link
                    key={r}
                    href={`/otps?legend=${legendSlug}&region=${r}`}
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
          </div>

          {players.length === 0 ? (
            <div className="mx-auto max-w-[1280px] rounded-xl border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
              No one in our DB mains{" "}
              <span className="font-medium text-foreground">
                {selectedLegend.name}
              </span>{" "}
              {region === "ALL" ? "this season." : `in ${region} this season.`}{" "}
              The DB only includes Valhallan-discovered players — try a more
              popular legend, or widen the region filter to ALL.
            </div>
          ) : (
            <div className="mx-auto max-w-[1280px]">
              {legendData && (
                <div className="mb-3 flex items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-3">
                  <LegendChip
                    legendId={legendSlug}
                    size="lg"
                    showName={false}
                  />
                  <div className="flex flex-col">
                    <span className="font-display text-lg font-semibold">
                      {selectedLegend.name} mains
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {region === "ALL" ? "all regions" : `region: ${region}`}{" "}
                      · top {players.length}
                    </span>
                  </div>
                </div>
              )}

              <LeaderboardPodium
                entries={podiumEntries}
                playersMap={playersMap}
                gameMode="1v1"
                previews={overrides}
                showRegion={region === "ALL"}
              />

              {tableRows.length > 0 && (
                <>
                  <DataTable
                    columns={buildColumns(
                      legendSlug,
                      valhallanById,
                      fallenById,
                      overrides,
                      3,
                    )}
                    rows={tableRows}
                    rowKey={(p) => String(p.brawlhalla_id)}
                    searchValue={(p) =>
                      [
                        p.username,
                        overrides.get(p.brawlhalla_id)?.verified?.handle,
                      ]
                        .filter(Boolean)
                        .join(" ")
                    }
                  />
                  <p
                    id="leaderboard-no-match"
                    hidden
                    className="mt-3 text-sm text-muted-foreground"
                  >
                    No players match your search.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
