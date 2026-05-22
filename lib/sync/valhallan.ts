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

export interface TopMainer {
  username: string
  rating: number
  region: string
}

/**
 * For each legend, return the top-N Valhallan players whose `top_legend_id`
 * equals that legend (their season main is that legend), ordered by rating.
 *
 * Why this query instead of "players with most games on the legend"? Because
 * top_legend_id is already denormalized per player, so this is just a window
 * function over `players` — no jsonb scanning required.
 */
export async function getTopValhallanMainers(
  opts: { region?: string | null; perLegend?: number } = {},
): Promise<Map<number, TopMainer[]>> {
  const region = opts.region ?? null
  const perLegend = opts.perLegend ?? 3

  const result = await db().execute(sql`
    WITH ranked AS (
      SELECT
        top_legend_id,
        username,
        (ranked_json->>'rating')::int AS rating,
        ranked_json->>'region' AS region,
        ROW_NUMBER() OVER (
          PARTITION BY top_legend_id
          ORDER BY (ranked_json->>'rating')::int DESC
        ) AS rn
      FROM players
      WHERE top_legend_id IS NOT NULL
        AND (ranked_json->>'rating')::int >= ${VALHALLAN_MIN_RATING}
        AND (${region}::text IS NULL OR ranked_json->>'region' = ${region})
    )
    SELECT top_legend_id, username, rating, region
    FROM ranked
    WHERE rn <= ${perLegend}
    ORDER BY top_legend_id, rn
  `)

  const rows = result.rows as unknown as Array<{
    top_legend_id: number
    username: string
    rating: number
    region: string
  }>

  const map = new Map<number, TopMainer[]>()
  for (const row of rows) {
    const list = map.get(row.top_legend_id) ?? []
    list.push({
      username: row.username,
      rating: row.rating,
      region: row.region,
    })
    map.set(row.top_legend_id, list)
  }
  return map
}

export interface LegendStat {
  legend_id: number
  /** Total games across all contributing players. */
  games: number
  /** Pooled wins (only set for method=pooled). */
  wins?: number
  /** Distinct contributing players (only set for method=avg). */
  players?: number
  /** Percent. Pooled WR for "pooled"; mean of per-player WRs for "avg". */
  win_rate: number
  /** Share of total games in the pool. */
  pick_rate: number
}

export type AggregationMethod = "pooled" | "avg"

export interface ValhallanAggregation {
  legends: LegendStat[]
  sampleSize: number
  method: AggregationMethod
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
 * crosses the Valhallan threshold (2000+). Per-legend games include time
 * spent climbing through lower tiers on those legends.
 *
 * `region` — filter to a single region (matching ranked_json.region values
 *   like "BRZ", "US-E"). Pass null for the global view.
 *
 * `method`:
 *   - "pooled" (default): SUM(wins) / SUM(games) across all players. High-
 *     volume players dominate. Reflects total observed outcomes.
 *   - "avg": per-player WR, then averaged across players. Each player
 *     contributes one data point regardless of game count. Less influenced
 *     by outliers like Lopes' 4000-game samples.
 *
 * `minGames` interpretation depends on method:
 *   - pooled: minimum total games across all players combined.
 *   - avg: minimum games per individual player to qualify as a data point,
 *     plus an implicit minPlayers=5 floor on the legend itself.
 */
export async function getValhallanLegendStats(opts: {
  minGames?: number
  region?: string | null
  method?: AggregationMethod
} = {}): Promise<ValhallanAggregation> {
  const method = opts.method ?? "pooled"
  const region = opts.region ?? null

  // Sample size: number of Valhallan-rated players matching the region filter.
  const sampleRows = (await db().execute(sql`
    SELECT COUNT(*)::int AS n
    FROM players
    WHERE (ranked_json->>'rating')::int >= ${VALHALLAN_MIN_RATING}
      AND (${region}::text IS NULL OR ranked_json->>'region' = ${region})
  `)).rows as unknown as { n: number }[]
  const sampleSize = sampleRows[0]?.n ?? 0

  if (method === "pooled") {
    const minGames = opts.minGames ?? 50
    const result = await db().execute(sql`
      WITH legend_totals AS (
        SELECT
          (l->>'legend_id')::int AS legend_id,
          SUM((l->>'wins')::int)::int AS wins,
          SUM((l->>'games')::int)::int AS games
        FROM players,
             jsonb_array_elements(ranked_json->'legends') AS l
        WHERE (ranked_json->>'rating')::int >= ${VALHALLAN_MIN_RATING}
          AND (${region}::text IS NULL OR ranked_json->>'region' = ${region})
          AND (l->>'games')::int > 0
        GROUP BY legend_id
        HAVING SUM((l->>'games')::int) >= ${minGames}
      )
      SELECT
        legend_id,
        wins,
        games,
        ROUND(100.0 * wins / NULLIF(games, 0), 2)::float AS win_rate,
        ROUND(100.0 * games / NULLIF(SUM(games) OVER (), 0), 2)::float AS pick_rate
      FROM legend_totals
      ORDER BY win_rate DESC
    `)
    return {
      legends: result.rows as unknown as LegendStat[],
      sampleSize,
      method,
    }
  }

  // method === "avg" — per-player WR then averaged.
  const minGamesPerPlayer = opts.minGames ?? 30
  const minPlayersPerLegend = 5
  const result = await db().execute(sql`
    WITH per_player AS (
      SELECT
        (l->>'legend_id')::int AS legend_id,
        (l->>'wins')::int AS wins,
        (l->>'games')::int AS games,
        (l->>'wins')::float / (l->>'games')::int AS player_wr
      FROM players,
           jsonb_array_elements(ranked_json->'legends') AS l
      WHERE (ranked_json->>'rating')::int >= ${VALHALLAN_MIN_RATING}
        AND (${region}::text IS NULL OR ranked_json->>'region' = ${region})
        AND (l->>'games')::int >= ${minGamesPerPlayer}
    ),
    legend_totals AS (
      SELECT
        legend_id,
        COUNT(*)::int AS players,
        SUM(games)::int AS games,
        AVG(player_wr) AS macro_wr
      FROM per_player
      GROUP BY legend_id
      HAVING COUNT(*) >= ${minPlayersPerLegend}
    )
    SELECT
      legend_id,
      players,
      games,
      ROUND((100.0 * macro_wr)::numeric, 2)::float AS win_rate,
      ROUND(100.0 * games / NULLIF(SUM(games) OVER (), 0), 2)::float AS pick_rate
    FROM legend_totals
    ORDER BY win_rate DESC
  `)
  return {
    legends: result.rows as unknown as LegendStat[],
    sampleSize,
    method,
  }
}
