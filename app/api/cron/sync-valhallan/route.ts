import { NextResponse } from "next/server"
import { and, asc, desc, gte, lt, lte } from "drizzle-orm"
import { db } from "@/lib/db"
import { fetchLog, rankedSnapshots } from "@/lib/db/schema"
import { syncManyPlayers } from "@/lib/sync/players"
import {
  discoverAllValhallanIds,
  getStaleValhallanIds,
} from "@/lib/sync/valhallan"
import { isCronPaused } from "@/lib/sync/cron-controls"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const DEFAULT_LIMIT = 50
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
/** Rating-history snapshots older than this are pruned by the daily tick. */
const SNAPSHOT_RETENTION_MS = 180 * 24 * 60 * 60 * 1000
/**
 * Profile-view telemetry older than this is pruned by the daily tick.
 *
 * fetch_log had no retention at all and grew to 1.6M rows / 361 MB — about 72%
 * of the whole free-tier storage quota, for a table nothing but /admin reads.
 * Thirty days is far more than the admin view (newest 50 entries, plus
 * crawler-vs-organic spot checks) ever looks at.
 */
const FETCH_LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
/** Ids deleted per tick — bounded so the prune can't outrun a statement timeout. */
const FETCH_LOG_PRUNE_STEP = 100_000

function authorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const header = req.headers.get("authorization") ?? ""
  return header === `Bearer ${expected}`
}

/**
 * Sweeps the Valhallan-tier population.
 *
 * Per tick:
 *   1. Discover all current Valhallan player ids (~54 leaderboard calls,
 *      mostly cache-hit after the first run within a 5-min window).
 *   2. Filter to ids we don't have in the DB or whose last_synced > 7d.
 *   3. Sync up to `limit` of them via the standard syncPlayer pipeline.
 *
 * In steady state most ids are fresh and the tick exits cheaply. During
 * initial seeding we drain the backlog roughly 50 players per 15-min tick
 * (~5 hours to cover ~1000 Valhallans across 9 regions × 2 queues).
 *
 * Query params:
 *   - limit: override the per-tick sync ceiling.
 *   - force=1: bypass the 7-day TTL on syncPlayer (refresh everyone).
 */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (await isCronPaused("sync-valhallan")) {
    return NextResponse.json({ skipped: true, reason: "paused" })
  }

  const url = new URL(req.url)
  const limit = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT)
  const force = url.searchParams.get("force") === "1"

  const discovered = await discoverAllValhallanIds()
  const stale = force
    ? Array.from(discovered)
    : await getStaleValhallanIds(discovered, WEEK_MS)
  const batch = stale.slice(0, limit)

  const outcomes = await syncManyPlayers(batch, {
    ttlMs: WEEK_MS,
    force,
  })

  // Piggybacked housekeeping: prune rating-history snapshots past retention.
  // Best-effort — a prune failure shouldn't fail the sync tick.
  let pruned = 0
  try {
    const res = await db()
      .delete(rankedSnapshots)
      .where(
        lt(
          rankedSnapshots.takenAt,
          new Date(Date.now() - SNAPSHOT_RETENTION_MS),
        ),
      )
    pruned = res.count ?? 0
  } catch (err) {
    console.error("[sync-valhallan] snapshot prune failed:", err)
  }

  // Rolling fetch_log prune, deleted by primary-key range.
  //
  // `id` is a serial and `created_at` defaults to now(), so the two are
  // monotonic together: one index scan finds the newest id older than the
  // retention window, and the delete is then a PK range scan. The obvious
  // `WHERE id IN (SELECT ... LIMIT n)` spelling is a trap here — Postgres
  // hashes the subquery and sequentially scans the whole table to match it,
  // which on this table meant minutes per batch.
  //
  // Capped at one step per tick so a large backlog drains over a few days
  // instead of one enormous delete.
  let fetchLogPruned = 0
  try {
    const cutoff = new Date(Date.now() - FETCH_LOG_RETENTION_MS)
    const [boundary] = await db()
      .select({ id: fetchLog.id })
      .from(fetchLog)
      .where(lt(fetchLog.createdAt, cutoff))
      .orderBy(desc(fetchLog.createdAt))
      .limit(1)
    if (boundary) {
      const [oldest] = await db()
        .select({ id: fetchLog.id })
        .from(fetchLog)
        .orderBy(asc(fetchLog.id))
        .limit(1)
      if (oldest) {
        const hi = Math.min(oldest.id + FETCH_LOG_PRUNE_STEP - 1, boundary.id)
        const res = await db()
          .delete(fetchLog)
          .where(and(gte(fetchLog.id, oldest.id), lte(fetchLog.id, hi)))
        fetchLogPruned = res.count ?? 0
      }
    }
  } catch (err) {
    console.error("[sync-valhallan] fetch-log prune failed:", err)
  }

  const summary = {
    discovered: discovered.size,
    stale: stale.length,
    batched: batch.length,
    synced: outcomes.filter((o) => o.status === "synced").length,
    fresh: outcomes.filter((o) => o.status === "fresh").length,
    failed: outcomes.filter((o) => o.status === "failed").length,
    pruned,
    fetchLogPruned,
  }
  return NextResponse.json(summary)
}
