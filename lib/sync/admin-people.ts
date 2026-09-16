import "server-only"

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { appUsers, profiles, userCustomizations } from "@/lib/db/schema"
import { getPlayersByIds } from "@/lib/sync/players"
// Shared with the public read side on purpose: /admin is where a malformed row
// gets noticed and repaired, so it has to see exactly what the site sees —
// including the double-encoded-jsonb unwrap.
import {
  parseEsportsTitles,
  parseSkin,
  type FavoriteSkin,
} from "@/lib/sync/profiles"

/**
 * The admin "People" view: every player we hold a profiles row for, whether we
 * curated them as a pro or they claimed the profile themselves.
 *
 * One query across the three tables that between them answer "who is this
 * person to us" — profiles (curation + ownership), app_users (which account),
 * user_customizations (what they chose to fly). They're all small: profiles is
 * the curated set plus claimants, and only owners who touched a setting have a
 * customizations row. The player names and ratings come from a second read
 * that deliberately skips ranked_json — this list shows a name and an ELO, and
 * the blob is ~6KB a row (cardinal constraint #2).
 */

export interface AdminPerson {
  brawlhallaId: number
  username: string | null
  rating: number | null
  region: string | null
  /** Curation. */
  isPro: boolean
  handle: string | null
  esportsTitles: string[]
  favoriteSkin: FavoriteSkin | null
  /** Ownership — null when nobody has claimed this profile. */
  userId: string | null
  email: string | null
  claimedAt: Date | null
  claimMethod: string | null
  /** The flair they chose, or null for "show my best". */
  flairId: string | null
}

/** Uncached: this is an admin screen, and staleness here is worse than a read. */
export async function listAdminPeople(): Promise<AdminPerson[]> {
  const rows = await db()
    .select({
      brawlhallaId: profiles.brawlhallaId,
      isPro: profiles.isPro,
      handle: profiles.handle,
      esportsTitles: profiles.esportsTitles,
      favoriteSkin: profiles.favoriteSkin,
      userId: profiles.userId,
      claimedAt: profiles.claimedAt,
      claimMethod: profiles.claimMethod,
      email: appUsers.email,
      flairId: userCustomizations.flairId,
    })
    .from(profiles)
    .leftJoin(appUsers, eq(appUsers.id, profiles.userId))
    .leftJoin(
      userCustomizations,
      eq(userCustomizations.brawlhallaId, profiles.brawlhallaId),
    )

  const players = rows.length
    ? await getPlayersByIds(
        rows.map((r) => r.brawlhallaId),
        { includeRankedJson: false },
      )
    : new Map()

  return rows
    .map((r): AdminPerson => {
      const p = players.get(r.brawlhallaId)
      return {
        brawlhallaId: r.brawlhallaId,
        username: p?.username ?? null,
        rating: p?.ladderRating ?? null,
        region: p?.ladderRegion ?? null,
        isPro: r.isPro,
        handle: r.handle,
        esportsTitles: parseEsportsTitles(r.esportsTitles),
        favoriteSkin: parseSkin(r.favoriteSkin),
        userId: r.userId,
        email: r.email,
        claimedAt: r.claimedAt,
        claimMethod: r.claimMethod,
        flairId: r.flairId,
      }
    })
    // Pros first, then claimed accounts, then by rating — the order you'd
    // scan in to find someone you were about to act on.
    .sort((a, b) => {
      if (a.isPro !== b.isPro) return a.isPro ? -1 : 1
      if (!!a.userId !== !!b.userId) return a.userId ? -1 : 1
      return (b.rating ?? 0) - (a.rating ?? 0)
    })
}
