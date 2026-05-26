import { NextResponse } from "next/server"
import { discoverAndSyncGuilds } from "@/lib/sync/guilds"
import { isCronPaused } from "@/lib/sync/cron-controls"

export const dynamic = "force-dynamic"
export const maxDuration = 300

function authorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  return (req.headers.get("authorization") ?? "") === `Bearer ${expected}`
}

/**
 * Discover & refresh guilds. Walks the top-rated players whose guild we haven't
 * checked recently (GetPlayerGuild), then syncs each guild it finds
 * (GetGuildStats + members). Throttled internally to stay under the rate limit,
 * so it fills the guild pool gradually over many ticks. Override the slice with
 * ?players=N and force re-sync with ?force=1.
 */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (await isCronPaused("sync-guilds")) {
    return NextResponse.json({ skipped: true, reason: "paused" })
  }

  const url = new URL(req.url)
  const playerLimit = Number(url.searchParams.get("players")) || 15
  const force = url.searchParams.get("force") === "1"

  const summary = await discoverAndSyncGuilds({ playerLimit, force })
  return NextResponse.json(summary)
}
