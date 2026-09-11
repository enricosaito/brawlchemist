import "server-only"

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

/**
 * Drizzle client backed by postgres-js, pointed at Supabase's Supavisor pooler
 * (transaction mode, port 6543). `prepare: false` is required there: the
 * transaction pooler hands each query a fresh backend connection, so
 * server-side prepared statements can't be reused across calls.
 *
 * Pool sizing matters more here than in a long-lived server. Every serverless
 * instance gets its own pool, and postgres-js defaults to max: 10 with NO idle
 * timeout — so each instance parks up to ten Supavisor client slots forever.
 * Across concurrent instances plus three crons that exhausts the free-tier
 * pool, and every other request then dies on
 * "unable to check out connection from the pool after 15000ms". A small pool
 * that returns its connections is strictly better: page renders issue a
 * handful of queries, and Promise.all fan-out is what MAX_CONNECTIONS covers.
 *
 * `fetch_types: false` skips postgres-js's per-connection type-introspection
 * query against pg_catalog.pg_type. On a long-lived server that's one query at
 * boot; here every new serverless connection paid for it, and
 * pg_stat_statements had it at 64,005 calls returning 22.7M rows and ~15
 * minutes of cumulative execution. Drizzle declares the types it needs, so the
 * introspected OID map is unused.
 *
 * Note on statement timeouts: Supavisor's transaction pooler IGNORES a
 * statement_timeout passed as a connection startup parameter — `show
 * statement_timeout` still reports the server default of 2min through :6543.
 * A real per-query cap has to come from `ALTER ROLE ... SET statement_timeout`
 * on the database itself, so it is deliberately NOT configured here rather
 * than set to a value that quietly does nothing.
 *
 * Lazy-initialized so a missing DATABASE_URL doesn't crash unrelated routes
 * (the leaderboard page falls back to rendering without legend enrichment).
 */
const MAX_CONNECTIONS = 4
const IDLE_TIMEOUT_SECONDS = 20
const CONNECT_TIMEOUT_SECONDS = 15
let cached: PostgresJsDatabase<typeof schema> | null = null

export function db(): PostgresJsDatabase<typeof schema> {
  if (cached) return cached
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Use the Supabase 'Transaction pooler' connection string (dashboard → Connect) in .env.local / Vercel env.",
    )
  }
  cached = drizzle(
    postgres(url, {
      prepare: false,
      fetch_types: false,
      max: MAX_CONNECTIONS,
      idle_timeout: IDLE_TIMEOUT_SECONDS,
      connect_timeout: CONNECT_TIMEOUT_SECONDS,
    }),
    { schema },
  )
  return cached
}

export { schema }
