"use server"

import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { toggleFavorite } from "@/lib/sync/favorites"

async function authedUserId(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) return null
    return data.user.id
  } catch {
    return null
  }
}

/**
 * Toggle a player in the signed-in viewer's favorites. Gate is "logged in" (any
 * user can track any player) — not profile ownership. Re-checks auth at the
 * action boundary (getUser, not just claims). Returns a result the client uses
 * to settle its optimistic star.
 */
export async function toggleFavoriteAction(brawlhallaId: number): Promise<{
  ok: boolean
  favorited?: boolean
  atCap?: boolean
  error?: "auth" | "save"
}> {
  const userId = await authedUserId()
  if (!userId) return { ok: false, error: "auth" }

  try {
    const res = await toggleFavorite(userId, brawlhallaId)
    revalidatePath("/favorites")
    return { ok: true, favorited: res.favorited, atCap: res.atCap }
  } catch (err) {
    console.error("[toggleFavoriteAction] failed:", err)
    return { ok: false, error: "save" }
  }
}
