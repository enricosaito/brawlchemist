import { FlairMark } from "@/components/site/flair-mark"
import { VerifiedMark } from "@/components/site/pro-badge"
import { cn } from "@/lib/utils"
import { formatElo, formatPercent } from "@/lib/format"
import { rosterEntryByLegendId, slugForLegendId } from "@/lib/legends-roster"
import {
  LegendChip,
  PlayerLink,
  RankIcon,
  RankHelm,
  RegionPill,
  TIER_TEXT_COLOR,
  WeaponIcon,
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
import type { Tier, WeaponId } from "@/lib/types"
import { flairContextFrom } from "@/lib/profile/flair"

const TOP_LEGENDS_LIMIT = 3
const TOP_WEAPONS_LIMIT = 2

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

/**
 * The weapons behind a player's play, from the legends we already hold.
 *
 * Weapon time lives in GetPlayerStats, a call per player the leaderboard is
 * never going to make. Every legend carries exactly two weapons though, so
 * attributing each legend's games to both and summing gives a good answer for
 * free — it's inferred from picks rather than measured from time held, which
 * is the honest reading of "best picks".
 */
export function topWeaponsFor(player: PlayerRow | undefined): WeaponId[] {
  if (!player?.rankedJson) return []
  const ranked = player.rankedJson as PlayerRanked
  const legends: PlayerRankedLegend[] = Array.isArray(ranked.legends)
    ? ranked.legends
    : []
  const games = new Map<WeaponId, number>()
  for (const l of legends) {
    if (typeof l.games !== "number" || l.games <= 0) continue
    const entry = rosterEntryByLegendId(l.legend_id)
    if (!entry) continue
    for (const w of entry.weapons) {
      games.set(w, (games.get(w) ?? 0) + l.games)
    }
  }
  return [...games.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_WEAPONS_LIMIT)
    .map(([w]) => w)
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
  flairs: Map<number, string> = new Map()
): ColDef<RankedEntry>[] {
  // Accolades are the only thing flair reads now, and previews already holds
  // them — so no per-row derivation, and nothing here can disagree with the
  // profile.
  const flairFor = (id: number) => (
    <FlairMark
      selectedId={flairs.get(id)}
      context={flairContextFrom(previews.get(id))}
    />
  )
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
        // The name carries the row, and only the name: the tier line under it
        // is already in the rank emblem, the "Pro Player" tag is what the check
        // mark says on its own, and the in-game name that used to appear on
        // hover was a second copy of an identity the row had already
        // established. Pros are known by their handle — that's the name.
        return (
          <div className="flex min-w-0 flex-col gap-0.5">
            {r.players.length > 0 ? (
              r.players.map((p) => {
                const handle = previews.get(p.id)?.verified?.handle
                return (
                  <span
                    key={p.id}
                    className="flex min-w-0 items-baseline gap-2"
                  >
                    <PlayerLink
                      id={p.id}
                      className="min-w-0 text-[15px] leading-5 font-semibold"
                    >
                      {handle ? (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <span className="min-w-0 truncate">{handle}</span>
                          <VerifiedMark />
                          {flairFor(p.id)}
                        </span>
                      ) : (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <span className="min-w-0 truncate">{p.username}</span>
                          {flairFor(p.id)}
                        </span>
                      )}
                    </PlayerLink>
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
      render: (r) => {
        // The helm rides with the rating, as it does on the profile and the
        // home card: it describes where that number sits, so the two read as
        // one figure. Only the top two tiers have one.
        const tier = toTier(r.tier)
        return (
          <span className="flex items-center justify-end gap-1.5 font-mono text-sm tabular-nums">
            {tier && <RankHelm tier={tier} className="h-[18px]" />}
            <span>
              {formatNullableElo(r.rating)}
              {r.rating != null && (
                <span className="ml-1 text-[10px] tracking-wider text-muted-foreground uppercase">
                  ELO
                </span>
              )}
            </span>
          </span>
        )
      },
    },
    // Single-player modes (1v1, solo 2v2): show up to 5 most-played legends.
    // Team 2v2: textual tier (best picks would be ambiguous across the two).
    gameMode !== "2v2"
      ? {
          id: "best-picks",
          label: "Best Picks",
          width: "200px",
          render: (r) => {
            const player = r.players[0]
            const row = player ? playersMap.get(player.id) : undefined
            const slugs = topLegendSlugsFor(row)
            const weapons = topWeaponsFor(row)
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
                {/* A rule, not a gap: legends and weapons are different kinds
                    of answer to "what do they play", and without it the icons
                    read as one undifferentiated row of pictures. */}
                {weapons.length > 0 && (
                  <span
                    aria-hidden
                    className="mx-0.5 h-5 w-px shrink-0 bg-border/60"
                  />
                )}
                {weapons.map((w) => (
                  <WeaponIcon key={w} weaponId={w} size={20} />
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
                  "font-mono text-[11px] font-medium tracking-wider uppercase",
                  tier ? TIER_TEXT_COLOR[tier] : "text-muted-foreground"
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
        <span className="font-mono text-sm text-muted-foreground tabular-nums">
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
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
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
