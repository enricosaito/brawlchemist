import { NextResponse } from "next/server"
import { LIVE_QUEUES, syncLiveQueue } from "@/lib/sync/live"
import { isCronPaused } from "@/lib/sync/cron-controls"

export const dynamic = "force-dynamic"
export const maxDuration = 300

function authorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const header = req.headers.get("authorization") ?? ""
  return header === `Bearer ${expected}`
}

/**
 * Live ranked queue poll — refreshes the top-500 snapshot for each tracked
 * queue (1v1, 2v2) and diffs it to flag who's currently playing. ~10 API calls
 * per queue; runs every 5 min (see vercel.ts). Pausable from /admin.
 */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (await isCronPaused("sync-live")) {
    return NextResponse.json({ skipped: true, reason: "paused" })
  }

  const results = []
  for (const queue of LIVE_QUEUES) {
    try {
      results.push(await syncLiveQueue(queue))
    } catch (err) {
      results.push({
        queue,
        error: err instanceof Error ? err.message : "unknown error",
      })
    }
  }

  return NextResponse.json({ results })
}
