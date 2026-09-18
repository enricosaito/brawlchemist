import "server-only"

import { eq, sql as raw } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  appUsers,
  players,
  profiles,
  userCustomizations,
} from "@/lib/db/schema"
// Shared with the public read side on purpose: /admin is where a malformed row
// gets noticed and repaired, so it has to see exactly what the site sees —
// including the double-encoded-jsonb unwrap.
import { parseSkin, type FavoriteSkin } from "@/lib/sync/profiles"

/**
 * The admin "People" view: every player we hold a profiles row for, whether we
 * curated them as a pro or they claimed the profile themselves.
 *
 * ONE query across the four tables that between them answer "who is this person
 * to us" — profiles (curation + ownership), app_users (which account),
 * user_customizations (what they chose to fly), players (their name and ELO).
 * They're all small: profiles is the curated set plus claimants, and only
 * owners who touched a setting have a customizations row.
 *
 * The name and rating used to be a second, sequential read, on the theory that
 * joining `players` would drag the planner across ranked_json. It doesn't:
 * TOAST is only read when the column is, and none of these columns is the blob.
 * Constraint #2 is about `SELECT *` and jsonb expressions, not about joining a
 * table that owns one. Folding it in halves the round trips, which on a screen
 * where every query answers in under 2ms is the only thing that was costing
 * anything.
 */

export interface AdminPerson {
  brawlhallaId: number
  username: string | null
  rating: number | null
  region: string | null
  /** Curation. */
  isPro: boolean
  handle: string | null
  /** How many championship titles they hold, of either source. */
  titleCount: number
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
      // Counted in SQL rather than fetched: this list renders "3 titles", not
      // the titles, and a correlated count over a 106-row table is cheaper than
      // shipping every string for 171 people.
      titleCount: raw<number>`(
        select count(*)::int from esports_titles e
        where e.brawlhalla_id = ${profiles.brawlhallaId}
      )`,
      favoriteSkin: profiles.favoriteSkin,
      userId: profiles.userId,
      claimedAt: profiles.claimedAt,
      claimMethod: profiles.claimMethod,
      email: appUsers.email,
      flairId: userCustomizations.flairId,
      username: players.username,
      rating: players.rating,
      // The one place the admin list touches ranked_json, and a deliberate,
      // measured exception: 49.7ms and 1,285 buffers for the whole statement,
      // no extra round trip, 168 of 171 regions resolved. `getPlayersByIds`
      // gates the same read behind `withRegion` for exactly this reason; an
      // admin list of 171 rows can afford what a leaderboard render cannot.
      region: raw<string | null>`${players.rankedJson} ->> 'region'`,
    })
    .from(profiles)
    .leftJoin(appUsers, eq(appUsers.id, profiles.userId))
    .leftJoin(
      userCustomizations,
      eq(userCustomizations.brawlhallaId, profiles.brawlhallaId),
    )
    .leftJoin(players, eq(players.brawlhallaId, profiles.brawlhallaId))

  return rows
    .map((r): AdminPerson => {
      return {
        brawlhallaId: r.brawlhallaId,
        username: r.username,
        rating: r.rating,
        region: r.region,
        isPro: r.isPro,
        handle: r.handle,
        titleCount: r.titleCount,
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
