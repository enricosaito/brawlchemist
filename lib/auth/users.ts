import "server-only"

import { db } from "@/lib/db"
import { appUsers } from "@/lib/db/schema"

/**
 * Ensure an app_users row exists for a freshly authenticated identity. Called
 * from the auth callback after a successful code exchange. Idempotent — keeps
 * the mirrored email fresh on conflict, never clobbers prefs/plan. Best-effort:
 * a failure here must not break sign-in.
 */
export async function ensureAppUser(
  id: string,
  email: string | null,
): Promise<void> {
  try {
    await db()
      .insert(appUsers)
      .values({ id, email })
      .onConflictDoUpdate({
        target: appUsers.id,
        set: { email, updatedAt: new Date() },
      })
  } catch (err) {
    console.error("[auth] ensureAppUser failed:", err)
  }
}
