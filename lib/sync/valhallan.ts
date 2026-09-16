import "server-only"

import { unstable_cache } from "next/cache"
import { and, eq, gte, inArray, sql } from "drizzle-orm"
import {
  API_REGIONS,
  type ApiGameMode,
  type ApiRegion,
  getRankedLeaderboard,
} from "@/lib/brawlhalla-api"
import { db } from "@/lib/db"
import { players, valhallanMembers } from "@/lib/db/schema"

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
 * Paginate the ranked leaderboard for one (queue, region) until a page holds
 * no Valhallans at all, returning every player id we saw at that tier.
 *
 * The stop rule is load-bearing and is NOT "stop at the first non-Valhallan
 * row" — the tier is interleaved, not a contiguous prefix (see the
 * valhallan_members comment in lib/db/schema.ts). Stopping at the first mixed
 * page, which lib/sync/valhallan-cutoff.ts used to do, misses 25-40% of the
 * population.
 *
 * For 2v2 each entry has 2 players; we collect both because we want the
 * full Valhallan-tier population, not just one teammate.
 *
 * `complete` says the walk ended on its own terms rather than on a failed
 * fetch. A 429 mid-walk looks exactly like a short ladder otherwise, and
 * callers that persist the result need to tell those apart.
 *
 * `capped` says it ran out of pages while Valhallans were still appearing, so
 * the tail is cut. Worth reporting rather than swallowing: the cap is a guess
 * about ladder depth, and a ladder that reports `capped` every day is the
 * signal to raise MAX_PAGES. The result is still usable — it's a prefix of
 * the truth, not a wrong answer.
 */
export async function discoverValhallanIds(
  gameMode: ApiGameMode,
  region: ApiRegion,
): Promise<{ ids: number[]; complete: boolean; capped: boolean }> {
  const ids: number[] = []
  let capped = true
  for (let page = 1; page <= MAX_PAGES; page++) {
    const lb = await getRankedLeaderboard({
      gameMode,
      region,
      page,
      maxResults: PAGE_SIZE,
    })
    if (!lb.ok) return { ids, complete: false, capped: false }

    const valhallans = lb.data.rankings.filter((r) => r.tier === "Valhallan")
    for (const entry of valhallans) {
      for (const p of entry.players) ids.push(p.id)
    }

    // Stop when this page had no Valhallans (ladder dropped below tier)
    // or when we've consumed the API's pagination.
    if (valhallans.length === 0 || page >= lb.data.total_pages) {
      capped = false
      break
    }
  }
  return { ids, complete: true, capped }
}

/**
 * Discovery across the competitive regions and both queues, for the re-sync
 * pool. Deliberately still COMPETITIVE_REGIONS: this set decides whose
 * `ranked_json` we spend /player calls and storage on, and only those three
 * ladders feed the legend aggregations.
 *
 * Membership for the *other* six regions is a separate question with a
 * separate cost profile — see refreshValhallanMembers.
 */
export async function discoverAllValhallanIds(): Promise<Set<number>> {
  const all = new Set<number>()
  for (const queue of QUEUES) {
    for (const region of REGIONS) {
      const { ids } = await discoverValhallanIds(queue, region)
      for (const id of ids) all.add(id)
    }
  }
  return all
}

/** Every real ladder. "ALL" is excluded — membership is per region. */
const MEMBER_REGIONS: ApiRegion[] = API_REGIONS.filter(
  (r): r is ApiRegion => r !== "ALL",
)

/**
 * Walk every (queue, region) ladder and persist who is Valhallan on it.
 *
 * Called from the daily sync-valhallan cron, right beside the discovery it
 * already runs — the three competitive ladders are the same URLs the re-sync
 * pool just fetched, so within the tick they come back off the fetch cache
 * (`getRankedLeaderboard` revalidates at 300s) and cost nothing upstream. The
 * six small ladders are genuinely new, and they're shallow: SEA/US-W bottom
 * out around rank 130-155 and AUS/SA/ME/JPN inside 80, so the whole widening
 * is ~36 extra calls once a day.
 *
 * Writes per ladder rather than in one transaction, and skips any ladder
 * whose walk came back incomplete: a rate-limited walk returning 40 of 180
 * ids must not replace yesterday's complete answer. A ladder that has
 * genuinely emptied writes `[]`, which is different from not writing.
 */
export async function refreshValhallanMembers(): Promise<
  {
    queue: ApiGameMode
    region: ApiRegion
    count: number
    stored: boolean
    capped: boolean
  }[]
