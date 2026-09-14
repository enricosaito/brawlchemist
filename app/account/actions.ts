"use server"

import { revalidatePath } from "next/cache"
import { getClaimedBrawlhallaId } from "@/lib/sync/claims"
import {
  setBanner,
  setFlair,
  upsertCustomization,
  type SocialLink,
} from "@/lib/sync/customizations"
import { createSupabaseServerClient } from "@/lib/supabase/server"

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
 * Set the signed-in owner's header banner from their own public profile. Same
 * ownership gate as the bio editor — only the brawlhalla id this user actually
 * owns can be touched, so a forged request can't restyle someone else's page.
 * Banner id validation (allow-list → default) happens in setBanner.
 */
export async function saveBannerAction(
  brawlhallaId: number,
  bannerId: string,
): Promise<{ ok: boolean; error?: "auth" | "forbidden" | "save" }> {
  const userId = await authedUserId()
  if (!userId) return { ok: false, error: "auth" }

  const owned = await getClaimedBrawlhallaId(userId)
  if (!owned || owned !== brawlhallaId) return { ok: false, error: "forbidden" }

  try {
    await setBanner(brawlhallaId, bannerId)
    revalidatePath(`/player/${brawlhallaId}`)
    return { ok: true }
  } catch (err) {
    console.error("[saveBannerAction] failed:", err)
    return { ok: false, error: "save" }
  }
}

/**
 * Set the signed-in owner's flair. Same ownership gate as the rest.
 *
 * Note there's no check that the player has *earned* the id: this stores a
 * preference, and entitlement is re-derived on every render from their own
 * record, so a forged id renders nothing rather than granting a badge.
 */
export async function saveFlairAction(
  brawlhallaId: number,
  flairId: string,
): Promise<{ ok: boolean; error?: "auth" | "forbidden" | "save" }> {
  const userId = await authedUserId()
  if (!userId) return { ok: false, error: "auth" }

  const owned = await getClaimedBrawlhallaId(userId)
  if (!owned || owned !== brawlhallaId) return { ok: false, error: "forbidden" }

  try {
    await setFlair(brawlhallaId, flairId)
    revalidatePath(`/player/${brawlhallaId}`)
    return { ok: true }
  } catch (err) {
    console.error("[saveFlairAction] failed:", err)
    return { ok: false, error: "save" }
  }
}

/**
 * Save bio, links and favourite legends together from the customizer panel.
 * The FormData variant above redirects (it backs a plain <form> on /account);
 * this returns a result so the panel can stay open and show its own state.
 */
export async function saveProfileFieldsAction(
  brawlhallaId: number,
  input: { bio: string; socialLinks: SocialLink[]; favoriteLegendIds: number[] },
): Promise<{ ok: boolean; error?: "auth" | "forbidden" | "save" }> {
  const userId = await authedUserId()
  if (!userId) return { ok: false, error: "auth" }

  const owned = await getClaimedBrawlhallaId(userId)
  if (!owned || owned !== brawlhallaId) return { ok: false, error: "forbidden" }

  try {
    await upsertCustomization(brawlhallaId, input)
    revalidatePath(`/player/${brawlhallaId}`)
    return { ok: true }
  } catch (err) {
    console.error("[saveProfileFieldsAction] failed:", err)
    return { ok: false, error: "save" }
  }
}
