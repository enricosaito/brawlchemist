import "server-only"

import { and, gte, inArray, sql } from "drizzle-orm"
import {
  API_REGIONS,
  type ApiGameMode,
  type ApiRegion,
  getRankedLeaderboard,
} from "@/lib/brawlhalla-api"
import { db } from "@/lib/db"
import { players } from "@/lib/db/schema"

const QUEUES: ApiGameMode[] = ["1v1", "2v2"]
const REGIONS: ApiRegion[] = (API_REGIONS as readonly ApiRegion[]).filter(
  (r) => r !== "ALL",
)

const PAGE_SIZE = 50
// Safety cap. Valhallan ladders are ~150 players per region in practice;
// 500 leaves enormous headroom while bounding worst-case API spend.
const MAX_PAGES = 10

/**
 * Paginate the ranked leaderboard for one (queue, region) until the tier
 * stops being Valhallan, returning every player id we saw at that tier.
 *
 * For 2v2 each entry has 2 players; we collect both because we want the
 * full Valhallan-tier population, not just one teammate.
 */
export async function discoverValhallanIds(
  gameMode: ApiGameMode,
  region: ApiRegion,
): Promise<number[]> {
  const ids: number[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const lb = await getRankedLeaderboard({
      gameMode,
      region,
      page,
      maxResults: PAGE_SIZE,
    })
    if (!lb.ok) break

    const valhallans = lb.data.rankings.filter((r) => r.tier === "Valhallan")
    for (const entry of valhallans) {
      for (const p of entry.players) ids.push(p.id)
    }

    // Stop when this page had no Valhallans (ladder dropped below tier)
    // or when we've consumed the API's pagination.
    if (valhallans.length === 0 || page >= lb.data.total_pages) break
  }
  return ids
}

/** Discovery across all 9 specific regions and both queues. ~54 API calls max. */
export async function discoverAllValhallanIds(): Promise<Set<number>> {
  const all = new Set<number>()
  for (const queue of QUEUES) {
    for (const region of REGIONS) {
      const ids = await discoverValhallanIds(queue, region)
      for (const id of ids) all.add(id)
    }
  }
  return all
}

/**
 * Of the given player ids, return the ones we either don't have in our DB
 * or whose last_synced is older than `ttlMs` ago (default 7 days). These
 * are the ids worth re-syncing this tick.
 */
export async function getStaleValhallanIds(
  all: Set<number>,
  ttlMs: number = 7 * 24 * 60 * 60 * 1000,
): Promise<number[]> {
  if (all.size === 0) return []
  const ids = Array.from(all)
  const freshThreshold = new Date(Date.now() - ttlMs)
  const freshRows = await db()
    .select({ id: players.brawlhallaId })
    .from(players)
    .where(
      and(
        inArray(players.brawlhallaId, ids),
        gte(players.lastSynced, freshThreshold),
      ),
    )
  const freshSet = new Set(freshRows.map((r) => r.id))
  return ids.filter((id) => !freshSet.has(id))
}

export interface LegendStat {
  legend_id: number
  wins: number
  games: number
  win_rate: number
}

/**
 * Valhallan starts at 2000 rating in Brawlhalla's tier system. The /ranked
 * endpoint never returns "Valhallan" as a tier name (it tops out at
 * "Diamond" even for 2800-rated players) — Valhallan is a leaderboard-only
 * designation. So we filter by rating instead, which matches the
 * leaderboard endpoint's tier assignment exactly.
 */
export const VALHALLAN_MIN_RATING = 2000

/**
 * Aggregate per-legend win rate across every player whose 1v1 rating
 * crosses the Valhallan threshold (2000+). This is the "what do Valhallan-
 * caliber players play with this season" interpretation — per-legend games
 * include time spent climbing through lower tiers on those legends.
 *
 * The HAVING clause keeps tiny-sample legends out of the result.
 */
export async function getValhallanLegendStats(
  opts: { minGames?: number } = {},
): Promise<LegendStat[]> {
  const minGames = opts.minGames ?? 50
  const result = await db().execute(sql`
    SELECT
      (l->>'legend_id')::int AS legend_id,
      SUM((l->>'wins')::int)::int AS wins,
      SUM((l->>'games')::int)::int AS games,
      ROUND(
        100.0 * SUM((l->>'wins')::numeric) /
        NULLIF(SUM((l->>'games')::numeric), 0),
        2
      )::float AS win_rate
    FROM players,
         jsonb_array_elements(ranked_json->'legends') AS l
    WHERE (ranked_json->>'rating')::int >= ${VALHALLAN_MIN_RATING}
      AND (l->>'games')::int > 0
    GROUP BY legend_id
    HAVING SUM((l->>'games')::int) >= ${minGames}
    ORDER BY win_rate DESC
  `)
  return result.rows as unknown as LegendStat[]
}
