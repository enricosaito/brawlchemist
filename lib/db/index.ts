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
 * Lazy-initialized so a missing DATABASE_URL doesn't crash unrelated routes
 * (the leaderboard page falls back to rendering without legend enrichment).
 */
let cached: PostgresJsDatabase<typeof schema> | null = null

export function db(): PostgresJsDatabase<typeof schema> {
  if (cached) return cached
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Use the Supabase 'Transaction pooler' connection string (dashboard → Connect) in .env.local / Vercel env.",
    )
  }
  cached = drizzle(postgres(url, { prepare: false }), { schema })
  return cached
}

export { schema }
