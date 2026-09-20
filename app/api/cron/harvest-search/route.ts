import { NextResponse } from "next/server"
import { isCronPaused } from "@/lib/sync/cron-controls"
import { harvestSearchIndex } from "@/lib/sync/search-index"

export const dynamic = "force-dynamic"
export const maxDuration = 60

function authorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const header = req.headers.get("authorization") ?? ""
  return header === `Bearer ${expected}`
}

/**
 * Walks the ladders downward so the middle of them becomes searchable.
 *
 * See lib/sync/search-index.ts for why this is affordable and what it refuses
 * to write. The short version: fifty players per request instead of one, thin
 * rows with no `ranked_json`, and a sentinel `last_synced` so a visit still
 * fetches the real payload.
 *
 * **Ten pages a tick, and that number is the whole safety argument.** The
 * budget is 180 requests per 15 minutes, shared with every profile view; the
 * existing leaderboard cron spends one per tick. Ten is generous next to that
 * and nowhere near the ceiling, so the sweep never competes with a page load.
 * At 288 ticks a day the ~3,500-page walk finishes in under two days, after
 * which the cursor parks on `done` and the job costs a single database read.
 *
 * Pausable from /admin like the others, which matters more here than for the
 * rest: this is the only job whose whole purpose is to spend budget slowly.
 */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (await isCronPaused("harvest-search")) {
    return NextResponse.json({ skipped: true, reason: "paused" })
  }
  const result = await harvestSearchIndex("harvest-search")
  return NextResponse.json(result)
}
