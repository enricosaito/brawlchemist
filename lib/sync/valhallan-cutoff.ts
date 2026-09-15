import "server-only"

import { unstable_cache } from "next/cache"
import {
  API_REGIONS,
  type ApiGameMode,
  type ApiRegion,
  getRankedLeaderboard,
} from "@/lib/brawlhalla-api"
import {
  readValhallanMemberCount,
  readValhallanMembers,
} from "@/lib/sync/valhallan"

export interface ValhallanCutoff {
  region: ApiRegion
  /**
   * Where the region's *solid* Valhallan run ends — the rating of the last
   * Valhallan before the first non-Valhallan row on the ladder.
   *
   * Not "the lowest Valhallan": the tier is interleaved rather than a
   * contiguous prefix (see lib/db/schema.ts, valhallan_members), so the true
   * minimum on US-E is ~2,138 while rank 121 at 2,507 is not Valhallan. A
   * threshold set at the minimum would promote every 2,138+ Diamond in the
   * region — hundreds of players — which is far worse than the handful this
   * under-promotes. As the answer to "what rating do I need", the end of the
   * unbroken run is also the honest one.
   *
   * Membership proper is settled by `ids`, not by comparing against this.
   */
  rating: number
  /** Leaderboard rank of that player (their place among all ranked players). */
  rank: number
  /**
   * Valhallans in the region for this queue. Read from the daily
   * valhallan_members walk when it's available — the prefix this walk sees is
   * only ~65% of the population — and falls back to the prefix count.
   */
  count: number
  username: string
  /**
   * Brawlhalla ids the live ladder itself calls Valhallan, from the prefix
   * this walk covers.
   *
   * The rating comparison this cutoff exists for is only a fallback — it pits
   * a player's *stored* rating against a cutoff refreshed hourly, so anyone
   * who climbed since their last sync is judged on an old number against a new
   * bar and silently shown as Diamond. Membership here is the ladder's own
   * answer and can't go stale that way.
   *
   * These are the hourly-fresh top of the ladder; the complete set (including
   * the interleaved tail) comes from valhallan_members and the two are unioned
   * in computeValhallanIds. An array rather than a Set because unstable_cache
   * round-trips through JSON.
   */
  ids: number[]
}

const PAGE_SIZE = 50
// The unbroken run ends by rank ~120 on the deepest ladder (US-E) and inside
// rank 50 on the quiet ones, so this only ever binds if the API starts
// returning a very different shape.
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
 * Walk the leaderboard for a single (queue, region) and return where the
 * unbroken Valhallan run ends. Null if the region has no Valhallans at all.
 *
 * Reads rows one at a time and stops at the FIRST non-Valhallan, rather than
 * at the first page containing one. The old page-granular version kept every
 * Valhallan on the page it broke on and reported the last of them as the
 * cutoff, which is neither end of anything: on US-E it claimed rank 150 /
 * 2,486 when the run actually ends at rank 120 / 2,508, and called 125 the
 * regional total when the real population is 180+.
 *
 * Deliberately does NOT walk the interleaved tail. That's a much deeper walk
 * (6-8 pages on the big ladders, per region, per queue) and it is already
 * paid for once a day by refreshValhallanMembers — this one sits behind page
 * renders and has to stay cheap. Costs the same 1-3 pages per region it
 * always did.
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
  const ids: number[] = []

  walk: for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await getRankedLeaderboard({
      gameMode,
      region,
      page,
      maxResults: PAGE_SIZE,
    })
    if (!res.ok) break

    for (const entry of res.data.rankings) {
      if (entry.tier !== "Valhallan") break walk
      // Every player on the entry: 1v1 rows carry one, 2v2 rows carry both,
      // and for a team both members hold the tier.
      for (const p of entry.players) {
        if (p.id > 0) ids.push(p.id)
      }
      const username = entry.players[0]?.username
      if (entry.rating != null && username) {
        lastValhallan = { rating: entry.rating, rank: entry.rank, username }
      }
    }

    if (page >= res.data.total_pages) break
  }

  if (!lastValhallan) return null

  // The chip's "N Valhallans total" has to be the region's real population,
  // not the length of the prefix above — those differ by ~35%.
  const stored = await readValhallanMemberCount(gameMode, region)
  return {
    region,
    rating: lastValhallan.rating,
    rank: lastValhallan.rank,
    count: stored ?? ids.length,
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
  const [stored, cutoffs] = await Promise.all([
    // The complete population, including the interleaved tail the cutoff walk
    // deliberately doesn't reach. Refreshed daily by the sync-valhallan cron;
    // empty until its first run, which degrades to the prefix below rather
    // than to nothing.
    readValhallanMembers(gameMode),
    Promise.all(regions.map((r) => getValhallanCutoff(gameMode, r))),
  ])
  const ids = new Set<number>()
  for (const list of stored.values()) {
    for (const id of list) ids.add(id)
  }
  // Unioned, not preferred: the stored set is up to a day old, so someone who
  // reached Valhallan this morning is only in the hourly prefix. Union means
  // the two answers can only ever add to each other — the failure mode of
  // either going cold is a smaller set, never a wrong one.
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