> {
  const results: {
    queue: ApiGameMode
    region: ApiRegion
    count: number
    stored: boolean
    capped: boolean
  }[] = []
  for (const queue of QUEUES) {
    for (const region of MEMBER_REGIONS) {
      const { ids, complete, capped } = await discoverValhallanIds(
        queue,
        region,
      )
      const unique = [...new Set(ids)]
      if (complete) {
        try {
          await db()
            .insert(valhallanMembers)
            .values({ queue, region, ids: unique })
            .onConflictDoUpdate({
              target: [valhallanMembers.queue, valhallanMembers.region],
              set: { ids: unique, updatedAt: new Date() },
            })
        } catch (err) {
          console.error(
            `[valhallan] member write failed for ${queue}/${region}:`,
            err,
          )
          results.push({
            queue,
            region,
            count: unique.length,
            stored: false,
            capped,
          })
          continue
        }
      }
      results.push({
        queue,
        region,
        count: unique.length,
        stored: complete,
        capped,
      })
    }
  }
  return results
}

/**
 * Stored Valhallan ids for a queue, by region. Fails open to an empty map —
 * the cutoff walk's own (shallower) ids still cover the top of each ladder,
 * so a cold or unreachable table degrades to the old behaviour rather than
 * un-tiering everyone.
 */
export async function readValhallanMembers(
  queue: ApiGameMode,
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>()
  try {
    const rows = await db()
      .select({ region: valhallanMembers.region, ids: valhallanMembers.ids })
      .from(valhallanMembers)
      .where(eq(valhallanMembers.queue, queue))
    for (const r of rows) {
      if (Array.isArray(r.ids)) {
        out.set(
          r.region,
          r.ids.filter((v): v is number => typeof v === "number"),
        )
      }
    }
  } catch (err) {
    console.error("[valhallan] member read failed:", err)
  }
  return out
}

/**
 * How many Valhallans one ladder holds, without shipping the ids.
 *
 * The cutoff chip wants a population count per region; reading the whole map
 * for a `.length` would move ~15 kB of ids per region per refresh for one
 * integer, which is exactly the egress shape that has bitten this project
 * before. `jsonb_array_length` does it server-side.
 */
export async function readValhallanMemberCount(
  queue: ApiGameMode,
  region: ApiRegion,
): Promise<number | null> {
  try {
    const [row] = await db()
      .select({ n: sql<number>`jsonb_array_length(${valhallanMembers.ids})` })
      .from(valhallanMembers)
      .where(
        and(
          eq(valhallanMembers.queue, queue),
          eq(valhallanMembers.region, region),
        ),
      )
      .limit(1)
    return row?.n ?? null
  } catch (err) {
    console.error("[valhallan] member count read failed:", err)
    return null
  }
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
  brawlhallaId: number
  username: string
  rating: number
  region: string
  /** Player's rank within their region among synced Valhallans (rating
   * descending). Computed in-query, not from the API — /ranked returns 0
   * for region_rank universally. Converges to the real leaderboard rank
   * as the cron finishes seeding. */
  regionRank: number
  /**
   * Their record *on this legend*, not overall — which is the only record that
   * belongs next to a legend's name. Null when the stored payload has no entry
   * for it, which happens for a row synced before they played it.
   */
  legendGames: number | null
  legendWins: number | null
  /** 0-100, or null without a record to derive it from. */
  legendWinRate: number | null
  /**
   * Their own pick rate for this legend: what share of their ranked games they
   * spent on it. The pool's pick rate says how popular a legend is; this says
   * how committed *this* player is to it, which is the difference between a
   * one-trick and someone with it in a rotation.
   */
  legendPickRate: number | null
}

/**
 * For each legend, return the top-N Valhallan players whose `top_legend_id`
 * equals that legend (their season main is that legend), ordered by rating.
 *
 * Why this query instead of "players with most games on the legend"? Because
 * top_legend_id is already denormalized per player, so this is just a window
 * function over `players` — no jsonb scanning required.
 */
interface MainerRow {
  top_legend_id: number
  brawlhalla_id: number
  username: string
  rating: number
  region: string
  region_rank: number
  legend_games: number | null
  legend_wins: number | null
  total_games: number | null
}

