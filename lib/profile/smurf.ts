/**
 * "Possible smurf" — a high ladder rating on an account too young to have
 * earned it.
 *
 * Three facts have to agree, and each one covers a way the other two lie:
 *
 *   rating   — a smurf is only interesting near the top. Below this the
 *              combination is just a normal player who is good.
 *   level    — account level is the game's own progress meter, and it is
 *              cumulative across every mode, so it cannot be farmed down.
 *   playtime — lifetime seconds in matches, summed across legends. This is the
 *              one that actually separates a smurf from a returning veteran:
 *              a veteran who reset has the hours, a smurf does not.
 *
 * Deliberately called *possible*. There is no fact in the Brawlhalla API that
 * proves a second account — no creation date, no linked identity (see the note
 * in lib/profile/achievements.ts) — so this is an observation about a record,
 * not an accusation about a person, and the tooltip says so in those words. A
 * prodigy who is genuinely that good in 200 hours lands here, and that is a
 * fair reading of what the numbers say.
 *
 * A **verified pro never does**, and that exception lives in `getSmurfIds`
 * (lib/sync/smurf.ts) rather than in this predicate, because it is not a fact
 * about the record — it is a fact about the profile, curated by hand. A known
 * competitor on a new account satisfies every number here, and the badge that
 * says we know who this is outranks the one that says we cannot account for
 * them. The profile page runs the same check where it computes the answer live.
 *
 * All three must be known. A null level or playtime means nobody has read this
 * player's /player/{id}/stats yet, and "we haven't looked" is not "they're
 * clean" — so an unknown fact returns false rather than defaulting to zero,
 * which would flag every unvisited account on the ladder.
 *
 * Plain module on purpose: the thresholds are quoted in the tooltip, the SQL
 * that builds the cached id set, and the backfill script, and a number that
 * lives in three places drifts.
 */

/** Account level at or under which the record looks too young for the rating. */
export const SMURF_MAX_LEVEL = 75

/** Lifetime hours in matches, all modes, at or under which the same holds. */
export const SMURF_MAX_PLAYTIME_HOURS = 200

/** Below this the combination isn't remarkable, so nothing is said. */
export const SMURF_MIN_RATING = 2300

export const SMURF_MAX_PLAYTIME_SECONDS = SMURF_MAX_PLAYTIME_HOURS * 3600

export interface SmurfFacts {
  /** Season 1v1 rating. */
  rating: number | null | undefined
  /** Account level from GetPlayerStats. */
  level: number | null | undefined
  /** Lifetime hours across every legend, all modes. */
  playtimeHours: number | null | undefined
}

export function isPossibleSmurf({
  rating,
  level,
  playtimeHours,
}: SmurfFacts): boolean {
  if (rating == null || level == null || playtimeHours == null) return false
  return (
    rating >= SMURF_MIN_RATING &&
    level <= SMURF_MAX_LEVEL &&
    playtimeHours <= SMURF_MAX_PLAYTIME_HOURS
  )
}

/**
 * The one sentence this shows anywhere it renders.
 *
 * States the evidence rather than the conclusion, because the evidence is the
 * part we can stand behind.
 */
export const SMURF_TOOLTIP = `Possible smurf — ${SMURF_MIN_RATING.toLocaleString()}+ elo on an account at level ${SMURF_MAX_LEVEL} or below with under ${SMURF_MAX_PLAYTIME_HOURS} hours played. Not a verdict, just an unusual record.`

export const SMURF_LABEL = "Possible Smurf"
