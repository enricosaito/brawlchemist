import "server-only"

import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { appUsers, profiles } from "@/lib/db/schema"
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
  createdAt: Date
}

/** Uncached: an admin screen, where staleness is worse than a read. */
export async function listAdminUsers(limit = 200): Promise<AdminUser[]> {
  // Left join, so an account with no claim still appears — that is most of
  // them, and the whole reason this list exists. `profiles` is small (the
  // curated set plus claimants) and neither side pulls ranked_json.
  const rows = await db()
    .select({
      id: appUsers.id,
      email: appUsers.email,
      accountRole: appUsers.accountRole,
      plan: appUsers.plan,
      createdAt: appUsers.createdAt,
      brawlhallaId: profiles.brawlhallaId,
    })
    .from(appUsers)
    .leftJoin(profiles, eq(profiles.userId, appUsers.id))
    .orderBy(desc(appUsers.createdAt))
    .limit(limit)

  // Names come from a second narrow read rather than a third join: usernames
  // live on `players`, whose rows carry the ~6 KB ranked_json blob, and joining
  // would drag the planner across it (cardinal constraint #2).
  const ids = rows
    .map((r) => r.brawlhallaId)
    .filter((v): v is number => v != null)
  let names = new Map<number, string>()
  if (ids.length > 0) {
    const { getPlayersByIds } = await import("@/lib/sync/players")
    try {
      const players = await getPlayersByIds(ids, { includeRankedJson: false })
      names = new Map([...players].map(([id, p]) => [id, p.username]))
    } catch (err) {
      console.error("[admin-users] name lookup failed:", err)
    }
  }

  return rows.map((r) => {
    const storedRole = parseRole(r.accountRole)
    return {
      id: r.id,
      email: r.email,
      storedRole,
      role: resolveRole(storedRole, r.brawlhallaId != null),
      plan: parsePlan(r.plan),
      brawlhallaId: r.brawlhallaId,
      username:
        r.brawlhallaId != null ? names.get(r.brawlhallaId) ?? null : null,
      createdAt: r.createdAt,
    }
  })
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
