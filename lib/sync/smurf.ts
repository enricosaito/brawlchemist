import "server-only"

import { and, eq, gte, lte } from "drizzle-orm"
import { unstable_cache } from "next/cache"
import { db } from "@/lib/db"
import { failOpen } from "@/lib/sync/fail-open"
import { getProfilesMap } from "@/lib/sync/profiles"
import { players } from "@/lib/db/schema"
import {
  SMURF_MAX_LEVEL,
  SMURF_MAX_PLAYTIME_SECONDS,
  SMURF_MIN_RATING,
  type SmurfEvidence,
} from "@/lib/profile/smurf"

/**
 * Who currently reads as a possible smurf, as one cached map from id to the
 * two facts that earned it.
 *
 * Same shape as getFlairMap, and for the same reason: every list view on the
 * site needs an answer per row, and a read per row is exactly the pattern that
 * has blown the egress budget three times. This asks the whole question once
 * and shares the answer.
 *
 * A map rather than a set because the tag's tooltip quotes the player's own
 * level and hours (lib/profile/smurf.ts). Those two facts are the columns the
 * predicate already filters on, so carrying them out costs two inline ints per
 * matching row — and the tag is rare by design (level ≤ 75 is the binding
 * half), so "matching rows" is a few hundred (249 measured), not thousands.
 *
 * Cheap despite living on `players` (cardinal constraint #6). The rating filter
 * is served by `players_rating_idx` and narrows ~90k rows to the couple of
 * thousand above the threshold; the other two columns are inline ints, so
 * nothing detoasts `ranked_json` and what crosses the wire is a short list of
 * three-integer rows.
 *
 * The predicate is expressed in SQL rather than by filtering in JS on purpose:
 * doing it here would mean shipping every 2,300+ player's level and playtime to
 * the server on every cache miss to throw almost all of them away.
 *
 * Fails open to an empty map — no tag anywhere beats a broken leaderboard.
 */
export const SMURF_SET_TAG = "smurf-set"

/** id → evidence. `.has(id)` still answers the yes/no question. */
export type SmurfMap = Map<number, SmurfEvidence>

const getSmurfRows = unstable_cache(
  async (): Promise<[number, SmurfEvidence][]> => {
    const rows = await db()
      .select({
        brawlhallaId: players.brawlhallaId,
        level: players.level,
        playtimeSeconds: players.playtimeSeconds,
      })
      .from(players)
      .where(
        and(
          gte(players.rating, SMURF_MIN_RATING),
          lte(players.level, SMURF_MAX_LEVEL),
          lte(players.playtimeSeconds, SMURF_MAX_PLAYTIME_SECONDS)
        )
      )
    // The WHERE already proved both columns non-null; the guard is for the
    // type, not the data. Rounded to whole hours here so every surface prints
    // the same number the profile's Account section does.
    return rows.flatMap((r) =>
      r.level == null || r.playtimeSeconds == null
        ? []
        : [
            [
              r.brawlhallaId,
              {
                level: r.level,
                playtimeHours: Math.round(r.playtimeSeconds / 3600),
              },
            ] as [number, SmurfEvidence],
          ]
    )
  },
  ["smurf-set"],
  { tags: [SMURF_SET_TAG], revalidate: 300 }
)

/**
 * A verified pro is never a possible smurf, and the subtraction happens HERE.
 *
 * The rule reads a record, and "possible smurf" is shorthand for "we can't
 * account for this record" — but a verified pro is an account we *have*
 * accounted for, by hand, in the profiles table. A known competitor on a new
 * account satisfies every number in the rule (high rating, low level, few
 * hours) and is the one case where the tag is simply wrong, so the badge that
 * says we know who this is outranks the one that says we don't.
 *
 * Fourteen surfaces call this and each of them does `smurfs.get(id)`; doing
 * the check at those call sites instead is the shape CLAUDE.md already warns
 * about, where the twelfth one to be forgotten quietly tags a pro. Subtracting
 * from the map is the only edit that reaches all of them at once — the profile
 * page is the sole caller that can compute the answer without this map, and it
 * runs the same check itself.
 *
 * Free: getProfilesMap is cached 300s and every one of those surfaces already
 * reads it to render the handle the tag would be sitting next to, so this is a
 * cache hit rather than a query. It stays outside the cached row list on
 * purpose — the list is a fact about records and should not be invalidated by
 * a verification, and a failed profiles read must not be able to poison it
 * (cardinal constraint #5).
 */
export async function getSmurfMap(): Promise<SmurfMap> {
  const [rows, profiles] = await Promise.all([
    failOpen("[smurf] evidence rows", getSmurfRows, []),
    // Already failOpen-wrapped; an empty map means nobody is subtracted, which
    // is the same answer this function gave before pros were excluded.
    getProfilesMap(),
  ])
  const out: SmurfMap = new Map(rows)
  for (const [id, p] of profiles) if (p.verified) out.delete(id)
  return out
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
