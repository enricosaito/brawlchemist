import "server-only"

import { unstable_cache } from "next/cache"
import {
  getPlayerRanked,
  type ApiRegion,
  type PlayerRanked,
  type RankedEntry,
} from "@/lib/brawlhalla-api"
import { listOverrides } from "@/lib/sync/player-overrides"
import { getValhallanCutoff } from "@/lib/sync/valhallan-cutoff"
import { isValhallan } from "@/lib/tier"

// Fetch a few pros at a time. The Brawlhalla API rate-limits bursts, so firing
// all 30+ requests at once silently drops some — small batches avoid that.
const BATCH = 5

/**
 * Verified pros in a region as leaderboard rows, sorted by current 1v1 rating.
 *
 * "Pro" is our own data (player_overrides), so the API can't filter by it — we
 * take every verified pro, fetch their live ranked standing in batches, keep
 * the ones in the requested region, and rank them. The /ranked endpoint caps at
 * Diamond, so the real Valhallan tier is derived from the region cutoff (same
 * rule as the rest of the app). Cached 5 min, tagged `player-overrides`.
 */
async function fetchProLeaderboard(region: ApiRegion): Promise<RankedEntry[]> {
  const overrides = await listOverrides()
  const proIds = overrides.filter((o) => o.pro).map((o) => o.brawlhallaId)
  if (proIds.length === 0) return []

  const players: PlayerRanked[] = []
  for (let i = 0; i < proIds.length; i += BATCH) {
    const chunk = proIds.slice(i, i + BATCH)
    const results = await Promise.all(chunk.map((id) => getPlayerRanked(id)))
    for (const res of results) {
      if (res.ok && res.data?.name) players.push(res.data)
    }
  }

  const inRegion = players.filter((d) => d.region === region)
  if (inRegion.length === 0) return []

  // Region cutoff distinguishes Valhallan from Diamond (both 2000+).
  const cutoff = (await getValhallanCutoff("1v1", region))?.rating ?? null

  return inRegion
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .map(
      (d, i): RankedEntry => ({
        players: [{ id: d.brawlhalla_id, username: d.name }],
        best_rating: d.peak_rating ?? null,
        rank: i + 1,
        rating: d.rating ?? null,
        wins: d.wins ?? null,
        losses:
          typeof d.games === "number" && typeof d.wins === "number"
            ? Math.max(0, d.games - d.wins)
            : null,
        region: d.region ?? null,
        tier: isValhallan(d.rating, cutoff, d.wins) ? "Valhallan" : d.tier,
      }),
    )
}

export const getProLeaderboard = unstable_cache(
  fetchProLeaderboard,
  ["pro-leaderboard"],
  { tags: ["player-overrides"], revalidate: 300 },
)
