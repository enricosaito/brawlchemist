import { FlairMark } from "@/components/site/flair-mark"
import { VerifiedMark } from "@/components/site/verified-mark"
import { SmurfMark } from "@/components/site/smurf-mark"
import type { SmurfMap } from "@/lib/sync/smurf"
import { formatElo, formatPercent } from "@/lib/format"
import { rosterEntryByLegendId, slugForLegendId } from "@/lib/legends-roster"
import {
  LegendChip,
  PlayerLink,
  RankIcon,
  RankHelm,
  RegionPill,
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
import type { WeaponId } from "@/lib/types"
import { flairContextFrom } from "@/lib/profile/flair"
import { toTier } from "@/lib/tier"
import { previewKind } from "@/lib/player-previews"

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
  /** Possible smurfs, with the evidence the tag quotes (getSmurfMap). */
  smurfs: SmurfMap = new Map()
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
  // A cap, only where two names share a line. Side by side, a team's cell is as
  // wide as BOTH names — "The Jokester + È INUTILE VIVERE PER SEMPRE" is forty
  // characters of min-content, and min-content wins in an auto-layout table, so
  // one team like that widened the whole board and pushed Win Rate off the
  // edge. Bounding each name lets the ellipsis do the work instead of the
  // table. 1v1 has one name and no such sum, so it keeps the room.
  const nameClass =
    gameMode === "2v2" ? "min-w-0 max-w-[150px] truncate" : "min-w-0 truncate"

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
      // No null guard here any more: RankIcon owns the fallback, so a label
      // we don't model draws the Fallen Valhallan emblem rather than a hole.
      render: (r) => (
        <RankIcon
          tier={toTier(r.tier)}
          rating={r.rating}
          size={32}
          className="mx-auto"
        />
      ),
    },
    {
      id: "main-legend",
      label: "Main",
      // Two chips need room to sit beside each other; one does not.
      width: gameMode === "2v2" ? "80px" : "56px",
      align: "center",
      // Side by side, never stacked. A 2v2 row is one row — the same height,
      // the same columns and the same reading order as a 1v1 row — because it
      // answers the same question about a different number of people. Stacking
      // made every team two lines tall and made the board look like a different
      // table rather than the same one with a partner in it.
      render: (r) => (
        <div className="flex items-center justify-center gap-1">
          {/* No dash for a player we have no main for. LegendChip owns that
              fallback now, so the column is a grid of portraits all the way
              down rather than one with holes punched in it — and the hole was
              never "no legend", it was "we have not read one yet". */}
          {r.players.map((p) => {
            const lid = playersMap.get(p.id)?.topLegendId
            return (
              <LegendChip
                key={p.id}
                legendId={lid ? slugForLegendId(lid) : null}
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
          <div className="flex min-w-0 items-center gap-1.5">
            {r.players.length > 0 ? (
              r.players.map((p, i) => {
                const handle = previews.get(p.id)?.verified?.handle
                return (
                  <span
                    key={p.id}
                    className="flex min-w-0 items-center gap-1.5"
                  >
                    {/* "+" rather than a rule or a gap: these two are not two
                        entries, they are one team, and it is the same join the
                        podium already uses for the same pair. */}
                    {i > 0 && (
                      <span
                        aria-hidden
                        className="shrink-0 font-mono text-xs text-muted-foreground/60"
                      >
                        +
                      </span>
                    )}
                    <PlayerLink
                      id={p.id}
                      className="min-w-0 text-[15px] leading-5 font-semibold"
                    >
                      {handle ? (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <span className={nameClass}>{handle}</span>
                          <VerifiedMark tier={previewKind(previews.get(p.id))} />
                          {flairFor(p.id)}
                          <SmurfMark evidence={smurfs.get(p.id)} />
                        </span>
                      ) : (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <span className={nameClass}>{p.username}</span>
                          {flairFor(p.id)}
                          <SmurfMark evidence={smurfs.get(p.id)} />
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
        // one figure.
        //
        // No `tier &&` guard: RankHelm owns the fallback, so a "Fallen
        // Valhallan" — the one label on this ladder that isn't one of the seven
        // — gets the Diamond helm rather than a bare number in a column of
        // helmed ones.
        const tier = toTier(r.tier)
        return (
          <span className="flex items-center justify-end gap-1.5 font-mono text-sm tabular-nums">
            <RankHelm tier={tier} rating={r.rating} className="h-[18px]" />
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
          // Games, where the textual tier used to be. The tier was the one cell
          // on the row that said nothing new: the emblem two columns left and
          // the helm beside the rating both already say it, in colour, and
          // spelling "VALHALLAN" a third time crowded out the one thing a team
          // board cannot otherwise tell you — how much they have actually
          // played together. A 2,400 rating over 60 games and over 600 are
          // different claims.
          id: "games",
          label: "Games",
          align: "right",
          width: "90px",
          render: (r) => {
            // Not on the payload; wins and losses are, and either can be null.
            // Both null means the season is inaccessible, which is a dash — not
            // zero, which would read as "played none".
            const games =
              r.wins == null && r.losses == null
                ? null
                : (r.wins ?? 0) + (r.losses ?? 0)
            return (
              <span className="font-mono text-sm text-muted-foreground tabular-nums">
                {games?.toLocaleString() ?? "—"}
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
        // nowrap: "502 – 151" is one figure, not three tokens. The column is a
        // hint rather than a rule in an auto-layout table, so a wider neighbour
        // could break the record across two lines — which silently made every
        // row on that board taller than the same row on another one.
        <span className="font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums">
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
