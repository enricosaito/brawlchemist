import "server-only"

import {
  and,
  desc,
  eq,
  ilike,
  isNotNull,
  ne,
  or,
  sql,
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
import {
  isAccountPlan,
  isStoredRole,
  parsePlan,
  parseRole,
  resolveRole,
  type AccountPlan,
  type AccountRole,
  type StoredRole,
} from "@/lib/auth/account"

/**
 * The admin "Users" view: every registered account.
 *
 * Separate from the People tab on purpose. People is keyed by brawlhalla_id —
 * it lists profiles, curated or claimed — so an account that never claimed a
 * player had no row there and was invisible to the panel. Role and plan belong
 * to the account, so they need the list that is about accounts.
 */

export interface AdminUser {
  id: string
  email: string | null
  /** What is stored. */
  storedRole: StoredRole
  /** What to show — `storedRole`, or Linked when a plain user owns a profile. */
  role: AccountRole
  plan: AccountPlan
  /** The claimed profile, when there is one. */
  brawlhallaId: number | null
  username: string | null
  /** Curation on the claimed profile — a linked account can also be a pro. */
  isPro: boolean
  handle: string | null
  /** Their flair *selection*; entitlement is derived at render from the
   * profiles map, never stored. Null means "show my best earned". */
  flairId: string | null
  createdAt: Date
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const USER_FILTERS = [
  { id: "", label: "All" },
  { id: "linked", label: "Linked" },
  { id: "pro", label: "Pro" },
  { id: "developer", label: "Developer" },
  { id: "paid", label: "Paid" },
] as const

/**
 * Uncached: an admin screen, where staleness is worse than a read.
 *
 * ONE round trip, which on this screen is the whole performance story. Every
 * query here answers in under 2ms; what an operator waits on is the number of
 * times the page goes to us-west-1 and back. The total for the pager rides in
 * the same statement as a window function rather than a second COUNT.
 *
 * Selecting `players.username` does not touch ranked_json: TOAST is only read
 * when the column is. Measured on the real table — `Index Scan using
 * players_pkey`, 1.08ms for the whole statement. Constraint #2 is about
 * `SELECT *` and jsonb expressions, not about joining a table that owns a blob.
 */
export async function listAdminUsers(
  query: ListQuery
): Promise<ListPage<AdminUser>> {
  const conditions = []
  if (query.q) {
    const pattern = containsPattern(query.q)
    const asId = Number(query.q)
    conditions.push(
      or(
        ilike(appUsers.email, pattern),
        ilike(profiles.handle, pattern),
        ilike(players.username, pattern),
        ...(Number.isInteger(asId) && asId > 0
          ? [eq(profiles.brawlhallaId, asId)]
          : []),
        // Only compared when it can be one: the column is a uuid, and
        // Postgres rejects "enrico" as one rather than not matching it.
        ...(UUID.test(query.q) ? [eq(appUsers.id, query.q)] : [])
      )
    )
  }
  switch (query.filter) {
    case "linked":
      conditions.push(isNotNull(profiles.brawlhallaId))
      break
    case "pro":
      conditions.push(eq(profiles.isPro, true))
      break
    case "developer":
      conditions.push(eq(appUsers.accountRole, "developer"))
      break
    case "paid":
      conditions.push(ne(appUsers.plan, "free"))
      break
  }

  const pageSize = ADMIN_PAGE_SIZE
  // Left joins throughout, so an account with no claim still appears — that is
  // most of them, and the whole reason this list exists.
  const rows = await db()
    .select({
      id: appUsers.id,
      email: appUsers.email,
      accountRole: appUsers.accountRole,
      plan: appUsers.plan,
      createdAt: appUsers.createdAt,
      brawlhallaId: profiles.brawlhallaId,
      isPro: profiles.isPro,
      handle: profiles.handle,
      username: players.username,
      flairId: userCustomizations.flairId,
      total: sql<number>`count(*) over()`,
    })
    .from(appUsers)
    .leftJoin(profiles, eq(profiles.userId, appUsers.id))
    .leftJoin(players, eq(players.brawlhallaId, profiles.brawlhallaId))
    .leftJoin(
      userCustomizations,
      eq(userCustomizations.brawlhallaId, profiles.brawlhallaId)
    )
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(appUsers.createdAt))
    .limit(pageSize)
    .offset((query.page - 1) * pageSize)

  return {
    rows: rows.map((r) => toAdminUser(r)),
    total: Number(rows[0]?.total ?? 0),
    page: query.page,
    pageSize,
  }
}

/** One account by id, for the edit card — it need not be on the page shown. */
export async function getAdminUser(id: string): Promise<AdminUser | null> {
  const [row] = await db()
    .select({
      id: appUsers.id,
      email: appUsers.email,
      accountRole: appUsers.accountRole,
      plan: appUsers.plan,
      createdAt: appUsers.createdAt,
      brawlhallaId: profiles.brawlhallaId,
      isPro: profiles.isPro,
      handle: profiles.handle,
      username: players.username,
      flairId: userCustomizations.flairId,
    })
    .from(appUsers)
    .leftJoin(profiles, eq(profiles.userId, appUsers.id))
    .leftJoin(players, eq(players.brawlhallaId, profiles.brawlhallaId))
    .leftJoin(
      userCustomizations,
      eq(userCustomizations.brawlhallaId, profiles.brawlhallaId)
    )
    .where(eq(appUsers.id, id))
    .limit(1)
  return row ? toAdminUser(row) : null
}

function toAdminUser(r: {
  id: string
  email: string | null
  accountRole: string
  plan: string
  createdAt: Date
  brawlhallaId: number | null
  isPro: boolean | null
  handle: string | null
  username: string | null
  flairId: string | null
}): AdminUser {
  const storedRole = parseRole(r.accountRole)
  return {
    id: r.id,
    email: r.email,
    storedRole,
    role: resolveRole(storedRole, r.brawlhallaId != null),
    plan: parsePlan(r.plan),
    brawlhallaId: r.brawlhallaId,
    username: r.username,
    isPro: !!r.isPro,
    handle: r.handle,
    flairId: r.flairId,
    createdAt: r.createdAt,
  }
}

/** One account's stored role, or null when there is no such account. */
export async function getAccountRole(
  userId: string,
): Promise<StoredRole | null> {
  const [row] = await db()
    .select({ accountRole: appUsers.accountRole })
    .from(appUsers)
    .where(eq(appUsers.id, userId))
    .limit(1)
  return row ? parseRole(row.accountRole) : null
}

export type SetResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "self" | "not-found" }