async function computeTopValhallanMainers(
  opts: { region?: string | null; perLegend?: number } = {},
): Promise<MainerRow[]> {
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
        ) AS region_rank,
        lg.games AS legend_games,
        lg.wins AS legend_wins,
        (ranked_json->>'games')::int AS total_games
      FROM players
      LEFT JOIN LATERAL (
        SELECT (l->>'games')::int AS games, (l->>'wins')::int AS wins
        FROM jsonb_array_elements(ranked_json->'legends') l
        WHERE (l->>'legend_id')::int = top_legend_id
        LIMIT 1
      ) lg ON true
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
    SELECT top_legend_id, brawlhalla_id, username, rating, region, region_rank,
           legend_games, legend_wins, total_games
    FROM legend_ranked
    WHERE rn <= ${perLegend}
    ORDER BY top_legend_id, rn
  `)

  return result as unknown as MainerRow[]
}

/**
 * Count of distinct Valhallan players who main each legend (top_legend_id ==
 * that legend). This is the "player diversity" metric: how many different
 * top-tier players run the legend as their season main, independent of how
 * many games they've logged. Returns a Map<legendId, playerCount>.
 */
async function computeValhallanMainerCounts(
  opts: { region?: string | null } = {},
): Promise<{ top_legend_id: number; players: number }[]> {
  const region = opts.region ?? null
  const result = await db().execute(sql`
    SELECT top_legend_id, COUNT(*)::int AS players
    FROM players
    WHERE top_legend_id IS NOT NULL
      AND (ranked_json->>'rating')::int >= ${VALHALLAN_MIN_RATING}
      AND ${regionClause(region)}
    GROUP BY top_legend_id
  `)
  return result as unknown as { top_legend_id: number; players: number }[]
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
async function computeValhallanLegendStats(opts: {
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
  `)) as unknown as { n: number }[]
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
      legends: result as unknown as LegendStat[],
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
    legends: result as unknown as LegendStat[],
    sampleSize,
    method,
  }
}

export interface WeaponStat {
  weapon_id: import("@/lib/types").WeaponId
  /** Total games across all legends wielding this weapon. */
  games: number
  /** Total wins across all legends wielding this weapon. */
  wins: number
  /** Pooled WR (percent). */
  win_rate: number
  /** Share of total weapon-attributed games across the pool. */
  pick_rate: number
  /** Number of legends in the roster that wield this weapon. */
  legend_count: number
  /**
   * Up to two legend ids — the most-played wielders of this weapon in the
   * Valhallan pool, sorted by total games desc. Caveat: "most-played" is by
   * the legend's total games (any weapon), not per-weapon games.
   */
  top_legend_ids: number[]
}

const TOP_LEGENDS_PER_WEAPON = 5

/**
 * Aggregate per-weapon Valhallan-tier stats by composing the per-legend
 * aggregation with the roster's legend→weapons mapping. Each legend
 * contributes its games/wins to BOTH of its two weapons (full attribution).
 * Pick rate is normalized against the total of all weapon-attributed
 * games — note this sums to 200% because every game is counted twice
 * (once per weapon slot). Treat it as a "share of weapon presence",
 * not "share of unique games."
 */
async function computeValhallanWeaponStats(
  opts: { region?: string | null } = {},
): Promise<{ weapons: WeaponStat[]; sampleSize: number }> {
  const { legends, sampleSize } = await getValhallanLegendStats({
    method: "popular",
    region: opts.region ?? null,
    // Same threshold as the popular method elsewhere; per-legend games are
    // already gated, and we want as many roster legends contributing as
    // possible since the weapon's pool dilutes them.
    minGames: opts.region ? 20 : 100,
  })

  // Index per-legend popular stats by legend_id.
  const byLegend = new Map<
    number,
    { games: number; wins: number }
  >()
  for (const l of legends) {
    byLegend.set(l.legend_id, { games: l.games, wins: l.wins ?? 0 })
  }

  // Accumulator per weapon. We track every wielder's games so we can pick
  // the top N at the end.
  const acc = new Map<
    string,
    {
      games: number
      wins: number
      wielders: { legendId: number; games: number }[]
    }
  >()

  const { LEGEND_ROSTER, ROSTER_WEAPONS } = await import("@/lib/legends-roster")

  for (const w of ROSTER_WEAPONS) {
    acc.set(w, { games: 0, wins: 0, wielders: [] })
  }
  for (const legend of LEGEND_ROSTER) {
    const stats = byLegend.get(legend.legendId)
    if (!stats) continue
    for (const w of legend.weapons) {
      const slot = acc.get(w)
      if (!slot) continue
      slot.games += stats.games
      slot.wins += stats.wins
      slot.wielders.push({ legendId: legend.legendId, games: stats.games })
    }
  }

  const totalGames = Array.from(acc.values()).reduce(
    (sum, s) => sum + s.games,
    0,
  )

  const weapons: WeaponStat[] = Array.from(acc.entries()).map(
    ([weapon_id, s]) => {
      const sortedWielders = [...s.wielders].sort((a, b) => b.games - a.games)
      return {
        weapon_id: weapon_id as import("@/lib/types").WeaponId,
        games: s.games,
        wins: s.wins,
        win_rate:
          s.games > 0 ? Math.round((100 * s.wins * 100) / s.games) / 100 : 0,
        pick_rate:
          totalGames > 0
            ? Math.round((100 * s.games * 100) / totalGames) / 100
            : 0,
        legend_count: s.wielders.length,
        top_legend_ids: sortedWielders
          .slice(0, TOP_LEGENDS_PER_WEAPON)
          .map((w) => w.legendId),
      }
    },
  )
  // Default sort: by games descending — same "popular" ordering as /legends.
  weapons.sort((a, b) => b.games - a.games)

  return { weapons, sampleSize }
}

