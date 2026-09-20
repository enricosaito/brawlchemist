import "server-only"

import { cache } from "react"
import { redirect } from "next/navigation"

/**
 * Admin access, decided by account role.
 *
 * This replaced a shared password exchanged for an HMAC cookie. A single secret
 * could not say *who* did something, could not be revoked for one person, and
 * had to be handed around to add an operator. Roles fix all three: access is a
 * property of an account, granted and removed from the panel itself, and every
 * admin mutation now knows the identity behind it (which is what lets
 * setAccountRole refuse a self-change).
 *
 * Two doors, both by account:
 *
 *  1. `account_role = 'developer'` in the database. The normal path.
 *  2. An email on ADMIN_BOOTSTRAP_EMAILS. The escape hatch.
 *
 * The second exists because the first is circular — Developer can only be
 * granted from inside the panel, so a fresh deployment has no way to appoint
 * the first one. It also unlocks the door if the last Developer is demoted by
 * mistake. It is deliberately env-only: nothing in the app can write it, so it
 * cannot be escalated into, and rotating it is a deploy rather than a database
 * write.
 *
 * Fails CLOSED. A database error, a missing row, an unconfigured Supabase all
 * resolve to "not an admin". The cost of that choice is real and worth stating:
 * unlike the old password, admin access now depends on Supabase auth being up.
 * The bootstrap list narrows the blast radius (it needs no database) but still
 * needs a session.
 */

/** Emails always treated as Developer, whatever the database says. */
function bootstrapEmails(): string[] {
  return (process.env.ADMIN_BOOTSTRAP_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * The signed-in identity, or null. Fails open to null.
 *
 * Memoised per request with React `cache`. One admin page render asks this
 * three times — the layout gate, the tab (for the "You" tag), and the action
 * on submit — and a mutation used to ask it twice more inside the action.
 * The JWT check is local, but each call also re-reads cookies and rebuilds a
 * Supabase client; sharing one answer across the request is free and removes a
 * class of "the layout thinks you are X, the action thinks you are null".
 */
const actor = cache(async function actor(): Promise<{
  id: string
  email: string | null
} | null> {
  try {
    const { getSessionUser } = await import("@/lib/auth/session")
    const user = await getSessionUser()
    return user ? { id: user.id, email: user.email } : null
  } catch {
    return null
  }
})

/**
 * The signed-in account id behind this request, when there is one.
 *
 * Exported for the admin mutations' self-change guard: "am I editing my own
 * row" is only answerable because admin access now always has an identity.
 */
export async function adminActorId(): Promise<string | null> {
  return (await actor())?.id ?? null
}

export async function isAdmin(): Promise<boolean> {
  try {
    const who = await actor()
    if (!who) return false
    const email = who.email?.toLowerCase()
    if (email && bootstrapEmails().includes(email)) return true
    const { getAccountRole } = await import("@/lib/sync/admin-users")
    const { roleGrantsAdmin } = await import("@/lib/auth/account")
    return roleGrantsAdmin(await getAccountRole(who.id))
  } catch {
    return false
  }
}

/**
 * Send anyone without admin access away.
 *
 * Signed-out visitors go to sign-in and come back; signed-in non-admins go to
 * the site rather than to a login page that would not help them — they are
 * already authenticated, they simply are not a Developer, and looping them
 * through sign-in would imply otherwise.
 */
export async function requireAdmin(): Promise<void> {
  if (await isAdmin()) return
  redirect((await actor()) ? "/?admin=denied" : "/login?next=/admin")
}

/**
 * The gate and the identity in one call, for mutations.
 *
 * Every admin action needs both — pass the gate, then know who is acting so
 * the self-change guard can fire. They used to be two calls (`requireAdmin`
 * then `adminActorId`), and with `actor` memoised that is now merely untidy
 * rather than a second round trip; this exists so an action has one line to
 * write and one thing to forget.
 */
export async function requireAdminActor(): Promise<{ id: string }> {
  await requireAdmin()
  const who = await actor()
  // requireAdmin redirects on a null actor, so this is unreachable — the throw
  // is for the type, not the runtime.
  if (!who) throw new Error("requireAdmin passed with no actor")
  return { id: who.id }
}
