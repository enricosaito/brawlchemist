import { NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { REFRESHABLE_TAGS } from "@/lib/sync/cache-tags"

export const dynamic = "force-dynamic"
export const maxDuration = 60

function authorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const header = req.headers.get("authorization") ?? ""
  return header === `Bearer ${expected}`
}

/**
 * The /admin "Refresh caches" button, as something a terminal can call.
 *
 * The button is the right home for this and stays the primary one — but it is
 * reachable only by an admin with a browser session, and the case a refresh is
 * most needed for is the opposite of that: a sync script finishing in a
 * terminal, which cannot bust a tag no matter what it wrote. Until now the
 * only answer was "log in and press a button", which is a poor ending for a
 * ten-minute backfill and impossible from a script.
 *
 * Guarded by CRON_SECRET, the same bearer every cron route here uses. It is
 * deliberately NOT scheduled in vercel.ts: a cache that refreshes itself on a
 * timer is just a shorter revalidate window, and these are six hours for a
 * reason. This exists to be called at the end of a job that changed something.
 *
 * Safe by construction — it discards cached values and writes nothing, so the
 * worst a spurious call does is make the next few requests recompute.
 */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  for (const tag of REFRESHABLE_TAGS) revalidateTag(tag, "max")
  return NextResponse.json({
    refreshed: REFRESHABLE_TAGS.length,
    tags: REFRESHABLE_TAGS,
  })
}
