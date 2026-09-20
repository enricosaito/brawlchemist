import "server-only"

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

/**
 * Database sessions abandoned mid-transaction, and how we end them.
 *
 * A serverless instance that dies between sending a query and reading its
 * result leaves the backend waiting in `ClientRead` with a transaction still
 * open. It holds a lock on whatever it touched and — because the transaction
 * pooler pins a server connection for the life of a transaction — it parks a
 * Supavisor slot until something kills it. Postgres will not:
 * `statement_timeout` does not apply because no statement is running, and
 * `idle_in_transaction_session_timeout` never arms because these report
 * `state = 'active'`, not `idle in transaction` (the client sent Execute and
 * never sent Sync, and that timeout only starts after a Sync). That is
 * measured, not assumed — a backend created after
 * `ALTER ROLE postgres SET idle_in_transaction_session_timeout = '60s'` was
 * observed holding a transaction for 967 seconds.
 *
 * **Two of them is enough to take the site down.** Measured 2026-09-20: with
 * exactly two abandoned sessions present, `select 1` through the transaction
 * pooler failed with `57014 canceling statement due to statement timeout`;
 * terminating those two restored it to 1.7s immediately. Everything queues
 * behind the pooler, renders run to Vercel's 300s limit, and each killed
 * function leaves another abandoned session — which is the feedback loop
 * behind this project's top runtime error.
 *
 * This module is the one implementation. The cron runs it every minute; the
 * System tab shows the count and offers the same button, because the operator
 * is the person who notices a freeze first and an invisible failure is the
 * worst kind.
 */

/**
 * How long a transaction may be held by a client that has stopped talking.
 *
 * One minute. `statement_timeout` for this role is 30s, so no legitimate
 * statement can be in flight longer; the filter also requires `ClientRead`,
 * which means the backend is not executing anything at all. A transaction in
 * that state for a minute is abandoned by definition.
 */
export const ABANDONED_AFTER = "1 minute"

export interface AbandonedSession {
  pid: number
  ageSeconds: number
}

/**
 * The narrow filter, in one place so the reader and the reaper cannot drift.
 *
 * `backend_type = 'client backend'` skips autovacuum and the background
 * workers. `wait_event = 'ClientRead'` is what separates "the client is gone"
 * from "the query is still running", so a slow aggregation is never a
 * candidate. The current database and `pid <> pg_backend_pid()` keep it off
 * other databases and off itself.
 *
 * **Safe only because the app holds no explicit transactions**: every query is
 * autocommit, so an open transaction with a quiet client is abandoned by
 * definition. If that ever stops being true, this has to become more careful.
 */
function abandonedQuery() {
  return sql`
    SELECT pid, round(extract(epoch from now() - xact_start))::int AS age_seconds
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
      AND backend_type = 'client backend'
      AND wait_event = 'ClientRead'
      AND xact_start < now() - ${ABANDONED_AFTER}::interval`
}

/** Who is stuck, without touching them. Fails open to an empty list. */
export async function listAbandonedSessions(): Promise<AbandonedSession[]> {
  try {
    const rows = await db().execute<{ pid: number; age_seconds: number }>(
      abandonedQuery()
    )
    return Array.from(rows).map((r) => ({
      pid: r.pid,
      ageSeconds: Number(r.age_seconds),
    }))
  } catch (err) {
    // Telemetry on an admin screen must never take it down.
    console.error("[sessions] read failed:", err)
    return []
  }
}

export interface ReapResult {
  reaped: number
  oldestSeconds: number
}

/** Terminate them. Returns what it ended. */
export async function reapAbandonedSessions(): Promise<ReapResult> {
  const candidates = await listAbandonedSessions()
  for (const c of candidates) {
    // One at a time, and errors ignored per-pid: a backend that ended on its
    // own between the SELECT and here is the job working, not failing.
    try {
      await db().execute(sql`SELECT pg_terminate_backend(${c.pid})`)
    } catch (err) {
      console.error(`[sessions] terminate ${c.pid} failed:`, err)
    }
  }
  if (candidates.length > 0) {
    console.log(
      `[sessions] terminated ${candidates.length}:`,
      candidates.map((c) => `pid ${c.pid} (${c.ageSeconds}s)`).join(", ")
    )
  }
  return {
    reaped: candidates.length,
    oldestSeconds: candidates.reduce((m, c) => Math.max(m, c.ageSeconds), 0),
  }
}
