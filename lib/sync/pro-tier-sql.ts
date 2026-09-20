import "server-only"

import { sql } from "drizzle-orm"
import { profiles } from "@/lib/db/schema"
import { ASSIGNABLE_PRO_TIERS, DEFAULT_PRO_TIER } from "@/lib/profile/pro-tier"

/**
 * The tier question, asked in SQL, in one place.
 *
 * Three admin queries and one maintenance script need "is this person curated"
 * or "sort by standing", and spelling either out per query is how the ladder
 * ends up meaning different things in different lists. This is the same reason
 * `valhallanRatingClause()` exists: the next query that needs it cannot quietly
 * reintroduce a wrong form.
 *
 * Every expression here reads the legacy boolean as a fallback, which is the
 * SQL mirror of `resolveProTier`. That matters for exactly one window — between
 * this deploy and the next, the previously running build is still writing rows
 * with `is_pro` and no `pro_tier`, and those rows have to sort and filter as
 * the Pro Players they are claiming to be. It goes when the column does.
 */

/** The effective tier of a row, legacy fallback included. */
export const proTierExpr = sql<string>`coalesce(${profiles.proTier}, case when ${profiles.isPro} then 'pro' else ${DEFAULT_PRO_TIER} end)`

/** Curated at all — the SQL twin of `isCurated`, never a rank comparison. */
export function curatedClause() {
  return sql`${proTierExpr} <> ${DEFAULT_PRO_TIER}`
}

/**
 * Rank for ORDER BY, strongest first.
 *
 * Built from the catalogue rather than typed out, so adding a tier orders
 * correctly everywhere without a second edit. A bare `desc(pro_tier)` would
 * sort the column lexically — "top" before "power-ranked" before "pro" — which
 * looks like a working sort and is not one.
 */
export const proTierRankExpr = sql<number>`case ${proTierExpr} ${sql.join(
  ASSIGNABLE_PRO_TIERS.map((t, i) => sql`when ${t} then ${i}`),
  sql` `
)} else ${ASSIGNABLE_PRO_TIERS.length} end`
