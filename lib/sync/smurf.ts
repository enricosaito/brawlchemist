import "server-only"

import { and, eq, gte, lte } from "drizzle-orm"
import { unstable_cache } from "next/cache"
import { db } from "@/lib/db"
import { failOpen } from "@/lib/sync/fail-open"
import { players } from "@/lib/db/schema"
import {
  SMURF_MAX_LEVEL,
  SMURF_MAX_PLAYTIME_SECONDS,
  SMURF_MIN_RATING,
} from "@/lib/profile/smurf"

/**
 * Who currently reads as a possible smurf, as one cached set of ids.
 *
 * Same shape as getFlairMap, and for the same reason: every list view on the
 * site needs an answer per row, and a read per row is exactly the pattern that
 * has blown the egress budget three times. This asks the whole question once
 * and shares the answer.
 *
 * Cheap despite living on `players` (cardinal constraint #6). The rating filter
 * is served by `players_rating_idx` and narrows ~90k rows to the couple of
 * thousand above the threshold; the other two columns are inline ints, so
 * nothing detoasts `ranked_json` and the result that crosses the wire is a
 * short list of integers rather than rows.
 *
 * The predicate is expressed in SQL rather than by filtering in JS on purpose:
 * doing it here would mean shipping every 2,300+ player's level and playtime to
 * the server on every cache miss to throw almost all of them away.
 *
 * Fails open to an empty set — no tag anywhere beats a broken leaderboard.
 */
export const SMURF_SET_TAG = "smurf-set"

const getSmurfIdList = unstable_cache(
  async (): Promise<number[]> => {
    const rows = await db()
        .select({ brawlhallaId: players.brawlhallaId })
        .from(players)
        .where(
          and(
            gte(players.rating, SMURF_MIN_RATING),
            lte(players.level, SMURF_MAX_LEVEL),
            lte(players.playtimeSeconds, SMURF_MAX_PLAYTIME_SECONDS)
          )
      )
    return rows.map((r) => r.brawlhallaId)
  },
  ["smurf-set"],
  { tags: [SMURF_SET_TAG], revalidate: 300 }
)

export async function getSmurfIds(): Promise<Set<number>> {
  return new Set(await failOpen("[smurf] id set", getSmurfIdList, []))
}

/**
 * Remember the two facts a /ranked payload doesn't carry.
 *
 * Called from the profile page behind `after()`, with a GetPlayerStats payload
 * the page had already fetched for the header — so this costs no Brawlhalla API
 * budget (cardinal constraint #1), exactly like the rating snapshot piggybacked
 * on `upsertPlayerRanked`. Coverage therefore follows attention: the players
 * anyone actually looks at are the players we can answer for, which is the same
 * set the tag matters on.
 *
 * An UPDATE, never an upsert. `players.username` is NOT NULL and powers search,
 * so inventing a row here would need a name this function doesn't have; a
 * player with no row yet is one whose /ranked upsert is landing in the same
 * request anyway.
 *
 * Deliberately does not bust SMURF_SET_TAG. The set is five minutes stale at
 * worst, and revalidating it on every profile view of every player would throw
 * away a cache that exists to be shared across every list view on the site.
 */
export async function recordPlayerStats(
  brawlhallaId: number,
  facts: { level: number; playtimeSeconds: number }
): Promise<void> {
  await db()
    .update(players)
    .set({
      level: facts.level,
      playtimeSeconds: facts.playtimeSeconds,
      statsSynced: new Date(),
    })
    .where(eq(players.brawlhallaId, brawlhallaId))
}