/* ---------------------------------------------------------------------------
   Cached public entry points.

   Every aggregation below is a full scan of `players` — the "popular" and
   "pooled" variants additionally unnest `ranked_json->'legends'`, which
   detoasts the whole ~200 MB jsonb column. Uncached, the homepage alone
   (TopLegendsCard + WeaponMetaCard) ran two of those per request and kept the
   free-tier database permanently CPU-saturated, which in turn starved the
   connection pool for every other page.

   The underlying data only moves when the daily sync-valhallan cron refreshes
   the Valhallan pool, so a 6-hour TTL costs nothing in freshness. Everything
   shares the VALHALLAN_STATS_TAG so a cron (or /admin) can bust the set.
   ------------------------------------------------------------------------- */

export const VALHALLAN_STATS_TAG = "valhallan-stats"
const STATS_TTL_SECONDS = 6 * 60 * 60

const cachedLegendStats = unstable_cache(
  computeValhallanLegendStats,
  ["valhallan-legend-stats"],
  { tags: [VALHALLAN_STATS_TAG], revalidate: STATS_TTL_SECONDS },
)

const cachedWeaponStats = unstable_cache(
  computeValhallanWeaponStats,
  ["valhallan-weapon-stats"],
  { tags: [VALHALLAN_STATS_TAG], revalidate: STATS_TTL_SECONDS },
)

const cachedTopMainers = unstable_cache(
  computeTopValhallanMainers,
  ["valhallan-top-mainers"],
  { tags: [VALHALLAN_STATS_TAG], revalidate: STATS_TTL_SECONDS },
)

const cachedMainerCounts = unstable_cache(
  computeValhallanMainerCounts,
  ["valhallan-mainer-counts"],
  { tags: [VALHALLAN_STATS_TAG], revalidate: STATS_TTL_SECONDS },
)

/**
 * unstable_cache keys on JSON.stringify of the argument list, so `{ region,
 * method }` and `{ method, region }` would be two different cache entries for
 * the same query. Every wrapper below normalises its options into one canonical
 * shape first.
 */
function normalizeStatsOpts(opts: {
  minGames?: number
  region?: string | null
  method?: AggregationMethod
}) {
  return {
    region: opts.region ?? null,
    method: opts.method ?? ("pooled" as AggregationMethod),
    minGames: opts.minGames ?? null,
  }
}

/** Per-legend Valhallan tier-list stats. See computeValhallanLegendStats. */
export function getValhallanLegendStats(
  opts: {
    minGames?: number
    region?: string | null
    method?: AggregationMethod
  } = {},
): Promise<ValhallanAggregation> {
  const { region, method, minGames } = normalizeStatsOpts(opts)
  return cachedLegendStats({
    region,
    method,
    ...(minGames != null ? { minGames } : {}),
  })
}

/** Per-weapon Valhallan tier-list stats. See computeValhallanWeaponStats. */
export function getValhallanWeaponStats(
  opts: { region?: string | null } = {},
): Promise<{ weapons: WeaponStat[]; sampleSize: number }> {
  return cachedWeaponStats({ region: opts.region ?? null })
}

/**
 * Top-N Valhallan mainers per legend. The cache stores flat rows (a Map isn't
 * serializable); the Map is rebuilt here, which is free.
 */
export async function getTopValhallanMainers(
  opts: { region?: string | null; perLegend?: number } = {},
): Promise<Map<number, TopMainer[]>> {
  const rows = await cachedTopMainers({
    region: opts.region ?? null,
    perLegend: opts.perLegend ?? 3,
  })
  const map = new Map<number, TopMainer[]>()
  for (const row of rows) {
    const list = map.get(row.top_legend_id) ?? []
    list.push({
      brawlhallaId: row.brawlhalla_id,
      username: row.username,
      rating: row.rating,
      region: row.region,
      regionRank: row.region_rank,
      legendGames: row.legend_games,
      legendWins: row.legend_wins,
      legendWinRate:
        row.legend_games && row.legend_games > 0
          ? Math.round((100 * (row.legend_wins ?? 0) * 100) / row.legend_games) /
            100
          : null,
      legendPickRate:
        row.legend_games != null && row.total_games && row.total_games > 0
          ? Math.round((100 * row.legend_games * 100) / row.total_games) / 100
          : null,
    })
    map.set(row.top_legend_id, list)
  }
  return map
}

/** Distinct Valhallan mainers per legend, keyed by legend id. */
export async function getValhallanMainerCounts(
  opts: { region?: string | null } = {},
): Promise<Map<number, number>> {
  const rows = await cachedMainerCounts({ region: opts.region ?? null })
  const map = new Map<number, number>()
  for (const row of rows) map.set(row.top_legend_id, row.players)
  return map
}
