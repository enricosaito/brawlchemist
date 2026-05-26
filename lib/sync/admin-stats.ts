import "server-only"

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { VALHALLAN_MIN_RATING } from "@/lib/sync/valhallan"

/**
 * Admin dashboard counts: how much of each tier we've actually fetched into the
 * players pool. The /ranked API caps at "Diamond" (it never reports
 * "Valhallan"), so Valhallan is carved out of Diamond by the same rating proxy
 * the rest of the app uses (VALHALLAN_MIN_RATING). Rows with no ranked_json are
 * search-index "name-only" rows (harvested from the ladder, not yet fully
 * fetched) and are reported separately.
 */

export interface TierCount {
  tier: string
  count: number
}

export interface PoolStats {
  /** Every players row. */
  total: number
  /** Rows with a full /ranked payload. */
  fetched: number
  /** Rows harvested name-only from the ladder (no /ranked yet). */
  nameOnly: number
  /** Fetched players bucketed by tier, highest first. */
  tiers: TierCount[]
  /** Guilds discovered. */
  guilds: number
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
  "Unranked",
]

export async function getPlayerPoolStats(): Promise<PoolStats> {
  // One pass over players, bucketed. The rating guard (`~ '^[0-9]+$'`) avoids a
  // cast error if a payload ever lacks a numeric rating.
  const bucketRows = (
    await db().execute(sql`
      SELECT
        CASE
          WHEN ranked_json IS NULL THEN 'name-only'
          WHEN (ranked_json->>'rating') ~ '^[0-9]+$'
               AND (ranked_json->>'rating')::int >= ${VALHALLAN_MIN_RATING}
            THEN 'Valhallan'
          WHEN split_part(coalesce(ranked_json->>'tier', ''), ' ', 1)
               IN ('', 'none')
            THEN 'Unranked'
          ELSE split_part(ranked_json->>'tier', ' ', 1)
        END AS bucket,
        COUNT(*)::int AS n
      FROM players
      GROUP BY bucket
    `)
  ).rows as unknown as { bucket: string; n: number }[]

  const byBucket = new Map<string, number>()
  for (const r of bucketRows) byBucket.set(r.bucket, Number(r.n))

  const nameOnly = byBucket.get("name-only") ?? 0
  const tiers = TIER_ORDER.map((tier) => ({
    tier,
    count: byBucket.get(tier) ?? 0,
  }))
  const fetched = tiers.reduce((sum, t) => sum + t.count, 0)

  let guilds = 0
  try {
    const g = (
      await db().execute(sql`SELECT COUNT(*)::int AS n FROM guilds`)
    ).rows as unknown as { n: number }[]
    guilds = g[0]?.n ?? 0
  } catch (err) {
    console.error("[admin-stats] guild count failed:", err)
  }

  return { total: fetched + nameOnly, fetched, nameOnly, tiers, guilds }
}
