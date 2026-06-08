import "server-only"

import { and, desc, eq, gte, lt } from "drizzle-orm"
import type { PlayerRanked } from "@/lib/brawlhalla-api"
import { db } from "@/lib/db"
import { rankedSnapshots } from "@/lib/db/schema"

/** Belt-and-suspenders against overlapping cron + page-view writes; the normal
 * write cadences (15-min profile freshness, 24h/7d cron TTLs) rarely hit it. */
const MIN_INTERVAL_MS = 10 * 60 * 1000

export interface RatingPoint {
  rating: number
  games: number
  takenAt: Date
}

/**
 * Record a rating snapshot from a fresh /ranked payload, if it adds signal.
 * Skips: shells (no rating / zero games), unchanged (rating, games) pairs —
 * no matches played since the last snapshot — and writes within the
 * min-interval window. Callers piggyback this onto existing API fetches, so
 * history accrues at zero extra API cost.
 */
export async function maybeInsertSnapshot(ranked: PlayerRanked): Promise<void> {
  // The /ranked endpoint returns a 750-rating zero-games shell for accounts
  // with no ranked play this season — never snapshot those.
  if (typeof ranked.rating !== "number" || !ranked.games || ranked.games <= 0) {
    return
  }

  const latest = await db()
    .select({
      rating: rankedSnapshots.rating,
      games: rankedSnapshots.games,
      takenAt: rankedSnapshots.takenAt,
    })
    .from(rankedSnapshots)
    .where(eq(rankedSnapshots.brawlhallaId, ranked.brawlhalla_id))
    .orderBy(desc(rankedSnapshots.takenAt))
    .limit(1)

  const prev = latest[0]
  if (prev) {
    // No matches since the last snapshot → nothing to record. Keeps storage
    // proportional to actual play, not to page traffic.
    if (prev.rating === ranked.rating && prev.games === ranked.games) return
    if (Date.now() - prev.takenAt.getTime() < MIN_INTERVAL_MS) return
  }

  await db()
    .insert(rankedSnapshots)
    .values({
      brawlhallaId: ranked.brawlhalla_id,
      rating: ranked.rating,
      games: ranked.games,
    })
    .onConflictDoNothing()
}

/**
 * A player's rating series for the chart window, oldest first. Also fetches
 * the single snapshot immediately *before* the window and prepends it, so the
 * line enters at the chart's left edge and the window delta has a correct
 * baseline even for sparse histories.
 */
export async function getRatingHistory(
  brawlhallaId: number,
  days = 30,
): Promise<RatingPoint[]> {
  const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const columns = {
    rating: rankedSnapshots.rating,
    games: rankedSnapshots.games,
    takenAt: rankedSnapshots.takenAt,
  }

  const [inWindow, before] = await Promise.all([
    db()
      .select(columns)
      .from(rankedSnapshots)
      .where(
        and(
          eq(rankedSnapshots.brawlhallaId, brawlhallaId),
          gte(rankedSnapshots.takenAt, windowStart),
        ),
      )
      .orderBy(rankedSnapshots.takenAt),
    db()
      .select(columns)
      .from(rankedSnapshots)
      .where(
        and(
          eq(rankedSnapshots.brawlhallaId, brawlhallaId),
          lt(rankedSnapshots.takenAt, windowStart),
        ),
      )
      .orderBy(desc(rankedSnapshots.takenAt))
      .limit(1),
  ])

  return before.length > 0 ? [before[0], ...inWindow] : inWindow
}
