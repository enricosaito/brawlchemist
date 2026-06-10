import "server-only"

import { revalidateTag, unstable_cache } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { userCustomizations, type UserCustomizationRow } from "@/lib/db/schema"
import { rosterEntryByLegendId } from "@/lib/legends-roster"
import { DEFAULT_BANNER_ID, isValidBannerId } from "@/lib/profile/banners"

/**
 * Public-facing profile customization (bio, social links, favorite legends) set
 * by a verified owner. Reads are cached per profile and fail open; writes are
 * gated by ownership at the action layer.
 */

export const SOCIAL_KINDS = [
  "twitter",
  "twitch",
  "youtube",
  "discord",
  "steam",
  "website",
] as const
export type SocialKind = (typeof SOCIAL_KINDS)[number]

export interface SocialLink {
  kind: SocialKind
  url: string
}

/** Display label + input placeholder per social kind (shared by form + render). */
export const SOCIAL_META: Record<SocialKind, { label: string; placeholder: string }> = {
  twitter: { label: "X (Twitter)", placeholder: "https://x.com/you" },
  twitch: { label: "Twitch", placeholder: "https://twitch.tv/you" },
  youtube: { label: "YouTube", placeholder: "https://youtube.com/@you" },
  discord: { label: "Discord", placeholder: "https://discord.gg/invite" },
  steam: { label: "Steam", placeholder: "https://steamcommunity.com/id/you" },
  website: { label: "Website", placeholder: "https://your.site" },
}

export interface Customization {
  bio: string | null
  socialLinks: SocialLink[]
  favoriteLegendIds: number[]
  /** Header banner preset id, or null for the default wash (see lib/profile/banners). */
  bannerId: string | null
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

function toCustomization(row: UserCustomizationRow): Customization {
  const bio = typeof row.bio === "string" && row.bio.trim() ? row.bio : null
  return {
    bio,
    socialLinks: parseSocialLinks(row.socialLinks),
    favoriteLegendIds: parseFavorites(row.favoriteLegendIds),
    bannerId: parseBannerId(row.bannerId),
  }
}

/** Validate + normalize raw form input. Banner is managed separately (setBanner). */
export function normalizeInput(
  input: CustomizationInput,
): Omit<Customization, "bannerId"> {
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
