import { NextResponse } from "next/server"
import { and, asc, desc, gte, lt, lte } from "drizzle-orm"
import { db } from "@/lib/db"
import { fetchLog, queueActivity, rankedSnapshots } from "@/lib/db/schema"
import { syncManyPlayers } from "@/lib/sync/players"
import {
  discoverAllValhallanIds,
  getStaleValhallanIds,
  refreshValhallanMembers,
  refreshValhallanStats,
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
 * fetch_log had no retention at all and grew to 1.6M rows / 362 MB — 59% of
 * the 500 MB database quota, for a table nothing but /admin reads. At ~15k
 * rows/day, fourteen days is ~210k rows (~25 MB with the compact client
 * label) and still far more than the admin view — newest 50 entries, plus
 * crawler-vs-organic spot checks — ever looks at.
 */
const FETCH_LOG_RETENTION_MS = 14 * 24 * 60 * 60 * 1000
/**
 * Queue-activity buckets older than this are dropped. Six months is plenty for
 * a "when is it busiest" curve and keeps the table in single-digit MB — it
 * accrues ~432 rows/day at current region coverage.
 */
const QUEUE_ACTIVITY_RETENTION_MS = 180 * 24 * 60 * 60 * 1000
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

  // Persist who each ladder calls Valhallan, for every region.
  //
  // Runs before the re-sync discovery on purpose: the three competitive
  // ladders are the same leaderboard URLs, so doing it in this order means
  // discoverAllValhallanIds below comes off the fetch cache instead of the
  // other way round. Best-effort — a membership refresh failure must not cost
  // us the player sync, which is what this cron is actually scheduled for.
  let members: Awaited<ReturnType<typeof refreshValhallanMembers>> = []
  try {
    members = await refreshValhallanMembers()
  } catch (err) {
    console.error("[sync-valhallan] member refresh failed:", err)
  }

  // Precompute the meta aggregations into valhallan_stats, so no visitor's
  // request ever runs one. It goes here, right after the member refresh, for
  // the same reason the snapshot prune does: this is the job that owns the
  // Valhallan pool, and the stats are a function of it. ~50 aggregations at
  // roughly half a second each — which only became cron-shaped after the
  // indexed-rating fix took them from 16-31s.
  let stats = { written: 0, failed: 0 }
  try {
    stats = await refreshValhallanStats()
  } catch (err) {
    console.error("[sync-valhallan] stats refresh failed:", err)
  }

  // statsOnly=1 stops here. The rest of this job walks the leaderboard API and
  // syncs players, which spends the 180/15min budget (cardinal constraint #1) —
  // so "recompute the meta" and "refresh the pool" need to be separable. It is
  // what you want after a deploy that changes an aggregation, and the only way
  // to repopulate valhallan_stats without paying for a pool refresh nobody
  // asked for.
  if (new URL(req.url).searchParams.get("statsOnly") === "1") {
    return NextResponse.json({ statsOnly: true, stats })
  }

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
          new Date(Date.now() - SNAPSHOT_RETENTION_MS)
        )
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

  // Queue-activity retention. Small table, so a single bounded delete is fine.
  let activityPruned = 0
  try {
    const res = await db()
      .delete(queueActivity)
      .where(
        lt(
          queueActivity.bucket,
          new Date(Date.now() - QUEUE_ACTIVITY_RETENTION_MS)
        )
      )
    activityPruned = res.count ?? 0
  } catch (err) {
    console.error("[sync-valhallan] queue-activity prune failed:", err)
  }

  const summary = {
    stats,
    // Per-ladder membership. `skipped` names any ladder whose walk came back
    // incomplete (almost always a 429) and therefore kept its previous row —
    // worth seeing, since a ladder that skips every day is silently stale.
    members: members.reduce((n, m) => n + m.count, 0),
    memberLadders: members.filter((m) => m.stored).length,
    memberSkipped: members
      .filter((m) => !m.stored)
      .map((m) => `${m.queue}/${m.region}`),
    // Ladders that ran out of pages while still finding Valhallans — their
    // tail is cut. One-offs are noise; a ladder here every day means the walk
    // needs more pages (MAX_PAGES in lib/sync/valhallan.ts).
    memberCapped: members
      .filter((m) => m.capped)
      .map((m) => `${m.queue}/${m.region}`),
    discovered: discovered.size,
    stale: stale.length,
    batched: batch.length,
    synced: outcomes.filter((o) => o.status === "synced").length,
    fresh: outcomes.filter((o) => o.status === "fresh").length,
    failed: outcomes.filter((o) => o.status === "failed").length,
    pruned,
    fetchLogPruned,
    activityPruned,
  }
  return NextResponse.json(summary)
}
