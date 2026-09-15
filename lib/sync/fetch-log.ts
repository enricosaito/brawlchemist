import "server-only"

import { headers } from "next/headers"
import { desc } from "drizzle-orm"
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
 * Callers pass the client/referer they captured with requestClientInfo() —
 * this function never touches request APIs, so it is safe to defer with
 * after().
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
export interface RequestClientInfo {
  client: string
  referer: string | null
}

/**
 * Read the requesting client from the current request. MUST be called during
 * render / inside a Server Action — i.e. while the request scope still exists.
 *
 * This is split out deliberately. recordFetch used to call `headers()`
 * itself, which broke the moment the call was deferred with `after()`:
 * request APIs are unavailable once the response has been sent, the throw was
 * swallowed by recordFetch's own fail-open catch, and logging silently stopped
 * dead (confirmed to the second — the last row landed 90ms before the deploy
 * that introduced it). Keeping the header read here and passing plain values
 * into recordFetch means a deferred write can never reach for request state.
 */
export async function requestClientInfo(): Promise<RequestClientInfo> {
  try {
    const h = await headers()
    return {
      client: clientLabel(h.get("user-agent")),
      referer: h.get("referer")?.slice(0, REFERER_LIMIT) ?? null,
    }
  } catch {
    return { client: "unknown", referer: null }
  }
}

export async function recordFetch(args: {
  brawlhallaId: number
  source: FetchSource
  result: FetchResult
  apiStatus?: number | null
  /** From requestClientInfo(), captured while the request scope was alive. */
  client?: string | null
  referer?: string | null
}): Promise<void> {
  try {
    await db()
      .insert(fetchLog)
      .values({
        brawlhallaId: args.brawlhallaId,
        source: args.source,
        result: args.result,
        apiStatus: args.apiStatus ?? null,
        client: args.client ?? "unknown",
        referer: args.referer ?? null,
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
        client: fetchLog.client,
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
