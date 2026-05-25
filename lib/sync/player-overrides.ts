import "server-only"

import { revalidateTag, unstable_cache } from "next/cache"
import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { playerOverrides, type PlayerOverrideRow } from "@/lib/db/schema"
import type { PlayerPreview } from "@/lib/player-previews"

/**
 * Admin-curated presentation overrides (verified-pro status, favorite skin,
 * accolades) layered onto players by brawlhalla id. These have no API source —
 * they're maintained through /admin and stored in the player_overrides table.
 *
 * Reads are cached app-wide under one tag and busted on every write, so the
 * profile/podium/search pay ~nothing for them between edits.
 */
const TAG = "player-overrides"

export interface FavoriteSkin {
  src: string
  name: string
}

/** Admin-facing row shape (the raw record, not the read-side PlayerPreview). */
export interface OverrideRecord {
  brawlhallaId: number
  pro: boolean
  handle: string | null
  favoriteSkin: FavoriteSkin | null
  achievements: string[]
  updatedAt: Date
}

/** Fields the admin form can set. */
export interface OverrideInput {
  brawlhallaId: number
  pro: boolean
  handle: string | null
  favoriteSkin: FavoriteSkin | null
  achievements: string[]
}

function parseSkin(value: unknown): FavoriteSkin | null {
  if (value && typeof value === "object") {
    const v = value as { src?: unknown; name?: unknown }
    if (typeof v.src === "string" && v.src) {
      return { src: v.src, name: typeof v.name === "string" ? v.name : "" }
    }
  }
  return null
}

function parseAchievements(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((a): a is string => typeof a === "string")
    : []
}

function toRecord(row: PlayerOverrideRow): OverrideRecord {
  return {
    brawlhallaId: row.brawlhallaId,
    pro: row.pro,
    handle: row.handle,
    favoriteSkin: parseSkin(row.favoriteSkin),
    achievements: parseAchievements(row.achievements),
    updatedAt: row.updatedAt,
  }
}

/** Read-side projection consumed across the public UI. */
function toPreview(row: PlayerOverrideRow): PlayerPreview {
  const skin = parseSkin(row.favoriteSkin)
  const achievements = parseAchievements(row.achievements)
  return {
    favoriteSkin: skin ?? undefined,
    verified: row.pro ? { handle: row.handle ?? "" } : undefined,
    achievements: achievements.length ? achievements : undefined,
  }
}

// unstable_cache can't serialize a Map, so cache a plain object keyed by id
// (string keys after JSON), then hydrate to a Map at the call site.
const getOverridesObject = unstable_cache(
  async (): Promise<Record<string, PlayerPreview>> => {
    let rows: PlayerOverrideRow[]
    try {
      rows = await db().select().from(playerOverrides)
    } catch (err) {
      // Fail open — the UI renders fine without overrides.
      console.error("[overrides] read failed:", err)
      return {}
    }
    const obj: Record<string, PlayerPreview> = {}
    for (const r of rows) obj[String(r.brawlhallaId)] = toPreview(r)
    return obj
  },
  ["player-overrides-map"],
  { tags: [TAG], revalidate: 3600 },
)

/** All overrides as a Map<brawlhallaId, PlayerPreview> (cached). */
export async function getOverridesMap(): Promise<Map<number, PlayerPreview>> {
  const obj = await getOverridesObject()
  const map = new Map<number, PlayerPreview>()
  for (const [k, v] of Object.entries(obj)) map.set(Number(k), v)
  return map
}

/** A single player's preview, or undefined (cached via the map). */
export async function getOverride(
  brawlhallaId: number,
): Promise<PlayerPreview | undefined> {
  return (await getOverridesMap()).get(brawlhallaId)
}

// ---- Admin reads/writes (uncached; admin sees fresh data) -------------------

export async function listOverrides(): Promise<OverrideRecord[]> {
  const rows = await db()
    .select()
    .from(playerOverrides)
    .orderBy(desc(playerOverrides.updatedAt))
  return rows.map(toRecord)
}

export async function getOverrideRecord(
  brawlhallaId: number,
): Promise<OverrideRecord | null> {
  const [row] = await db()
    .select()
    .from(playerOverrides)
    .where(eq(playerOverrides.brawlhallaId, brawlhallaId))
    .limit(1)
  return row ? toRecord(row) : null
}

export async function upsertOverride(input: OverrideInput): Promise<void> {
  const values = {
    brawlhallaId: input.brawlhallaId,
    pro: input.pro,
    handle: input.handle,
    favoriteSkin: input.favoriteSkin,
    achievements: input.achievements,
    updatedAt: new Date(),
  }
  await db()
    .insert(playerOverrides)
    .values(values)
    .onConflictDoUpdate({
      target: playerOverrides.brawlhallaId,
      set: {
        pro: values.pro,
        handle: values.handle,
        favoriteSkin: values.favoriteSkin,
        achievements: values.achievements,
        updatedAt: values.updatedAt,
      },
    })
  revalidateTag(TAG, "max")
}

export async function deleteOverride(brawlhallaId: number): Promise<void> {
  await db()
    .delete(playerOverrides)
    .where(eq(playerOverrides.brawlhallaId, brawlhallaId))
  revalidateTag(TAG, "max")
}
