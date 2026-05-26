import { BadgeCheck } from "lucide-react"
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
  // On the pro board every row is already a pro, so show the handle + badge in
  // the name but keep the real tier (not the "Pro Player" tag) in the subtext.
  proBoard = false,
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
        // Pros show "<handle> ✓" + a blue "Pro Player" tag by default; hovering
        // the row reveals the in-game username and the real tier (one group/pro).
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
                )
              })
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
            {proBoard ? (
              tier ? (
                <span
                  className={cn(
                    "mt-0.5 font-mono text-[10px] font-medium uppercase tracking-wider",
                    TIER_TEXT_COLOR[tier],
                  )}
                >
                  {r.tier}
                </span>
              ) : null
            ) : rowPro ? (
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
                    {r.tier}
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
                {r.tier}
              </span>
            ) : null}
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
