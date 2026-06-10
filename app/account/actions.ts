"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { getClaimedBrawlhallaId } from "@/lib/sync/claims"
import {
  getCustomizationRecord,
  SOCIAL_KINDS,
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
 * Save the signed-in owner's profile customization. Gated: writes only to the
 * brawlhalla id this user actually owns (profiles.userId), so a forged form
 * can't touch another player's row.
 */
export async function saveCustomizationAction(formData: FormData) {
  const userId = await authedUserId()
  if (!userId) redirect("/login?next=/account")

  const brawlhallaId = await getClaimedBrawlhallaId(userId)
  if (!brawlhallaId) redirect("/account")

  const bio = String(formData.get("bio") ?? "")
  const socialLinks: SocialLink[] = SOCIAL_KINDS.map((kind) => ({
    kind,
    url: String(formData.get(`social_${kind}`) ?? "").trim(),
  })).filter((l) => l.url.length > 0)
  const favoriteLegendIds = [0, 1, 2]
    .map((i) => Number.parseInt(String(formData.get(`favorite_${i}`) ?? ""), 10))
    .filter((n) => Number.isInteger(n) && n > 0)

  await upsertCustomization(brawlhallaId, { bio, socialLinks, favoriteLegendIds })
  revalidatePath(`/player/${brawlhallaId}`)
  redirect("/account?saved=1")
}

/**
 * Inline bio save from the owner's own public profile (the Overview edit
 * affordance). Ownership-gated against the user's claimed id, and preserves
 * existing favorites/links so a bio edit never clobbers the rest. Returns a
 * result (no redirect) so the client can stay in place.
 */
export async function saveBioAction(
  brawlhallaId: number,
  bio: string,
): Promise<{ ok: boolean; error?: "auth" | "forbidden" | "save" }> {
  const userId = await authedUserId()
  if (!userId) return { ok: false, error: "auth" }

  const owned = await getClaimedBrawlhallaId(userId)
  if (!owned || owned !== brawlhallaId) return { ok: false, error: "forbidden" }

  try {
    const existing = await getCustomizationRecord(brawlhallaId)
    await upsertCustomization(brawlhallaId, {
      bio,
      socialLinks: existing.socialLinks,
      favoriteLegendIds: existing.favoriteLegendIds,
    })
    revalidatePath(`/player/${brawlhallaId}`)
    return { ok: true }
  } catch (err) {
    console.error("[saveBioAction] failed:", err)
    return { ok: false, error: "save" }
  }
}
