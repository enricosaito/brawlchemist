import type { Tier } from "./types"

/**
 * Tier derivation shared across the leaderboard, OTPs, and player profile.
 *
 * The Brawlhalla `/ranked` endpoints cap at "Diamond" and never return
 * "Valhallan" — even for 2800-rated accounts — so we derive Valhallan from
 * rating. Leaderboard tiers also arrive with a division suffix ("Gold 3"),
 * which we strip to the base tier.
 */
export const VALHALLAN_THRESHOLD = 2000

export const KNOWN_TIERS: readonly Tier[] = [
  "Tin",
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Diamond",
  "Valhallan",
]

export function deriveTier(
  apiTier: string | null,
  rating: number | null,
): Tier | null {
  if (rating != null && rating >= VALHALLAN_THRESHOLD) return "Valhallan"
  if (!apiTier) return null
  const base = apiTier.split(" ")[0]
  return (KNOWN_TIERS as readonly string[]).includes(base)
    ? (base as Tier)
    : null
}

export function tierLabel(apiTier: string | null, rating: number | null): string {
  if (rating != null && rating >= VALHALLAN_THRESHOLD) return "Valhallan"
  if (!apiTier) return "—"
  return apiTier.split(" ")[0]
}
