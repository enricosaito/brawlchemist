import "server-only"

import { and, gte, inArray, sql } from "drizzle-orm"
import {
  type ApiGameMode,
  type ApiRegion,
  getRankedLeaderboard,
} from "@/lib/brawlhalla-api"
import { db } from "@/lib/db"
import { players } from "@/lib/db/schema"

const QUEUES: ApiGameMode[] = ["1v1", "2v2"]

/**
 * Regions we treat as "competitive" for tier-list aggregation. Only the
 * top three ladders (US-E ~150, EU ~150, BRZ ~100) are kept — US-W, SEA,
 * ME and the rest are dropped to cut noise from smaller, quieter pools.
 * Expected sample size when fully seeded: ~400 Valhallans. Easy to re-add
 * any region by editing this list.
 */
export const COMPETITIVE_REGIONS: ApiRegion[] = ["US-E", "EU", "BRZ"]
const REGIONS: ApiRegion[] = COMPETITIVE_REGIONS

/**
 * SQL fragment for the player-region filter used by every aggregation
 * query. If a specific region is provided we match it exactly (so direct
 * URLs to e.g. /legends?region=AUS still work against archived data).
 * Otherwise we restrict to the competitive set above.
 */
function regionClause(region: string | null) {
  if (region) {
    return sql`ranked_json->>'region' = ${region}`
  }
  return sql`ranked_json->>'region' IN (${sql.join(
    COMPETITIVE_REGIONS.map((r) => sql`${r}`),
    sql`, `,
  )})`
}

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
  /** Player's rank within their region among synced Valhallans (rating
   * descending). Computed in-query, not from the API — /ranked returns 0
   * for region_rank universally. Converges to the real leaderboard rank
   * as the cron finishes seeding. */
  regionRank: number
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
    WITH valhallans AS (
      SELECT
        brawlhalla_id,
        top_legend_id,
        username,
        (ranked_json->>'rating')::int AS rating,
        ranked_json->>'region' AS region,
        ROW_NUMBER() OVER (
          PARTITION BY ranked_json->>'region'
          ORDER BY (ranked_json->>'rating')::int DESC
        ) AS region_rank
      FROM players
      WHERE top_legend_id IS NOT NULL
        AND (ranked_json->>'rating')::int >= ${VALHALLAN_MIN_RATING}
        AND ${regionClause(region)}
    ),
    legend_ranked AS (
      SELECT *,
        ROW_NUMBER() OVER (
          PARTITION BY top_legend_id
          ORDER BY rating DESC
        ) AS rn
      FROM valhallans
    )
    SELECT top_legend_id, username, rating, region, region_rank
    FROM legend_ranked
    WHERE rn <= ${perLegend}
    ORDER BY top_legend_id, rn
  `)

  const rows = result.rows as unknown as Array<{
    top_legend_id: number
    username: string
    rating: number
    region: string
    region_rank: number
  }>

  const map = new Map<number, TopMainer[]>()
  for (const row of rows) {
    const list = map.get(row.top_legend_id) ?? []
    list.push({
      username: row.username,
      rating: row.rating,
      region: row.region,
      regionRank: row.region_rank,
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

export type AggregationMethod = "pooled" | "avg" | "popular"

export interface ValhallanAggregation {
  legends: LegendStat[]
  sampleSize: number
  method: AggregationMethod
}

/**
 * Internal filter threshold for the tier-list aggregation. The /legends
 * page subtitle quotes 2400 publicly (the "purer" elite-Valhallan band)
 * but we filter at 2300 to keep a healthier sample size; the 2300–2399
 * cohort is still solidly top-of-Valhallan in practice and helps stabilize
 * per-legend WR numbers. Update the page subtitle if this value moves.
 *
 * (The /ranked endpoint never returns "Valhallan" as a tier name — it
 * caps at "Diamond" even for 2800-rated players — so filtering by rating
 * is also the only reliable way to identify these players.)
 */
export const VALHALLAN_MIN_RATING = 2300

/**
 * Aggregate per-legend win rate across every player whose 1v1 rating
 * crosses the elite-Valhallan threshold (2400+). Per-legend games include time
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
 *   - "popular": same shape as pooled but ordered by total games desc.
 *     Surfaces the most-played legends at high level — proxy for the
 *     "meta picks" tier-list view.
 *
 * `minGames` interpretation depends on method:
 *   - pooled/popular: minimum total games across all players combined.
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
      AND ${regionClause(region)}
  `)).rows as unknown as { n: number }[]
  const sampleSize = sampleRows[0]?.n ?? 0

  if (method === "pooled" || method === "popular") {
    const minGames = opts.minGames ?? 50
    const orderBy =
      method === "popular" ? sql`games DESC` : sql`win_rate DESC`
    const result = await db().execute(sql`
      WITH legend_totals AS (
        SELECT
          (l->>'legend_id')::int AS legend_id,
          SUM((l->>'wins')::int)::int AS wins,
          SUM((l->>'games')::int)::int AS games
        FROM players,
             jsonb_array_elements(ranked_json->'legends') AS l
        WHERE (ranked_json->>'rating')::int >= ${VALHALLAN_MIN_RATING}
          AND ${regionClause(region)}
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
      ORDER BY ${orderBy}
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
        AND ${regionClause(region)}
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
