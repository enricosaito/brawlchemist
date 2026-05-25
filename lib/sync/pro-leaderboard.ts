import "server-only"

import { unstable_cache } from "next/cache"
import {
  getPlayerRanked,
  type ApiRegion,
  type RankedEntry,
} from "@/lib/brawlhalla-api"
import { listOverrides } from "@/lib/sync/player-overrides"

/**
 * Verified pros in a region as leaderboard rows, sorted by current 1v1 rating.
 *
 * "Pro" is our own data (the player_overrides table), so the API can't filter
 * by it — we take every verified pro, fetch their live ranked standing, keep
 * the ones in the requested region, and rank them. Cached for 5 min and tagged
 * `player-overrides` so editing the pro list refreshes the board.
 */
async function fetchProLeaderboard(region: ApiRegion): Promise<RankedEntry[]> {
  const overrides = await listOverrides()
  const proIds = overrides.filter((o) => o.pro).map((o) => o.brawlhallaId)
  if (proIds.length === 0) return []

  const ranked = await Promise.all(proIds.map((id) => getPlayerRanked(id)))
  return ranked
    .map((res) => (res.ok && res.data?.name ? res.data : null))
    .filter((d): d is NonNullable<typeof d> => !!d)
    .filter((d) => d.region === region)
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
        tier: d.tier ?? null,
      }),
    )
}

export const getProLeaderboard = unstable_cache(
  fetchProLeaderboard,
  ["pro-leaderboard"],
  { tags: ["player-overrides"], revalidate: 300 },
)
