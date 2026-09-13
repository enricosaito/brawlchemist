import "server-only"

import { unstable_cache } from "next/cache"
import {
  API_REGIONS,
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
  /**
   * Brawlhalla ids the live ladder itself calls Valhallan.
   *
   * The rating comparison this cutoff exists for is only a fallback — it pits
   * a player's *stored* rating against a cutoff refreshed hourly, so anyone
   * who climbed since their last sync is judged on an old number against a new
   * bar and silently shown as Diamond. Membership here is the ladder's own
   * answer and can't go stale that way.
   *
   * An array rather than a Set because unstable_cache round-trips through
   * JSON. Covers the pages the walk below visits (the top ~50 per region),
   * which is every Valhallan — the walk stops when the tier runs out.
   */
  ids: number[]
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
  const ids: number[] = []

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
      // Every player on the entry: 1v1 rows carry one, 2v2 rows carry both,
      // and for a team both members hold the tier.
      for (const p of entry.players) {
        if (p.id > 0) ids.push(p.id)
      }
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
    ids,
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
 * Every brawlhalla id the live ladder calls Valhallan, across all regions.
 *
 * A player's stored region is where they mostly play, not the only ladder they
 * can be Valhallan on — a US-E regular who ranks on EU is Valhallan, and
 * checking only their own region's cutoff renders them Diamond. Region is also
 * the wrong key for the question "is this player Valhallan": the ladder
 * already answered it, and it answered per ladder, not per player.
 *
 * Cost is amortised, not new: this composes the per-region cutoffs that are
 * each already cached for an hour and already fetched by the leaderboard, OTP
 * and profile pages, so a warm cache costs nothing upstream. The union itself
 * is cached so the composition happens once an hour globally rather than per
 * render.
 */
async function computeValhallanIds(gameMode: ApiGameMode): Promise<number[]> {
  const regions = API_REGIONS.filter((r) => r !== "ALL")
  const cutoffs = await Promise.all(
    regions.map((r) => getValhallanCutoff(gameMode, r)),
  )
  const ids = new Set<number>()
  for (const c of cutoffs) {
    for (const id of c?.ids ?? []) ids.add(id)
  }
  return [...ids]
}

/** Cached union of Valhallan ids for a queue. Array, because the cache is JSON. */
export const getValhallanIds = unstable_cache(
  computeValhallanIds,
  ["valhallan-ids"],
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
