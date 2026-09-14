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

/**
 * Fixed rating floor of each tier (Valhallan has none — it's a regional top-N
 * with a moving cutoff, see above). Used for the rating-history chart's
 * threshold lines.
 */
export const TIER_FLOOR: Record<Exclude<Tier, "Valhallan">, number> = {
  Tin: 200,
  Bronze: 910,
  Silver: 1130,
  Gold: 1390,
  Platinum: 1680,
  Diamond: 2000,
}

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
 * Rating at which we call someone Valhallan *without* a cutoff to compare
 * against.
 *
 * A safety net, not a shortcut. When `getValhallanCutoff` can't answer — the
 * API is down, the region doesn't resolve, the hourly cache is cold — the
 * honest answer used to be "not Valhallan", which showed a 2,900-rated player
 * as Diamond. Rating alone can't decide the question in general (Valhallan is
 * a regional top-N, and the boundary moves all season: US-E was 2,485 one day
 * and 2,525 the next), so this only applies where there is nothing better.
 *
 * Deliberately conservative. Real cutoffs routinely sit ABOVE this — EU 2,560,
 * AUS 2,547, US-E 2,525, BRZ 2,505 as measured — so applying it as an
 * override rather than a fallback would promote high Diamonds instead: 117
 * players on the day it was measured, and more as cutoffs climb. Below the
 * cutoff it is only ever consulted when the cutoff is absent, where being
 * generous to a 2,500-rated player is the better failure.
 */
export const VALHALLAN_FALLBACK_RATING = 2500

/**
 * Whether a player currently clears their region's Valhallan cutoff. `cutoff`
 * is the lowest Valhallan rating in that region (from the live leaderboard);
 * pass null when it's unknown, and the rating falls back to
 * VALHALLAN_FALLBACK_RATING rather than reporting a false negative. `wins` is
 * checked against the 100-win requirement in both cases.
 */
export function isValhallan(
  rating: number | null | undefined,
  cutoff: number | null | undefined,
  wins?: number | null,
): boolean {
  if (rating == null) return false
  if (wins != null && wins < VALHALLAN_MIN_WINS) return false
  if (cutoff == null) return rating >= VALHALLAN_FALLBACK_RATING
  return rating >= cutoff
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
