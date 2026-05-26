import { NextResponse } from "next/server"
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
  const summary = {
    discovered: discovered.size,
    stale: stale.length,
    batched: batch.length,
    synced: outcomes.filter((o) => o.status === "synced").length,
    fresh: outcomes.filter((o) => o.status === "fresh").length,
    failed: outcomes.filter((o) => o.status === "failed").length,
  }
  return NextResponse.json(summary)
}
