import { getSessionUser } from "@/lib/auth/session"
import { getClaimState } from "@/lib/sync/claims"
import { getCustomization } from "@/lib/sync/customizations"
import { earnedFlairIds, type FlairContext } from "@/lib/profile/flair"
import { ProfileCustomizer } from "./profile-customizer"

/**
 * Owner gate for the customizer. Renders nothing for everyone else, so the
 * panel's code and the player's current settings never reach a visitor.
 *
 * Entitlement is computed here rather than in the client component: the rules
 * read the player's record, and the picker only needs the answer. That also
 * means a forged selection can't award a badge — the profile re-derives
 * entitlement on render regardless of what was stored.
 *
 * Fails open to nothing (cardinal constraint #5): a customizer that fails to
 * load is an owner without an edit button, not a broken profile.
 */
export async function ProfileCustomizerSlot({
  brawlhallaId,
  flairContext,
}: {
  brawlhallaId: number
  flairContext: FlairContext
}) {
  // Lookups inside the try, the element outside it: constructing JSX in a try
  // block swallows render-time errors that belong to an error boundary.
  let custom: Awaited<ReturnType<typeof getCustomization>>
  try {
    const user = await getSessionUser()
    if (!user) return null
    if ((await getClaimState(brawlhallaId, user.id)) !== "mine") return null
    custom = await getCustomization(brawlhallaId)
  } catch {
    return null
  }

  return (
    <ProfileCustomizer
      brawlhallaId={brawlhallaId}
      initialBannerId={custom.bannerId}
      initialFlairId={custom.flairId}
      earnedFlairIds={earnedFlairIds(flairContext)}
      initialBio={custom.bio}
      initialSocialLinks={custom.socialLinks}
      initialFavoriteLegendIds={custom.favoriteLegendIds}
    />
  )
}
