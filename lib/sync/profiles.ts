import "server-only"

import { revalidateTag, unstable_cache } from "next/cache"
import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { profiles, type ProfileRow } from "@/lib/db/schema"
import type { PlayerPreview } from "@/lib/player-previews"

/**
 * Per-player presentation profiles (verified-pro status, favorite skin,
 * accolades) keyed by brawlhalla id. Today these are admin-curated (no API
 * source) and maintained through /admin; the `userId` column reserves a future
 * auth owner so players can eventually claim their own profile.
 *
 * Reads are cached app-wide under one tag and busted on every write, so the
 * profile/podium/search pay ~nothing for them between edits.
 */
const TAG = "profiles"

/**
 * Cache tag for the profiles map. Exported because the claim flow also writes
 * `profiles.userId`, and the read side now projects that into
 * `PlayerPreview.claimed` — so a claim has to bust this the same way an admin
 * edit does, or the badge doesn't appear until the hourly revalidate.
 */
export const PROFILES_TAG = TAG

export interface FavoriteSkin {
  src: string
  name: string
}

/** Admin-facing row shape (the raw record, not the read-side PlayerPreview). */
export interface ProfileRecord {
  brawlhallaId: number
  isPro: boolean
  handle: string | null
  favoriteSkin: FavoriteSkin | null
  achievements: string[]
  updatedAt: Date
}

/** Fields the admin form can set. */
export interface ProfileInput {
  brawlhallaId: number
  isPro: boolean
  handle: string | null
  favoriteSkin: FavoriteSkin | null
  achievements: string[]
}

/**
 * Unwrap a jsonb value that was stored double-encoded — an array or object
 * serialised to a *string* and then written into the jsonb column, so the
 * column holds `"[\"…\"]"` rather than `["…"]`.
 *
 * The admin form and the seed script both write these columns properly; two
 * rows (Kyna, Lopes) arrived this way from hand-written SQL, and the shape is
 * invisible until something reads it: `Array.isArray` says no, the parser
 * returns empty, and the player silently loses their accolades — and with
 * them their favorite skin *and* their flair, since flair entitlement is
 * derived from `achievements`. It read as "the Live Rankings card drops some
 * flair" because that card is where a missing badge is most visible, but the
 * row was blank on every surface.
 *
 * Unwrapping exactly one level (and only for a string that parses) keeps a
 * legitimately string-valued field from being reinterpreted, and costs one
 * `typeof` on the common path.
 */
function unwrapJson(value: unknown): unknown {
  if (typeof value !== "string") return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export function parseSkin(value: unknown): FavoriteSkin | null {
  const raw = unwrapJson(value)
  if (raw && typeof raw === "object") {
    const v = raw as { src?: unknown; name?: unknown }
    if (typeof v.src === "string" && v.src) {
      return { src: v.src, name: typeof v.name === "string" ? v.name : "" }
    }
  }
  return null
}

export function parseAchievements(value: unknown): string[] {
  const raw = unwrapJson(value)
  return Array.isArray(raw)
    ? raw.filter((a): a is string => typeof a === "string")
    : []
}

function toRecord(row: ProfileRow): ProfileRecord {
  return {
    brawlhallaId: row.brawlhallaId,
    isPro: row.isPro,
    handle: row.handle,
    favoriteSkin: parseSkin(row.favoriteSkin),
    achievements: parseAchievements(row.achievements),
    updatedAt: row.updatedAt,
  }
}

/** Read-side projection consumed across the public UI. */
function toPreview(row: ProfileRow): PlayerPreview {
  const skin = parseSkin(row.favoriteSkin)
  const achievements = parseAchievements(row.achievements)
  return {
    favoriteSkin: skin ?? undefined,
    verified: row.isPro ? { handle: row.handle ?? "" } : undefined,
    achievements: achievements.length ? achievements : undefined,
    // undefined rather than false so unclaimed players add no key to the
    // cached object — this map holds every profile row.
    claimed: row.userId ? true : undefined,
  }
}

// unstable_cache can't serialize a Map, so cache a plain object keyed by id
// (string keys after JSON), then hydrate to a Map at the call site.
const getProfilesObject = unstable_cache(
  async (): Promise<Record<string, PlayerPreview>> => {
    let rows: ProfileRow[]
    try {
      rows = await db().select().from(profiles)
    } catch (err) {
      // Fail open — the UI renders fine without profiles.
      console.error("[profiles] read failed:", err)
      return {}
    }
    const obj: Record<string, PlayerPreview> = {}
    for (const r of rows) obj[String(r.brawlhallaId)] = toPreview(r)
    return obj
  },
  ["profiles-map"],
  { tags: [TAG], revalidate: 3600 },
)

/** All profiles as a Map<brawlhallaId, PlayerPreview> (cached). */
export async function getProfilesMap(): Promise<Map<number, PlayerPreview>> {
  const obj = await getProfilesObject()
  const map = new Map<number, PlayerPreview>()
  for (const [k, v] of Object.entries(obj)) map.set(Number(k), v)
  return map
}

/** A single player's preview, or undefined (cached via the map). */
export async function getProfile(
  brawlhallaId: number,
): Promise<PlayerPreview | undefined> {
  return (await getProfilesMap()).get(brawlhallaId)
}

// ---- Admin reads/writes (uncached; admin sees fresh data) -------------------

export async function listProfiles(): Promise<ProfileRecord[]> {
  const rows = await db()
    .select()
    .from(profiles)
    .orderBy(desc(profiles.updatedAt))
  return rows.map(toRecord)
}

export async function getProfileRecord(
  brawlhallaId: number,
): Promise<ProfileRecord | null> {
  const [row] = await db()
    .select()
    .from(profiles)
    .where(eq(profiles.brawlhallaId, brawlhallaId))
    .limit(1)
  return row ? toRecord(row) : null
}

export async function upsertProfile(input: ProfileInput): Promise<void> {
  const values = {
    brawlhallaId: input.brawlhallaId,
    isPro: input.isPro,
    handle: input.handle,
    favoriteSkin: input.favoriteSkin,
    achievements: input.achievements,
    updatedAt: new Date(),
  }
  await db()
    .insert(profiles)
    .values(values)
    .onConflictDoUpdate({
      target: profiles.brawlhallaId,
      set: {
        isPro: values.isPro,
        handle: values.handle,
        favoriteSkin: values.favoriteSkin,
        achievements: values.achievements,
        updatedAt: values.updatedAt,
      },
    })
  revalidateTag(TAG, "max")
}

export async function deleteProfile(brawlhallaId: number): Promise<void> {
  await db().delete(profiles).where(eq(profiles.brawlhallaId, brawlhallaId))
  revalidateTag(TAG, "max")
}
