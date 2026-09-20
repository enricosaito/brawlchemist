import "server-only"

import { sql } from "drizzle-orm"
import { unstable_cache } from "next/cache"
import { db } from "@/lib/db"
import { failOpen } from "@/lib/sync/fail-open"
import { TIER_FLOOR } from "@/lib/tier"
import { VALHALLAN_MIN_RATING } from "@/lib/sync/valhallan"

/**
 * Admin telemetry: the shape of the player pool, and the handful of counts the
 * panel's overview strip quotes on every tab.
 *
 * Both readers are cached and fail open OUTSIDE the cache (constraint #5). They
 * are decoration on a screen whose job is the controls beneath them, so a
 * stale number is fine and a slow one is not — the System tab was unreachable
 * for exactly that reason (see getPlayerPoolStats).
 */

export interface TierCount {
  tier: string
  count: number
}

export interface PoolStats {
  /** Every players row. */
  total: number
  /** Rows with a rating on the row — a ranked payload has been read. */
  rated: number
  /** Rows with no rating: ladder-harvested name-only rows and the unranked. */
  unrated: number
  /** Rated players bucketed by tier, highest first. */
  tiers: TierCount[]
  /** Guilds discovered. */
  guilds: number
}

const EMPTY_POOL: PoolStats = {
  total: 0,
  rated: 0,
  unrated: 0,
  tiers: [],
  guilds: 0,
}

// Highest → lowest; buckets missing from the query default to 0.
const TIER_ORDER = [
  "Valhallan",
  "Diamond",
  "Platinum",
  "Gold",
  "Silver",
  "Bronze",
  "Tin",
]

/**
 * Buckets by the denormalised `rating` column, never by `ranked_json`.
 *
 * The previous version read `ranked_json->>'tier'` for every row, which is a
 * sequential scan that detoasts the whole ~300MB table: measured 29.1s over the
 * pooler, against the role's 30s `statement_timeout`. So the System tab either
 * crawled or failed open after half a minute, and an operator read that as
 * "the tab is broken". This shape is a parallel index-only scan on
 * `players_rating_idx` — measured 1.35s server-side, 16.8k buffers, no heap
 * beyond the visibility misses — and it is the same question, since the tier
 * bands are a function of rating everywhere else on the site (`TIER_FLOOR`).
 *
 * What it gives up: "name-only" is no longer told apart from "unranked", since
 * telling them apart needs `ranked_json IS NULL`, and that predicate alone is a
 * 9.3s sequential scan (measured). Both mean "no rating on the row", which is
 * what the operator is actually reading — how much of the pool is real.
 *
 * Throws on failure — the fallback lives in the exported reader.
 */
const readPoolStats = unstable_cache(
  async (): Promise<PoolStats> => {
    const [bucketRows, guildRows] = await Promise.all([
      db().execute(sql`
        SELECT
          CASE
            WHEN rating IS NULL THEN 'unrated'
            WHEN rating >= ${VALHALLAN_MIN_RATING} THEN 'Valhallan'
            WHEN rating >= ${TIER_FLOOR.Diamond} THEN 'Diamond'
            WHEN rating >= ${TIER_FLOOR.Platinum} THEN 'Platinum'
            WHEN rating >= ${TIER_FLOOR.Gold} THEN 'Gold'
            WHEN rating >= ${TIER_FLOOR.Silver} THEN 'Silver'
            WHEN rating >= ${TIER_FLOOR.Bronze} THEN 'Bronze'
            ELSE 'Tin'
          END AS bucket,
          COUNT(*)::int AS n
        FROM players
        GROUP BY bucket
      `) as unknown as Promise<{ bucket: string; n: number }[]>,
      db().execute(
        sql`SELECT COUNT(*)::int AS n FROM guilds`
      ) as unknown as Promise<{ n: number }[]>,
    ])

    const byBucket = new Map<string, number>()
    for (const r of bucketRows) byBucket.set(r.bucket, Number(r.n))

    const unrated = byBucket.get("unrated") ?? 0
    const tiers = TIER_ORDER.map((tier) => ({
      tier,
      count: byBucket.get(tier) ?? 0,
    }))
    const rated = tiers.reduce((sum, t) => sum + t.count, 0)

    return {
      total: rated + unrated,
      rated,
      unrated,
      tiers,
      guilds: guildRows[0]?.n ?? 0,
    }
  },
  ["admin-pool-stats"],
  { revalidate: 600 }
)

export async function getPlayerPoolStats(): Promise<PoolStats> {
  return failOpen("[admin-pool-stats]", readPoolStats, EMPTY_POOL)
}

/**
 * Busted by every admin mutation that moves one of these numbers (link,
 * unlink, delete, curate), so the strip answers the click rather than the
 * clock. Two minutes is the ceiling for everything else — a sign-up, a fetch.
 */
export const ADMIN_OVERVIEW_TAG = "admin-overview"

/** The numbers the overview strip shows on every tab. */
export interface AdminOverview {
  accounts: number
  /** Accounts that own a profile. */
  linked: number
  pros: number
  /** Rows in `profiles`, curated or claimed. */
  people: number
  /** /ranked calls the site considered in the last 24h, by outcome. */
  fetches24h: { cached: number; synced: number; failed: number }
}

const EMPTY_OVERVIEW: AdminOverview = {
  accounts: 0,
  linked: 0,
  pros: 0,
  people: 0,
  fetches24h: { cached: 0, synced: 0, failed: 0 },
}

/**
 * One statement, one round trip: every count here is over a table of at most
 * a few hundred rows, except the fetch log, which walks its 24h window on
 * `fetch_log_created_at_idx` (~15k rows). Measured 1.4s total over the pooler
 * from Brazil, which is the trip, not the work — hence the cache.
 */
const readOverview = unstable_cache(
  async (): Promise<AdminOverview> => {
    const rows = (await db().execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM app_users) AS accounts,
        (SELECT COUNT(*)::int FROM profiles WHERE user_id IS NOT NULL) AS linked,
        (SELECT COUNT(*)::int FROM profiles
           WHERE coalesce(pro_tier, case when is_pro then 'pro' else 'none' end)
                 <> 'none') AS pros,
        (SELECT COUNT(*)::int FROM profiles) AS people,
        (SELECT COUNT(*)::int FROM fetch_log
           WHERE created_at > now() - interval '24 hours' AND result = 'cached') AS cached,
        (SELECT COUNT(*)::int FROM fetch_log
           WHERE created_at > now() - interval '24 hours' AND result = 'synced') AS synced,
        (SELECT COUNT(*)::int FROM fetch_log
           WHERE created_at > now() - interval '24 hours' AND result = 'failed') AS failed
    `)) as unknown as {
      accounts: number
      linked: number
      pros: number
      people: number
      cached: number
      synced: number
      failed: number
    }[]
    const r = rows[0]
    if (!r) throw new Error("admin overview: no row")
    return {
      accounts: Number(r.accounts),
      linked: Number(r.linked),
      pros: Number(r.pros),
      people: Number(r.people),
      fetches24h: {
        cached: Number(r.cached),
        synced: Number(r.synced),
        failed: Number(r.failed),
      },
    }
  },
  ["admin-overview"],
  { revalidate: 120, tags: [ADMIN_OVERVIEW_TAG] }
)

export async function getAdminOverview(): Promise<AdminOverview> {
  return failOpen("[admin-overview]", readOverview, EMPTY_OVERVIEW)
}
