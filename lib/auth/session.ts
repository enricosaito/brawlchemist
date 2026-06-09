import "server-only"

import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase/server"

/** The minimal authenticated identity the app needs at render time. */
export interface SessionUser {
  id: string
  email: string | null
  /** Discord avatar / display name when present in the identity metadata. */
  name: string | null
  avatarUrl: string | null
}

/**
 * Resolve the signed-in user for the current request, or null. Verifies the
 * session JWT locally via getClaims() — no network round-trip per render, so
 * it's cheap enough for the root layout (most visitors are anonymous). For
 * security-sensitive writes, re-check with supabase.auth.getUser() at the
 * action boundary.
 *
 * Fails open: any misconfiguration or error renders the site logged-out rather
 * than throwing (cardinal constraint #3).
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!isSupabaseConfigured()) return null
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.getClaims()
    const claims = data?.claims
    if (error || !claims?.sub) return null
    const meta = (claims.user_metadata ?? {}) as Record<string, unknown>
    return {
      id: claims.sub,
      email: typeof claims.email === "string" ? claims.email : null,
      name:
        (typeof meta.full_name === "string" && meta.full_name) ||
        (typeof meta.name === "string" && meta.name) ||
        (typeof meta.user_name === "string" && meta.user_name) ||
        null,
      avatarUrl:
        (typeof meta.avatar_url === "string" && meta.avatar_url) || null,
    }
  } catch {
    return null
  }
}
