import "server-only"

import { unstable_cache } from "next/cache"
import { eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { appUsers, players, profiles } from "@/lib/db/schema"

/**
 * The signed-in viewer's preferred ladder region.
 *
 * Two sources, in order:
 *
 *   1. `app_users.prefs.defaultRegion` — the explicit setting the prefs blob
 *      has always reserved a slot for. Nothing writes it yet; honouring it here
 *      means a future settings screen works without touching this code.
 *   2. The region of the player they've claimed. If you've proved you're a
 *      BRZ player, BRZ is the queue you care about — no setting required.
 *
 * Region comes out of `ranked_json->>'region'`, which is the only place it
 * has ever been — there was a cheap `ladder_region` scalar in front of this
 * once, written by a harvest nothing called, and it was null for every row in
 * the table. Touching the blob is fine *here* specifically — it's one row behind a primary key, behind a
 * five-minute cache, so /live re-rendering every 45 seconds doesn't repeat it.
 * Doing the same across a list of players would not be fine (constraint #2).
 *
 * One round trip — every join is a primary-key or unique lookup — and cached
 * per user, so the auto-refresh doesn't re-query. Fails open to null, which
 * simply means the caller falls back to its own default.
 */
export async function getViewerDefaultRegion(
  userId: string,
): Promise<string | null> {
  return unstable_cache(
    async (): Promise<string | null> => {
      try {
        const [row] = await db()
          .select({
            prefRegion: appUsers.prefs,
            claimedRegion: sql<string | null>`${players.rankedJson}->>'region'`,
          })
          .from(profiles)
          .leftJoin(players, eq(players.brawlhallaId, profiles.brawlhallaId))
          .leftJoin(appUsers, eq(appUsers.id, profiles.userId))
          .where(eq(profiles.userId, userId))
          .limit(1)
        if (!row) return null
        const prefs = row.prefRegion as { defaultRegion?: unknown } | null
        const explicit =
          typeof prefs?.defaultRegion === "string" ? prefs.defaultRegion : null
        return explicit || row.claimedRegion || null
      } catch (err) {
        console.error("[viewer-prefs] default region lookup failed:", err)
        return null
      }
    },
    ["viewer-default-region", userId],
    { revalidate: 300 },
  )()
}
