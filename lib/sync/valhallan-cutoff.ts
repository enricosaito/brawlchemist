import "server-only"

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

/**
 * Walk the leaderboard for a single (queue, region) until tier drops off
 * Valhallan. Returns the lowest-rated Valhallan and the total count. Returns
 * null if no Valhallans exist (e.g. quiet region).
 *
 * Uses the same /v1/leaderboard/ranked endpoint as the discovery sweep —
 * fetch revalidate=300 means the page-1 hit is shared cache.
 */
export async function getValhallanCutoff(
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
