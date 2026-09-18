import { NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { isCronPaused } from "@/lib/sync/cron-controls"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * How long a transaction may be held by a client that has stopped talking.
 *
 * Two minutes, because the app's own queries are milliseconds and the longest
 * sanctioned one — a full `ranked_json` scan behind the Valhallan aggregations
 * — is 25–95s and is `state = 'active'` on a *server* wait, never ClientRead.
 * Nothing legitimate sits in ClientRead inside a transaction for two minutes.
 */
const ABANDONED_AFTER = "2 minutes"

function authorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const header = req.headers.get("authorization") ?? ""
  return header === `Bearer ${expected}`
}

/**
 * Terminates database sessions abandoned mid-transaction.
 *
 * A serverless instance that dies between sending a query and reading its
 * result leaves the backend waiting in `ClientRead` with a transaction still
 * open. It holds a lock on whatever it touched — usually `players` — and parks
 * a Supavisor slot, and the pool is small and shared. Enough of them and every
 * render blocks on connection checkout until Vercel kills the function at 300s,
 * which creates another one. That feedback loop is the top runtime error on
 * this project, 803 occurrences over 322 users in a week.
 *
 * Postgres will not do this for us. `statement_timeout` does not apply — no
 * statement is running. `idle_in_transaction_session_timeout` does not fire
 * either, and that is measured rather than assumed: a backend created after
 * `ALTER ROLE postgres SET idle_in_transaction_session_timeout = '60s'` was
 * observed holding a transaction for 967 seconds. These sessions report
 * `state = 'active'`, not `idle in transaction`, because they are mid
 * extended-query — the client sent Execute and never sent Sync — and Postgres
 * only arms that timeout after a Sync.
 *
 * So we reap them ourselves. **This is only safe because the app holds no
 * explicit transactions**: `grep -rn "\.transaction("` across lib/ and app/ is
 * empty, every query is autocommit, and therefore any transaction still open
 * with a quiet client is abandoned by definition. If that ever stops being
 * true, this job has to become more careful.
 *
 * The filter is deliberately narrow. `backend_type = 'client backend'` skips
 * autovacuum and the background workers; `wait_event = 'ClientRead'` is what
 * separates "the client is gone" from "the query is still running", so a slow
 * aggregation is never a candidate; and the current database plus `pid <>
 * pg_backend_pid()` keep it off other databases and off itself.
 *
 * One caveat for a human: `drizzle-kit push` does run in a transaction. It does
 * not idle, so it will not match — but if you ever pause a push for two minutes
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
    const rows = await db().execute<{ pid: number; age_seconds: number }>(sql`
      SELECT pid, round(extract(epoch from now() - xact_start))::int AS age_seconds
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND backend_type = 'client backend'
        AND wait_event = 'ClientRead'
        AND xact_start < now() - ${ABANDONED_AFTER}::interval`)

    const candidates = Array.from(rows)
    for (const c of candidates) {
      // One at a time, and errors ignored per-pid: a backend that ended on its
      // own between the SELECT and here is the job working, not failing.
      try {
        await db().execute(sql`SELECT pg_terminate_backend(${c.pid})`)
      } catch (err) {
        console.error(`[reap-sessions] terminate ${c.pid} failed:`, err)
      }
    }

    if (candidates.length > 0) {
      console.log(
        `[reap-sessions] terminated ${candidates.length}:`,
        candidates.map((c) => `pid ${c.pid} (${c.age_seconds}s)`).join(", ")
      )
    }

    return NextResponse.json({
      ok: true,
      reaped: candidates.length,
      oldestSeconds: candidates.reduce(
        (max, c) => Math.max(max, c.age_seconds),
        0
      ),
    })
  } catch (err) {
    // Fails open like everything else — a reap that cannot run is a slot that
    // stays parked, not a broken site.
    console.error("[reap-sessions] failed:", err)
    return NextResponse.json({ ok: false, error: "reap_failed" }, { status: 500 })
  }
}
