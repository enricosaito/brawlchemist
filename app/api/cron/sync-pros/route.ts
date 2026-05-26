import { NextResponse } from "next/server"
import { listOverrides } from "@/lib/sync/player-overrides"
import { syncManyPlayers } from "@/lib/sync/players"
import { isCronPaused } from "@/lib/sync/cron-controls"

export const dynamic = "force-dynamic"
export const maxDuration = 300

function authorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  return (req.headers.get("authorization") ?? "") === `Bearer ${expected}`
}

/**
 * Refresh verified pros' ranked standings into the players table, which the
 * pro leaderboard reads from. Throttled via syncManyPlayers (5s between live
 * calls, skips rows fresher than the TTL) so it never bursts the rate limit.
 */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (await isCronPaused("sync-pros")) {
    return NextResponse.json({ skipped: true, reason: "paused" })
  }

  const overrides = await listOverrides()
  const proIds = overrides.filter((o) => o.pro).map((o) => o.brawlhallaId)
  const force = new URL(req.url).searchParams.get("force") === "1"

  // Refresh pros older than ~45 min (or all when forced). Pro ELO moves slowly
  // and there are few of them, so this stays well under the rate limit.
  const outcomes = await syncManyPlayers(proIds, {
    ttlMs: 45 * 60 * 1000,
    force,
  })

  return NextResponse.json({
    total: proIds.length,
    synced: outcomes.filter((o) => o.status === "synced").length,
    fresh: outcomes.filter((o) => o.status === "fresh").length,
    failed: outcomes.filter((o) => o.status === "failed").length,
  })
}
