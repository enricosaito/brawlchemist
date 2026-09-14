import "server-only"

import { revalidateTag, unstable_cache } from "next/cache"
import { eq, isNotNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { userCustomizations, type UserCustomizationRow } from "@/lib/db/schema"
import { rosterEntryByLegendId } from "@/lib/legends-roster"
import { DEFAULT_BANNER_ID, isValidBannerId } from "@/lib/profile/banners"
import { FLAIR_NONE, isValidFlairId } from "@/lib/profile/flair"
import {
  SOCIAL_KINDS,
  type SocialKind,
  type SocialLink,
} from "@/lib/profile/social"

/**
 * Public-facing profile customization (bio, social links, favorite legends) set
 * by a verified owner. Reads are cached per profile and fail open; writes are
 * gated by ownership at the action layer.
 */

export {
  SOCIAL_KINDS,
  SOCIAL_META,
  type SocialKind,
  type SocialLink,
} from "@/lib/profile/social"

export interface Customization {
  bio: string | null
  socialLinks: SocialLink[]
  favoriteLegendIds: number[]
  /** Header banner preset id, or null for the default wash (see lib/profile/banners). */
  bannerId: string | null
  /** Chosen flair id, "none" to fly nothing, or null to show the best earned. */
  flairId: string | null
}

export interface CustomizationInput {
  bio: string
  socialLinks: SocialLink[]
  favoriteLegendIds: number[]
}

const BIO_MAX = 280
const MAX_LINKS = 5
const MAX_FAVORITES = 3
const URL_MAX = 200

const EMPTY: Customization = {
  bio: null,
  socialLinks: [],
  favoriteLegendIds: [],
  bannerId: null,
  flairId: null,
}

function customizationTag(brawlhallaId: number): string {
  return `customization-${brawlhallaId}`
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

function parseSocialLinks(value: unknown): SocialLink[] {
  if (!Array.isArray(value)) return []
  const out: SocialLink[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue
    const { kind, url } = raw as { kind?: unknown; url?: unknown }
    if (
      typeof kind === "string" &&
      (SOCIAL_KINDS as readonly string[]).includes(kind) &&
      typeof url === "string" &&
      url.length <= URL_MAX &&
      isHttpsUrl(url)
    ) {
      out.push({ kind: kind as SocialKind, url })
    }
    if (out.length >= MAX_LINKS) break
  }
  return out
}

function parseFavorites(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<number>()
  for (const v of value) {
    const id = typeof v === "number" ? v : Number.parseInt(String(v), 10)
    if (Number.isInteger(id) && rosterEntryByLegendId(id) && !seen.has(id)) {
      seen.add(id)
    }
    if (seen.size >= MAX_FAVORITES) break
  }
  return [...seen]
}

function parseBannerId(value: unknown): string | null {
  return typeof value === "string" && isValidBannerId(value) ? value : null
}

function parseFlairId(value: unknown): string | null {
  if (typeof value !== "string") return null
  if (value === FLAIR_NONE) return FLAIR_NONE
  return isValidFlairId(value) ? value : null
}

function toCustomization(row: UserCustomizationRow): Customization {
  const bio = typeof row.bio === "string" && row.bio.trim() ? row.bio : null
  return {
    bio,
    socialLinks: parseSocialLinks(row.socialLinks),
    favoriteLegendIds: parseFavorites(row.favoriteLegendIds),
    bannerId: parseBannerId(row.bannerId),
    flairId: parseFlairId(row.flairId),
  }
}

/** Validate + normalize raw form input. Banner and flair are managed
 * separately (setBanner / setFlair). */
export function normalizeInput(
  input: CustomizationInput,
): Omit<Customization, "bannerId" | "flairId"> {
  const bio = input.bio.trim().slice(0, BIO_MAX)
  return {
    bio: bio || null,
    socialLinks: parseSocialLinks(input.socialLinks),
    favoriteLegendIds: parseFavorites(input.favoriteLegendIds),
  }
}

/** Cached public read. Returns EMPTY (never throws) so profiles fail open. */
export async function getCustomization(
  brawlhallaId: number,
): Promise<Customization> {
  return unstable_cache(
    async (): Promise<Customization> => {
      try {
        const [row] = await db()
          .select()
          .from(userCustomizations)
          .where(eq(userCustomizations.brawlhallaId, brawlhallaId))
          .limit(1)
        return row ? toCustomization(row) : EMPTY
      } catch (err) {
        console.error("[customizations] read failed:", err)
        return EMPTY
      }
    },
    ["customization", String(brawlhallaId)],
    { tags: [customizationTag(brawlhallaId)], revalidate: 300 },
  )()
}

/** Busted whenever anyone's flair changes — see getFlairMap. */
const FLAIR_MAP_TAG = "flair-map"

/**
 * Every player's chosen flair, as one cached map.
 *
 * List views (the home Live Rankings card, the leaderboards) need a selection
 * per row, and a read per row is exactly the shape that has blown the egress
 * budget before. Instead this reads two narrow columns for the whole table
 * once and shares the result — only claimed owners who have touched the
 * setting have a row at all, so it stays small for a long time.
 *
 * Fails open to an empty map: no flair anywhere beats a broken leaderboard.
 */
const getFlairObject = unstable_cache(
  async (): Promise<Record<string, string>> => {
    try {
      const rows = await db()
        .select({
          brawlhallaId: userCustomizations.brawlhallaId,
          flairId: userCustomizations.flairId,
        })
        .from(userCustomizations)
        .where(isNotNull(userCustomizations.flairId))
      const out: Record<string, string> = {}
      for (const r of rows) {
        const parsed = parseFlairId(r.flairId)
        if (parsed) out[String(r.brawlhallaId)] = parsed
      }
      return out
    } catch (err) {
      console.error("[customizations] flair map read failed:", err)
      return {}
    }
  },
  ["flair-map"],
  { tags: [FLAIR_MAP_TAG], revalidate: 300 },
)

/** `unstable_cache` can't serialize a Map, so it caches an object and we
 * hydrate here (same shape as getProfilesMap). */
export async function getFlairMap(): Promise<Map<number, string>> {
  const obj = await getFlairObject()
  const map = new Map<number, string>()
  for (const [k, v] of Object.entries(obj)) map.set(Number(k), v)
  return map
}

/** Uncached read for the owner's edit form. */
export async function getCustomizationRecord(
  brawlhallaId: number,
): Promise<Customization> {
  const [row] = await db()
    .select()
    .from(userCustomizations)
    .where(eq(userCustomizations.brawlhallaId, brawlhallaId))
    .limit(1)
  return row ? toCustomization(row) : EMPTY
}

/** Write the owner's customization and bust its cache. Caller MUST have checked ownership. */
export async function upsertCustomization(
  brawlhallaId: number,
  input: CustomizationInput,
): Promise<void> {
  const v = normalizeInput(input)
  const values = {
    brawlhallaId,
    bio: v.bio,
    socialLinks: v.socialLinks,
    favoriteLegendIds: v.favoriteLegendIds,
    updatedAt: new Date(),
  }
  await db()
    .insert(userCustomizations)
    .values(values)
    .onConflictDoUpdate({
      target: userCustomizations.brawlhallaId,
      set: {
        bio: values.bio,
        socialLinks: values.socialLinks,
        favoriteLegendIds: values.favoriteLegendIds,
        updatedAt: values.updatedAt,
      },
    })
  revalidateTag(customizationTag(brawlhallaId), "max")
}

/**
 * Write the owner's chosen header banner and bust its cache. Kept independent of
 * upsertCustomization (whose conflict-set never touches banner_id) so a banner
 * change can't clobber bio/links and vice-versa. The default preset is stored as
 * null — an unknown id is coerced to null too, so the read always fails open to
 * the default wash. Caller MUST have checked ownership.
 */
export async function setBanner(
  brawlhallaId: number,
  rawBannerId: string,
): Promise<void> {
  const bannerId =
    isValidBannerId(rawBannerId) && rawBannerId !== DEFAULT_BANNER_ID
      ? rawBannerId
      : null
  const now = new Date()
  await db()
    .insert(userCustomizations)
    .values({ brawlhallaId, bannerId, updatedAt: now })
    .onConflictDoUpdate({
      target: userCustomizations.brawlhallaId,
      set: { bannerId, updatedAt: now },
    })
  revalidateTag(customizationTag(brawlhallaId), "max")
}

/**
 * Write the owner's chosen flair, independent of the other fields for the same
 * reason setBanner is.
 *
 * Stores only the *preference* — entitlement is derived on every render from
 * the player's own record, so writing this can never award a badge, and an id
 * the player later stops qualifying for simply falls back (see resolveFlair).
 * That's why there's no ownership-of-badge check here: there is nothing to
 * cheat. Anything unrecognised is stored as null, i.e. "show my best".
 * Caller MUST have checked profile ownership.
 */
export async function setFlair(
  brawlhallaId: number,
  rawFlairId: string,
): Promise<void> {
  const flairId = parseFlairId(rawFlairId)
  const now = new Date()
  await db()
    .insert(userCustomizations)
    .values({ brawlhallaId, flairId, updatedAt: now })
    .onConflictDoUpdate({
      target: userCustomizations.brawlhallaId,
      set: { flairId, updatedAt: now },
    })
  revalidateTag(customizationTag(brawlhallaId), "max")
  // The list views read every selection from one shared map, so a single
  // player changing theirs has to invalidate it.
  revalidateTag(FLAIR_MAP_TAG, "max")
}

