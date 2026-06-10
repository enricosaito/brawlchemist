import "server-only"

import { revalidateTag, unstable_cache } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { appUsers } from "@/lib/db/schema"

/**
 * Player favorites — the signed-in viewer's tracked-players list. Stored as
 * `app_users.prefs.favoriteTrackedIds` (a number[]), so it adds NO table and
 * rides the one prefs row we already read per session. Account-scoped (any
 * logged-in user can favorite any player) — this is NOT the profile-ownership
 * gate. Cross-device by nature (server-side), unlike device-local recent
 * visits; that's the intended split.
 *
 * V1 is free for everyone with a generous hard cap (storage/egress guard, not a
 * paywall). Reads are cached per user and fail open; writes merge into the prefs
 * blob so sibling keys (favoriteLegendIds, defaults) are never clobbered.
 */

const MAX_FAVORITES = 100

interface Prefs {
  favoriteTrackedIds?: unknown
  [key: string]: unknown
}

function favoritesTag(userId: string): string {
  return `favorites-${userId}`
}

/** Validate the stored blob into a clean, deduped, capped id list. */
function parseIds(prefs: unknown): number[] {
  const raw = (prefs as Prefs | null)?.favoriteTrackedIds
  if (!Array.isArray(raw)) return []
  const out: number[] = []
  const seen = new Set<number>()
  for (const v of raw) {
    const id = typeof v === "number" ? v : Number.parseInt(String(v), 10)
    if (Number.isInteger(id) && id > 0 && !seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
    if (out.length >= MAX_FAVORITES) break
  }
  return out
}

async function readPrefs(userId: string): Promise<Prefs> {
  const [row] = await db()
    .select({ prefs: appUsers.prefs })
    .from(appUsers)
    .where(eq(appUsers.id, userId))
    .limit(1)
  return row?.prefs && typeof row.prefs === "object" ? (row.prefs as Prefs) : {}
}

/** Cached favorite ids (newest first). Never throws — fails open to []. */
export async function getFavoriteIds(userId: string): Promise<number[]> {
  return unstable_cache(
    async (): Promise<number[]> => {
      try {
        return parseIds(await readPrefs(userId))
      } catch (err) {
        console.error("[favorites] read failed:", err)
        return []
      }
    },
    ["favorites", userId],
    { tags: [favoritesTag(userId)], revalidate: 300 },
  )()
}

export async function isFavorited(
  userId: string,
  brawlhallaId: number,
): Promise<boolean> {
  return (await getFavoriteIds(userId)).includes(brawlhallaId)
}

export interface ToggleResult {
  favorited: boolean
  /** True when an add was refused because the list is full (state unchanged). */
  atCap: boolean
}

/**
 * Add or remove a player from the viewer's favorites. Reads prefs fresh (not the
 * cache) for a correct read-modify-write, merges back so other prefs keys
 * survive, and busts the per-user cache. Caller MUST have authenticated userId.
 */
export async function toggleFavorite(
  userId: string,
  brawlhallaId: number,
): Promise<ToggleResult> {
  const prefs = await readPrefs(userId)
  const current = parseIds(prefs)
  const has = current.includes(brawlhallaId)

  if (!has && current.length >= MAX_FAVORITES) {
    return { favorited: false, atCap: true }
  }

  const next = has
    ? current.filter((id) => id !== brawlhallaId)
    : [brawlhallaId, ...current] // newest first
  const nextPrefs = { ...prefs, favoriteTrackedIds: next }
  const now = new Date()

  await db()
    .insert(appUsers)
    .values({ id: userId, prefs: nextPrefs })
    .onConflictDoUpdate({
      target: appUsers.id,
      set: { prefs: nextPrefs, updatedAt: now },
    })
  revalidateTag(favoritesTag(userId), "max")

  return { favorited: !has, atCap: false }
}
