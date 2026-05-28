import "server-only"

import { headers } from "next/headers"
import { desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { fetchLog, type FetchLogRow } from "@/lib/db/schema"

export type FetchSource = "page-view" | "og-image" | "admin-save"
export type FetchResult = "cached" | "synced" | "failed"

const UA_LIMIT = 500
const REFERER_LIMIT = 500

/**
 * Insert a row recording that we just resolved (or skipped) a /ranked fetch
 * for a player. Pulls user-agent + referer from the current request so /admin
 * can identify crawlers vs. organic traffic. Fail-open — a logging failure
 * must never break the page render.
 */
export async function recordFetch(args: {
  brawlhallaId: number
  source: FetchSource
  result: FetchResult
  apiStatus?: number | null
}): Promise<void> {
  try {
    const h = await headers()
    await db()
      .insert(fetchLog)
      .values({
        brawlhallaId: args.brawlhallaId,
        source: args.source,
        result: args.result,
        apiStatus: args.apiStatus ?? null,
        userAgent: h.get("user-agent")?.slice(0, UA_LIMIT) ?? null,
        referer: h.get("referer")?.slice(0, REFERER_LIMIT) ?? null,
      })
  } catch (err) {
    console.error("[fetch-log] insert failed:", err)
  }
}

/** Newest fetch entries, for the /admin log view. */
export async function getRecentFetches(limit = 50): Promise<FetchLogRow[]> {
  try {
    return await db()
      .select()
      .from(fetchLog)
      .orderBy(desc(fetchLog.id))
      .limit(limit)
  } catch (err) {
    console.error("[fetch-log] read failed:", err)
    return []
  }
}

export async function clearFetchLog(): Promise<void> {
  await db().delete(fetchLog)
}
