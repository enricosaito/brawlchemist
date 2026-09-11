import "server-only"

import { headers } from "next/headers"
import { desc, sql } from "drizzle-orm"
import { clientLabel } from "@/lib/bots"
import { db } from "@/lib/db"
import { fetchLog, type FetchLogRow } from "@/lib/db/schema"

export type FetchSource = "page-view" | "og-image" | "admin-save"
export type FetchResult = "cached" | "synced" | "failed"

const REFERER_LIMIT = 200

/**
 * Insert a row recording that we just resolved (or skipped) a /ranked fetch
 * for a player, so /admin can identify crawlers vs. organic traffic.
 *
 * The User-Agent is collapsed to a short label rather than stored verbatim.
 * The raw strings averaged ~125 bytes — 79% of every row — and 1.6M rows put
 * this table at 362 MB, 59% of the 500 MB database quota, for something only
 * ever read as "which crawler is this". `clientLabel()` answers that in ~10
 * bytes. Paired with the retention window in the sync-valhallan cron, the
 * table now stays around 25 MB instead of growing without bound.
 *
 * Fail-open — a logging failure must never break the page render.
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
        client: clientLabel(h.get("user-agent")),
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
      .select({
        id: fetchLog.id,
        brawlhallaId: fetchLog.brawlhallaId,
        source: fetchLog.source,
        result: fetchLog.result,
        apiStatus: fetchLog.apiStatus,
        // Old rows predate `client` and carry a raw UA; fall back so the admin
        // view stays readable until the retention window rolls over.
        client: sql<string | null>`coalesce(${fetchLog.client}, ${fetchLog.userAgent})`,
        userAgent: fetchLog.userAgent,
        referer: fetchLog.referer,
        createdAt: fetchLog.createdAt,
      })
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
