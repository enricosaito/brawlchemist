import { BadgeCheck } from "lucide-react"
import { FlairMark } from "@/components/site/flair-mark"
import { cn } from "@/lib/utils"
import { formatElo, formatPercent } from "@/lib/format"
import { slugForLegendId } from "@/lib/legends-roster"
import {
  LegendChip,
  PlayerLink,
  RankIcon,
  RegionPill,
  TIER_TEXT_COLOR,
} from "@/components/site/primitives"
import { type ColDef } from "@/components/site/data-table"
import type {
  ApiGameMode,
  ApiRegion,
  PlayerRanked,
  PlayerRankedLegend,
  RankedEntry,
} from "@/lib/brawlhalla-api"
import type { PlayerRow } from "@/lib/db/schema"
import type { PlayerPreview } from "@/lib/player-previews"
import type { Tier } from "@/lib/types"

const TOP_LEGENDS_LIMIT = 5

/**
 * Up to N most-played legends from a player's cached rankedJson, as slugs
 * (games-desc), dropping anything we can't map to a roster entry.
 */
export function topLegendSlugsFor(player: PlayerRow | undefined): string[] {
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

const KNOWN_TIERS: readonly Tier[] = [
  "Tin",
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Diamond",
  "Valhallan",
]

export function toTier(value: string | null): Tier | null {
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

/**
 * Column set shared by the ranked leaderboard and the pro leaderboard. Pass an
 * empty `previews` map to render plain rows (no verified-pro name treatment).
 */
export function buildLeaderboardColumns(
  playersMap: Map<number, PlayerRow>,
  gameMode: ApiGameMode,
  region: ApiRegion,
  previews: Map<number, PlayerPreview>,
  /** Chosen flair per player (getFlairMap); omit to render no flair. */
  flairs: Map<number, string> = new Map(),
  /** True when this board IS the global 1v1 ladder, so a row's rank can be
   * read as a ladder position. On a regional or 2v2 board it cannot. */
  rankIsGlobalLadder = false,
): ColDef<RankedEntry>[] {
  // Entitlement from the facts this row actually carries, never from ones it
  // only looks like it carries. A row's rank is a position within the selected
  // mode and region, so it stands in for a ladder position only on the global
  // 1v1 board; wins + losses is 1v1 season games only in 1v1 (in 2v2 it counts
  // team games, which the Veteran rule is not about). Where a fact is
  // unavailable the flair simply does not appear — under-awarding here is the
  // safe direction, since the profile remains the authority.
  const flairFor = (id: number, r: RankedEntry) => {
    const total = (r.wins ?? 0) + (r.losses ?? 0)
    return (
      <FlairMark
        selectedId={flairs.get(id)}
        context={{
          achievements: previews.get(id)?.achievements,
          valhallan: toTier(r.tier) === "Valhallan",
          games: gameMode === "1v1" && total > 0 ? total : undefined,
          ladderRank: rankIsGlobalLadder ? r.rank : null,
        }}
        onlyWhenChosen
      />
    )
  }

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
        // The name carries the row. The tier line that used to sit under it is
        // gone — it's already in the rank emblem (and, on 2v2, its own column) —
        // and so is the "Pro Player" tag, which the check mark says on its own.
        //
        // Pros always show their handle. The in-game name appears beside it on
        // row hover rather than replacing it — the row keeps its identity, and
        // the handle is still what you read at rest. Shown only when it differs
        // from the handle, so there's never a second copy of the same name.
        return (
          <div className="flex min-w-0 flex-col gap-0.5">
            {r.players.length > 0 ? (
              r.players.map((p) => {
                const handle = previews.get(p.id)?.verified?.handle
                const ign =
                  handle && handle !== p.username ? p.username : null
                return (
                  <span key={p.id} className="flex min-w-0 items-baseline gap-2">
                    <PlayerLink
                      id={p.id}
                      className="min-w-0 text-[15px] font-semibold leading-5"
                    >
                      {handle ? (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <span className="min-w-0 truncate">{handle}</span>
                          <BadgeCheck
                            className="size-3.5 shrink-0 text-mystic"
                            aria-label="Verified pro player"
                          />
                          {flairFor(p.id, r)}
                        </span>
                      ) : (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <span className="min-w-0 truncate">{p.username}</span>
                          {flairFor(p.id, r)}
                        </span>
                      )}
                    </PlayerLink>
                    {/* Revealed on hover of the whole row (group/row lives on
                        the <tr>), not just of the name, so the target is the
                        row you're already pointing at. Kept out of the layout
                        with `hidden` rather than opacity so it never reserves
                        width it isn't using. */}
                    {ign && (
                      <span className="hidden min-w-0 shrink truncate font-mono text-[10px] text-muted-foreground lg:group-hover/row:inline">
                        <span className="text-muted-foreground/60">IGN:</span>{" "}
                        {ign}
                      </span>
                    )}
                  </span>
                )
              })
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </div>
        )
      },
    },
    // Hide the region column when narrowed to one region — every row would be
    // identical anyway.
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
    // Single-player modes (1v1, solo 2v2): show up to 5 most-played legends.
    // Team 2v2: textual tier (best-legends would be ambiguous across the two).
    gameMode !== "2v2"
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
