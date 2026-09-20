import { NextResponse } from "next/server"
import { isCronPaused } from "@/lib/sync/cron-controls"
import { reapAbandonedSessions } from "@/lib/sync/sessions"

export const dynamic = "force-dynamic"
export const maxDuration = 60

function authorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const header = req.headers.get("authorization") ?? ""
  return header === `Bearer ${expected}`
}

/**
 * Terminates database sessions abandoned mid-transaction, every minute.
 *
 * The what and the why live in lib/sync/sessions.ts, which the System tab also
 * reads so an operator can see a jam and clear it by hand. This route is the
 * schedule and the auth around it.
 *
 * Every minute rather than every five, against a one-minute threshold rather
 * than two: the window that matters is threshold + interval, because that is
 * how long an abandoned session can pin a Supavisor connection, and two such
 * sessions were measured to be enough to make `select 1` through the pooler
 * time out. This is the cheapest job in the schedule — one indexed read and
 * usually zero terminations — and the thing it prevents is the entire site
 * queueing on a pooler with nothing free to hand out.
 *
 * One caveat for a human: `drizzle-kit push` does run in a transaction. It does
 * not idle, so it will not match — but if you ever pause a push for a minute
 * mid-statement, this is the job that would end it.
 */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (await isCronPaused("reap-sessions")) {
    return NextResponse.json({ ok: true, paused: true, reaped: 0 })
  }

  try {
    const { reaped, oldestSeconds } = await reapAbandonedSessions()
    return NextResponse.json({ ok: true, reaped, oldestSeconds })
  } catch (err) {
    // Fails open like everything else — a reap that cannot run is a slot that
    // stays parked, not a broken site.
    console.error("[reap-sessions] failed:", err)
    return NextResponse.json(
      { ok: false, error: "reap_failed" },
      { status: 500 }
    )
  }
}
