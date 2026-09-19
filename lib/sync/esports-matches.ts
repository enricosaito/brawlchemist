import "server-only"

import { desc, eq } from "drizzle-orm"
import { unstable_cache } from "next/cache"
import { db } from "@/lib/db"
import { esportsMatches } from "@/lib/db/schema"
import { failOpen } from "@/lib/sync/fail-open"

/**
 * A pro's tournament matches, newest first.
 *
 * One indexed read on `esports_matches_player_idx`, which is
 * `(brawlhalla_id, started_at DESC NULLS LAST)` — so the ORDER BY here has to
 * spell out `NULLS LAST` to match it. A bare `DESC` means NULLS FIRST and drops
 * the planner onto a heap scan (cardinal constraint #8, measured elsewhere in
 * this codebase at 1.9s against 0.05ms).
 *
 * Columns are listed rather than selected with `*`: there is no jsonb on this
 * table, but the habit is what keeps the egress budget intact, and a row is
 * already small enough that a player's whole career fits in one response.
 *
 * Cached per player. Tournament results are immutable once an event completes —
 * the only thing that changes is a new event appearing, which the sync script
 * writes and which a day-long window picks up soon enough for something that
 * happens a handful of times a year.
 */
export const ESPORTS_MATCHES_TAG = "esports-matches"

const CACHE_SECONDS = 6 * 60 * 60

export interface EsportsMatch {
  id: string
  matchId: string
  tournamentId: string
  tournamentName: string | null
  year: number | null
  mode: string | null
  bracket: string | null
  roundTitle: string | null
  bestOf: number | null
  startedAt: Date | null
  won: boolean | null
  /**
   * Games won and lost in the series, from Challengermode's inner Match — the
   * real thing, not the MatchSeries' own 1-0 "won the set" placeholder, which
   * is what a maximum of 1 across the pair still means.
   */
  scoreFor: number | null
  scoreAgainst: number | null
  opponentName: string | null
  opponentIds: number[]
  teammateName: string | null
  /** Roster slugs, in game order, for this player and the other side. */
  legends: string[]
  opponentLegends: string[]
  /** How many games the set actually went — see the column note. */
  gamesPlayed: number | null
  durationSeconds: number | null
  /** The partner's ids, so a 2v2 row can link both halves of the team. */
  teammateIds: number[]
  /** Where this player finished the tournament: 1, 2, 3, 5, 7, 9, 13… */
  placementRank: number | null
  /** Challengermode's own string, which may be a range ("5 - 6"). */
  placementDisplay: string | null
}

const readMatches = unstable_cache(
  async (brawlhallaId: number): Promise<EsportsMatch[]> => {
    const rows = await db()
      .select({
        id: esportsMatches.id,
        matchId: esportsMatches.matchId,
        tournamentId: esportsMatches.tournamentId,
        tournamentName: esportsMatches.tournamentName,
        year: esportsMatches.year,
        mode: esportsMatches.mode,
        bracket: esportsMatches.bracket,
        roundTitle: esportsMatches.roundTitle,
        bestOf: esportsMatches.bestOf,
        startedAt: esportsMatches.startedAt,
        won: esportsMatches.won,
        scoreFor: esportsMatches.scoreFor,
        scoreAgainst: esportsMatches.scoreAgainst,
        opponentName: esportsMatches.opponentName,
        opponentIds: esportsMatches.opponentIds,
        teammateName: esportsMatches.teammateName,
        legends: esportsMatches.legends,
        opponentLegends: esportsMatches.opponentLegends,
        gamesPlayed: esportsMatches.gamesPlayed,
        durationSeconds: esportsMatches.durationSeconds,
        teammateIds: esportsMatches.teammateIds,
        placementRank: esportsMatches.placementRank,
        placementDisplay: esportsMatches.placementDisplay,
      })
      .from(esportsMatches)
      .where(eq(esportsMatches.brawlhallaId, brawlhallaId))
      .orderBy(desc(esportsMatches.startedAt))
    return rows.map((r) => ({
      ...r,
      opponentIds: r.opponentIds ?? [],
      legends: r.legends ?? [],
      opponentLegends: r.opponentLegends ?? [],
      teammateIds: r.teammateIds ?? [],
    }))
  },
  // v2: score_for/score_against changed meaning — they held the series-level
  // 1-0 "won the set" placeholder and now hold the real games off the inner
  // Match. Rows cached under v1 would keep serving the placeholder for six
  // hours after a deploy, so the key moves with the semantics.
  ["esports-matches-v2"],
  { tags: [ESPORTS_MATCHES_TAG], revalidate: CACHE_SECONDS }
)

/**
 * Fails open to "no matches", which renders as no tab at all.
 *
 * The wrapper is outside `unstable_cache` deliberately: a catch *inside* would
 * store the empty list and serve it as fact for six hours, which is the shape
 * that once emptied every pro handle on the site for an hour (cardinal
 * constraint #5). A thrown error is not cached, so the first success repairs it.
 */
export async function getEsportsMatches(
  brawlhallaId: number
): Promise<EsportsMatch[]> {
  return failOpen(
    `[esports-matches ${brawlhallaId}]`,
    () => readMatches(brawlhallaId),
    []
  )
}

/** Win–loss across everything we hold, ignoring the undecided. */
export function esportsRecord(matches: EsportsMatch[]): {
  wins: number
  losses: number
} {
  let wins = 0
  let losses = 0
  for (const m of matches) {
    if (m.won === true) wins++
    else if (m.won === false) losses++
  }
  return { wins, losses }
}
