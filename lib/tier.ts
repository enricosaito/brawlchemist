import type { Tier } from "./types"

/**
 * Tier derivation shared across the leaderboard, OTPs, and player profile.
 *
 * Brawlhalla's `/ranked` endpoints cap at "Diamond" and never return
 * "Valhallan" — Diamond simply *starts* at 2000, so a fixed 2000 threshold
 * mislabels every Diamond. Valhallan is instead the top of each region's
 * ladder (top 150 NA/EU, 100 BRZ, 50 SEA/US-W, 25 AUS/JPN/ME/SA) among players
 * with 100+ wins — which the *leaderboard* endpoint does label. We can't replay
 * that top-N rule from a single profile, but `getValhallanCutoff` reads the
 * leaderboard and returns the lowest Valhallan's rating per region. A player
 * therefore clears Valhallan when their rating meets that regional cutoff (and
 * they have the required wins).
 *
 * Leaderboard tiers also arrive with a division suffix ("Gold 3"), stripped to
 * the base tier here.
 */
export const VALHALLAN_MIN_WINS = 100

export const KNOWN_TIERS: readonly Tier[] = [
  "Tin",
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Diamond",
  "Valhallan",
]

/**
 * Whether a player currently clears their region's Valhallan cutoff. `cutoff`
 * is the lowest Valhallan rating in that region (from the live leaderboard);
 * pass null when unknown (no cutoff data, or a region we don't track) so we
 * fall back to the API tier rather than guessing Valhallan. `wins` is checked
 * against the 100-win requirement only when provided.
 */
export function isValhallan(
  rating: number | null | undefined,
  cutoff: number | null | undefined,
  wins?: number | null,
): boolean {
  if (cutoff == null || rating == null) return false
  if (rating < cutoff) return false
  if (wins != null && wins < VALHALLAN_MIN_WINS) return false
  return true
}

export function deriveTier(
  apiTier: string | null,
  valhallan: boolean,
): Tier | null {
  if (valhallan) return "Valhallan"
  if (!apiTier) return null
  const base = apiTier.split(" ")[0]
  return (KNOWN_TIERS as readonly string[]).includes(base)
    ? (base as Tier)
    : null
}

export function tierLabel(apiTier: string | null, valhallan: boolean): string {
  if (valhallan) return "Valhallan"
  if (!apiTier) return "—"
  return apiTier.split(" ")[0]
}

/**
 * A "Fallen Valhallan" reached Valhallan (their peak cleared the region cutoff,
 * with the 100-win requirement) but has since dropped back to Diamond — i.e.
 * their *peak* clears the cutoff while their *current* rating does not, and
 * they're still Diamond now (the tier you land in just below the cutoff).
 */
export function isFallenValhallan(
  apiTier: string | null,
  rating: number | null | undefined,
  peakRating: number | null | undefined,
  cutoff: number | null | undefined,
  wins?: number | null,
): boolean {
  if (isValhallan(rating, cutoff, wins)) return false
  if (!isValhallan(peakRating, cutoff, wins)) return false
  return deriveTier(apiTier, false) === "Diamond"
}
