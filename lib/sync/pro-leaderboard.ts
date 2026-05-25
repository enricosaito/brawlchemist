import "server-only"

import { unstable_cache } from "next/cache"
import {
  isApiRegion,
  type ApiRegion,
  type PlayerRanked,
  type RankedEntry,
} from "@/lib/brawlhalla-api"
import { listOverrides } from "@/lib/sync/player-overrides"
import { getPlayersByIds } from "@/lib/sync/players"
import { getValhallanCutoff } from "@/lib/sync/valhallan-cutoff"
import { isValhallan } from "@/lib/tier"

/**
 * Verified pros as leaderboard rows, sorted by current 1v1 rating.
 *
 * Reads pros' standings from the cached `players` table — populated by the
 * sync-pros cron and on registration — so it never bursts the Brawlhalla API
 * (live-fetching 50 pros per request was getting rate-limited). `region` of
 * "ALL" keeps every region; a specific region filters to it. The /ranked
 * payload caps at Diamond, so the real Valhallan tier is derived from each
 * player's region cutoff. Cached 5 min, tagged `player-overrides`.
 */
async function fetchProLeaderboard(region: ApiRegion): Promise<RankedEntry[]> {
  const overrides = await listOverrides()
  const proIds = overrides.filter((o) => o.pro).map((o) => o.brawlhallaId)
  if (proIds.length === 0) return []

  const rowsById = await getPlayersByIds(proIds)
  const data = proIds
    .map((id) => rowsById.get(id)?.rankedJson as PlayerRanked | undefined)
    .filter((d): d is PlayerRanked => !!d && !!d.name)

  const inScope =
    region === "ALL" ? data : data.filter((d) => d.region === region)
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

  return [...inScope]
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .map((d, i): RankedEntry => {
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
