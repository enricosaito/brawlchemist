import "server-only"

import {
  and,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  or,
  sql as raw,
} from "drizzle-orm"
import { db } from "@/lib/db"
import {
  ADMIN_PAGE_SIZE,
  containsPattern,
  type ListPage,
  type ListQuery,
} from "@/lib/admin-list"
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

export const PEOPLE_FILTERS = [
  { id: "", label: "All" },
  { id: "pro", label: "Pro" },
  { id: "linked", label: "Linked" },
  { id: "unclaimed", label: "Unclaimed" },
  { id: "titled", label: "Titled" },
] as const

/** One person by id, for the editor — they need not be on the page shown. */
export async function getAdminPerson(
  brawlhallaId: number
): Promise<AdminPerson | null> {
  const [row] = await db()
    .select({
      brawlhallaId: profiles.brawlhallaId,
      isPro: profiles.isPro,
      handle: profiles.handle,
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
      region: raw<string | null>`${players.rankedJson} ->> 'region'`,
    })
    .from(profiles)
    .leftJoin(appUsers, eq(appUsers.id, profiles.userId))
    .leftJoin(
      userCustomizations,
      eq(userCustomizations.brawlhallaId, profiles.brawlhallaId)
    )
    .leftJoin(players, eq(players.brawlhallaId, profiles.brawlhallaId))
    .where(eq(profiles.brawlhallaId, brawlhallaId))
    .limit(1)
  return row ? { ...row, favoriteSkin: parseSkin(row.favoriteSkin) } : null
}

/** Uncached: this is an admin screen, and staleness here is worse than a read. */
export async function listAdminPeople(
  query: ListQuery
): Promise<ListPage<AdminPerson>> {
  const conditions = []
  if (query.q) {
    const pattern = containsPattern(query.q)
    const asId = Number(query.q)
    conditions.push(
      or(
        ilike(profiles.handle, pattern),
        ilike(players.username, pattern),
        ilike(appUsers.email, pattern),
        ...(Number.isInteger(asId) && asId > 0
          ? [eq(profiles.brawlhallaId, asId)]
          : [])
      )
    )
  }
  switch (query.filter) {
    case "pro":
      conditions.push(eq(profiles.isPro, true))
      break
    case "linked":
      conditions.push(isNotNull(profiles.userId))
      break
    case "unclaimed":
      conditions.push(isNull(profiles.userId))
      break
    case "titled":
      conditions.push(
        raw`exists (select 1 from esports_titles e where e.brawlhalla_id = ${profiles.brawlhallaId})`
      )
      break
  }

  const pageSize = ADMIN_PAGE_SIZE
  const rows = await db()
    .select({
      brawlhallaId: profiles.brawlhallaId,
      isPro: profiles.isPro,
      handle: profiles.handle,
      // Counted in SQL rather than fetched: this list renders "3 titles", not
      // the titles, and a correlated count over a 106-row table is cheaper than
      // shipping every string for a page of people.
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
      // gates the same read behind `withRegion` for exactly this reason; a
      // page of 25 rows can afford what a leaderboard render cannot.
      region: raw<string | null>`${players.rankedJson} ->> 'region'`,
      total: raw<number>`count(*) over()`,
    })
    .from(profiles)
    .leftJoin(appUsers, eq(appUsers.id, profiles.userId))
    .leftJoin(
      userCustomizations,
      eq(userCustomizations.brawlhallaId, profiles.brawlhallaId)
    )
    .leftJoin(players, eq(players.brawlhallaId, profiles.brawlhallaId))
    .where(conditions.length ? and(...conditions) : undefined)
    // Pros first, then claimed accounts, then by rating — the order you would
    // scan in to find someone you were about to act on. The id breaks ties so
    // a page boundary is the same boundary on the next request.
    .orderBy(
      desc(profiles.isPro),
      raw`(${profiles.userId} is not null) desc`,
      raw`${players.rating} desc nulls last`,
      profiles.brawlhallaId
    )
    .limit(pageSize)
    .offset((query.page - 1) * pageSize)

  return {
    rows: rows.map(
      (r): AdminPerson => ({
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
      })
    ),
    total: Number(rows[0]?.total ?? 0),
    page: query.page,
    pageSize,
  }
}
