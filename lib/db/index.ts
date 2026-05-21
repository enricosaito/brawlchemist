import "server-only"

import { neon } from "@neondatabase/serverless"
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http"
import * as schema from "./schema"

/**
 * Drizzle client backed by Neon's HTTP driver. The HTTP driver is the right
 * pick for Vercel Fluid Compute — no connection pool to babysit, no warmup
 * cost, and it works the same in middleware and server components.
 *
 * Lazy-initialized so a missing DATABASE_URL doesn't crash unrelated routes
 * (the leaderboard page falls back to rendering without legend enrichment).
 */
let cached: NeonHttpDatabase<typeof schema> | null = null

export function db(): NeonHttpDatabase<typeof schema> {
  if (cached) return cached
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Install Neon via the Vercel Marketplace and run `vercel env pull .env.local` (or paste the URL into .env.local manually).",
    )
  }
  cached = drizzle(neon(url), { schema })
  return cached
}

export { schema }
