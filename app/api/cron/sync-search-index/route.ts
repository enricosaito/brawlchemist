import { NextResponse } from "next/server"
import { isApiRegion, type ApiRegion } from "@/lib/brawlhalla-api"
import { harvestRegion, regionForTick } from "@/lib/sync/search-index"
import { isCronPaused } from "@/lib/sync/cron-controls"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// Rotation bucket — matches the cron schedule (every 20 min) so each tick
// advances to the next region. All regions covered roughly every 3 hours.
const BUCKET_MS = 20 * 60 * 1000

function authorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const header = req.headers.get("authorization") ?? ""
  return header === `Bearer ${expected}`
}

/**
 * Harvests the 1v1 Diamond+ ladder into searchable name-only rows.
 *
 * Per tick: walk one region's ladder (rotated by the clock) down to the
 * Diamond floor and upsert id/username/rating. No per-player fetches.
 *
 * Query params:
 *   - region: harvest a specific region instead of the rotation (manual seed).
 *   - pages: override the per-region page cap.
 */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (await isCronPaused("sync-search-index")) {
    return NextResponse.json({ skipped: true, reason: "paused" })
  }

  const url = new URL(req.url)
  const qRegion = url.searchParams.get("region")
  const region: ApiRegion =
    qRegion && qRegion !== "ALL" && isApiRegion(qRegion)
      ? (qRegion as ApiRegion)
      : regionForTick(new Date(), BUCKET_MS)
  const pages = Number(url.searchParams.get("pages")) || undefined

  const result = await harvestRegion(region, { maxPages: pages })
  return NextResponse.json(result)
}
