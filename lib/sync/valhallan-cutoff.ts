import "server-only"

import { unstable_cache } from "next/cache"
import {
  type ApiGameMode,
  type ApiRegion,
  getRankedLeaderboard,
} from "@/lib/brawlhalla-api"

export interface ValhallanCutoff {
  region: ApiRegion
  /** Rating of the lowest-ranked Valhallan-tier player in the region. */
  rating: number
  /** Leaderboard rank of that player (their place among all ranked players). */
  rank: number
  /** Total Valhallans found in the region for this queue. */
  count: number
  username: string
}

const PAGE_SIZE = 50
// Valhallan ladders cap around 150 in NA/EU; 6 pages × 50 is a generous safety.
const MAX_PAGES = 6

// Cutoffs move slowly (a tier boundary shifts only as the lowest Valhallan
// gains/loses rating), but recomputing one means walking several leaderboard
// pages — and the profile, OG-image, leaderboard, and OTP pages all ask for
// them, the OTP "ALL" view across every region at once. Caching the *result*
// (not just the underlying fetches) collapses that to one walk per region per
// hour globally, instead of one per render. This was the dominant on-demand
// drain on the Brawlhalla API rate limit.
const CUTOFF_TTL_SECONDS = 60 * 60

/**
 * Walk the leaderboard for a single (queue, region) until tier drops off
 * Valhallan. Returns the lowest-rated Valhallan and the total count. Returns
 * null if no Valhallans exist (e.g. quiet region).
 *
 * Uses the same /v1/leaderboard/ranked endpoint as the discovery sweep —
 * fetch revalidate=300 means the page-1 hit is shared cache.
 */
async function computeValhallanCutoff(
  gameMode: ApiGameMode,
  region: ApiRegion,
): Promise<ValhallanCutoff | null> {
  let lastValhallan: {
    rating: number
    rank: number
    username: string
  } | null = null
  let count = 0

  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await getRankedLeaderboard({
      gameMode,
      region,
      page,
      maxResults: PAGE_SIZE,
    })
    if (!res.ok) break

    const valhallans = res.data.rankings.filter((r) => r.tier === "Valhallan")
    for (const entry of valhallans) {
      const username = entry.players[0]?.username
      if (entry.rating != null && username) {
        lastValhallan = {
          rating: entry.rating,
          rank: entry.rank,
          username,
        }
      }
    }
    count += valhallans.length

    // Stop when the page included any non-Valhallan (ladder dropped off tier)
    // or when we've exhausted pagination.
    if (
      valhallans.length < res.data.rankings.length ||
      page >= res.data.total_pages
    ) {
      break
    }
  }

  if (!lastValhallan) return null
  return {
    region,
    rating: lastValhallan.rating,
    rank: lastValhallan.rank,
    count,
    username: lastValhallan.username,
  }
}

/**
 * Cutoff for a single (queue, region), cached for an hour. The cache key
 * includes the arguments, so each (gameMode, region) pair is memoized
 * separately and shared across every page that asks for it.
 */
export const getValhallanCutoff = unstable_cache(
  computeValhallanCutoff,
  ["valhallan-cutoff"],
  { revalidate: CUTOFF_TTL_SECONDS },
)

/**
 * Convenience: fetch cutoffs for many regions in parallel.
 */
export async function getValhallanCutoffs(
  gameMode: ApiGameMode,
  regions: readonly ApiRegion[],
): Promise<Map<ApiRegion, ValhallanCutoff>> {
  const entries = await Promise.all(
    regions.map(async (r) => [r, await getValhallanCutoff(gameMode, r)] as const),
  )
  const map = new Map<ApiRegion, ValhallanCutoff>()
  for (const [r, c] of entries) {
    if (c) map.set(r, c)
  }
  return map
}
