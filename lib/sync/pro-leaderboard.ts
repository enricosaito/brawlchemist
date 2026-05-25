import "server-only"

import { unstable_cache } from "next/cache"
import {
  getPlayerRanked,
  isApiRegion,
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
 * Verified pros as leaderboard rows, sorted by current 1v1 rating.
 *
 * "Pro" is our own data (player_overrides), so the API can't filter by it — we
 * take every verified pro, fetch their live ranked standing in batches, then
 * scope + rank. `region` of "ALL" keeps every region; a specific region filters
 * to it. `limit` caps the rows. The /ranked endpoint caps at Diamond, so the
 * real Valhallan tier is derived from each player's region cutoff. Cached 5 min,
 * tagged `player-overrides`.
 */
async function fetchProLeaderboard(
  region: ApiRegion,
  limit?: number,
): Promise<RankedEntry[]> {
  const overrides = await listOverrides()
  const proIds = overrides.filter((o) => o.pro).map((o) => o.brawlhallaId)
  if (proIds.length === 0) return []

  const players: PlayerRanked[] = []
  for (let i = 0; i < proIds.length; i += BATCH) {
    const chunk = proIds.slice(i, i + BATCH)
    const results = await Promise.all(chunk.map((id) => getPlayerRanked(id)))
    for (const res of results) if (res.ok && res.data?.name) players.push(res.data)
  }

  const inScope =
    region === "ALL" ? players : players.filter((d) => d.region === region)
  if (inScope.length === 0) return []

  // Region cutoffs distinguish Valhallan from Diamond. For "ALL" we need every
  // region present; for a single region, just that one.
  const regionsNeeded: ApiRegion[] =
    region === "ALL"
      ? [
          ...new Set(
            inScope
              .map((d) => d.region)
              .filter(
                (r): r is ApiRegion => !!r && r !== "ALL" && isApiRegion(r),
              ),
          ),
        ]
      : [region]
  const cutoffByRegion = new Map<string, number>()
  await Promise.all(
    regionsNeeded.map(async (r) => {
      const c = await getValhallanCutoff("1v1", r)
      if (c) cutoffByRegion.set(r, c.rating)
    }),
  )

  const ranked = [...inScope].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
  const top = typeof limit === "number" ? ranked.slice(0, limit) : ranked
  return top.map((d, i): RankedEntry => {
    const cutoff = d.region ? cutoffByRegion.get(d.region) ?? null : null
    return {
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
    }
  })
}

export const getProLeaderboard = unstable_cache(
  fetchProLeaderboard,
  ["pro-leaderboard"],
  { tags: ["player-overrides"], revalidate: 300 },
)
