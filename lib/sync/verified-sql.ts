import "server-only"

import { sql } from "drizzle-orm"
import { profiles } from "@/lib/db/schema"
import {
  ASSIGNABLE_VERIFIED_KINDS,
  DEFAULT_VERIFIED_KIND,
  VERIFIED_KINDS,
  VERIFIED_KIND_DEFS,
} from "@/lib/profile/verified"

const COMPETITIVE_KINDS = VERIFIED_KINDS.filter(
  (k) => VERIFIED_KIND_DEFS[k].competitive
)

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
 * SQL mirror of `resolveVerifiedKind`. That matters for exactly one window — between
 * this deploy and the next, the previously running build is still writing rows
 * with `is_pro` and no `pro_tier`, and those rows have to sort and filter as
 * the Pro Players they are claiming to be. It goes when the column does.
 */

/** The effective tier of a row, legacy fallback included. */
export const verifiedKindExpr = sql<string>`coalesce(${profiles.verifiedKind}, case when ${profiles.isPro} then 'pro' else ${DEFAULT_VERIFIED_KIND} end)`

/** Curated at all — the SQL twin of `isVerified`, never a rank comparison. */
export function verifiedClause() {
  return sql`${verifiedKindExpr} <> ${DEFAULT_VERIFIED_KIND}`
}

/**
 * Only the kinds that belong on a board of competitors — the SQL twin of
 * `isCompetitive`.
 *
 * Built from the catalogue rather than typed out, so adding a kind lands in
 * every query at once and cannot be half-applied. This is what keeps a Verified
 * Content Creator off the Pros leaderboard and out of the esports linking
 * screen: someone we vouch for, and emphatically not someone to rank on a
 * competitive ladder.
 */
export function competitiveClause() {
  // Parenthesised, and that is not cosmetic: `sql.join` emits `$1, $2, $3`
  // with no brackets, which parses as a syntax error the moment this runs.
  // Nothing in the type system catches it — only executing it does.
  return sql`${verifiedKindExpr} in (${sql.join(
    COMPETITIVE_KINDS.map((k) => sql`${k}`),
    sql`, `
  )})`
}

/**
 * Rank for ORDER BY, strongest first.
 *
 * Built from the catalogue rather than typed out, so adding a tier orders
 * correctly everywhere without a second edit. A bare `desc(pro_tier)` would
 * sort the column lexically — "top" before "power-ranked" before "pro" — which
 * looks like a working sort and is not one.
 */
export const verifiedOrderExpr = sql<number>`case ${verifiedKindExpr} ${sql.join(
  ASSIGNABLE_VERIFIED_KINDS.map((t, i) => sql`when ${t} then ${i}`),
  sql` `
)} else ${ASSIGNABLE_VERIFIED_KINDS.length} end`
