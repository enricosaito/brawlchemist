"use server"

import { revalidatePath } from "next/cache"
import { getClaimedBrawlhallaId } from "@/lib/sync/claims"
import { getProfile, setFavoriteSkin } from "@/lib/sync/profiles"
import {
  getCustomizationRecord,
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
 * ownership gate as everything else here — only the brawlhalla id this user
 * actually owns can be touched, so a forged request can't restyle someone else's page.
 * Banner id validation (allow-list → default) happens in setBanner.
 */
export async function saveBannerAction(
  brawlhallaId: number,
  bannerId: string
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
  flairId: string
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
 * Save links and favourite legends together from the customizer panel. Returns
 * a result rather than redirecting, so the panel can stay open and show its own
 * state.
 */
export async function saveProfileFieldsAction(
  brawlhallaId: number,
  input: { socialLinks: SocialLink[]; favoriteLegendIds: number[] }
): Promise<{ ok: boolean; error?: "auth" | "forbidden" | "save" }> {
  const userId = await authedUserId()
  if (!userId) return { ok: false, error: "auth" }

  const owned = await getClaimedBrawlhallaId(userId)
  if (!owned || owned !== brawlhallaId) return { ok: false, error: "forbidden" }

  // Favourite legends are open to everyone: a pick from a fixed roster has no
  // text to moderate and no link to follow. Only the links are gated, and only
  // to accounts we can hold responsible for what they point at — verified pros
  // and developers. The panel hides them for everyone else; this is the half
  // that actually decides, since the panel is only the UI.
  //
  // Not entitled means "cannot change these", not "these are now empty".
  // Writing [] here would let a failed profile read, or a pro whose
  // verification lapsed, silently destroy links they had already saved — so the
  // stored value is carried through instead, and the rest of the save lands
  // normally rather than the whole thing being refused.
  const preview = await getProfile(brawlhallaId)
  const canEditLinks = !!preview?.verified || !!preview?.developer

  try {
    const socialLinks = canEditLinks
      ? input.socialLinks
      : (await getCustomizationRecord(brawlhallaId)).socialLinks
    await upsertCustomization(brawlhallaId, { ...input, socialLinks })
    revalidatePath(`/player/${brawlhallaId}`)
    return { ok: true }
  } catch (err) {
    console.error("[saveProfileFieldsAction] failed:", err)
    return { ok: false, error: "save" }
  }
}

/**
 * Set the profile's favorite skin, or clear it with null.
 *
 * `src` is checked against the wiki's image origin rather than trusted. The
 * value is rendered as an `<img>` on the profile, the podium and the ranked
 * card, so accepting an arbitrary URL would turn a profile field into an
 * embed-anything hole — and a way to point every viewer's browser at a server
 * of the owner's choosing. The picker only ever produces these URLs; the check
 * is for everything that is not the picker.
 */
const SKIN_ORIGIN = "https://brawlhalla.wiki.gg/images/"
const SKIN_NAME_MAX = 80

export async function saveFavoriteSkinAction(
  brawlhallaId: number,
  skin: { src: string; name: string } | null
): Promise<{ ok: boolean; error?: "auth" | "forbidden" | "invalid" | "save" }> {
  const userId = await authedUserId()
  if (!userId) return { ok: false, error: "auth" }

  const owned = await getClaimedBrawlhallaId(userId)
  if (!owned || owned !== brawlhallaId) return { ok: false, error: "forbidden" }

  if (skin && !skin.src.startsWith(SKIN_ORIGIN)) {
    return { ok: false, error: "invalid" }
  }

  try {
    await setFavoriteSkin(
      brawlhallaId,
      skin ? { src: skin.src, name: skin.name.slice(0, SKIN_NAME_MAX) } : null
    )
    revalidatePath(`/player/${brawlhallaId}`)
    return { ok: true }
  } catch (err) {
    console.error("[saveFavoriteSkinAction] failed:", err)
    return { ok: false, error: "save" }
  }
}