/**
 * Write an account's role. The caller MUST have already passed requireAdmin.
 *
 * `actingUserId` is whoever is making the change. Passing it lets this refuse
 * the one move that has to be impossible regardless of who is asking: changing
 * your own role.
 *
 * That guard lives here rather than in the form, so the rule holds for any
 * future caller and not just the one surface that happens to render today. It
 * is what makes "users cannot elevate themselves" structural — and it doubles
 * as lockout protection, since a Developer cannot demote themselves out of the
 * panel they are standing in.
 */
export async function setAccountRole(
  userId: string,
  role: string,
  actingUserId: string | null,
): Promise<SetResult> {
  if (!isStoredRole(role)) return { ok: false, reason: "invalid" }
  if (actingUserId && actingUserId === userId) {
    return { ok: false, reason: "self" }
  }
  const res = await db()
    .update(appUsers)
    .set({ accountRole: role, updatedAt: new Date() })
    .where(eq(appUsers.id, userId))
    .returning({ id: appUsers.id })
  if (res.length === 0) return { ok: false, reason: "not-found" }

  // The Developer role grants a flair, and the public side reads that off the
  // cached profiles map (an hour, tag "profiles"). Without this, granting the
  // role wouldn't show the badge and revoking it wouldn't take it away until
  // the tag happened to expire — the same staleness that has already cost this
  // project two visible features. The role write owns the flair, so it busts
  // the cache the flair is read from.
  const { revalidateTag } = await import("next/cache")
  const { PROFILES_TAG } = await import("@/lib/sync/profiles")
  revalidateTag(PROFILES_TAG, "max")
  return { ok: true }
}

/**
 * Write an account's plan. Caller MUST have already passed requireAdmin.
 *
 * No self-guard: a plan carries no permissions, so changing your own is not an
 * escalation — and once billing writes this column, the "acting user" will be a
 * webhook rather than a person anyway. Roles are the axis that needs guarding,
 * which is exactly why they are a separate column.
 */
export async function setAccountPlan(
  userId: string,
  plan: string,
): Promise<SetResult> {
  if (!isAccountPlan(plan)) return { ok: false, reason: "invalid" }
  const res = await db()
    .update(appUsers)
    .set({ plan, updatedAt: new Date() })
    .where(eq(appUsers.id, userId))
    .returning({ id: appUsers.id })
  return res.length > 0 ? { ok: true } : { ok: false, reason: "not-found" }
}
