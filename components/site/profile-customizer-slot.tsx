import { getSessionUser } from "@/lib/auth/session"
import { getClaimState } from "@/lib/sync/claims"
import { getCustomization } from "@/lib/sync/customizations"
import { getProfile } from "@/lib/sync/profiles"
import { earnedFlairIds, type FlairContext } from "@/lib/profile/flair"
import { getFlairCatalogue } from "@/lib/sync/flairs"
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
  inline = false,
  doneHref,
}: {
  brawlhallaId: number
  flairContext: FlairContext
  /** Render as a page section rather than the floating panel. */
  inline?: boolean
  doneHref?: string
}) {
  // Lookups inside the try, the element outside it: constructing JSX in a try
  // block swallows render-time errors that belong to an error boundary.
  let custom: Awaited<ReturnType<typeof getCustomization>>
  let isPro = false
  let favoriteSkin: { src: string; name: string } | null = null
  // Entitlement is resolved against the curated catalogue, not the built-in
  // pair, or a hand-granted badge would render on the profile and stay locked
  // in the owner s own picker.
  let catalogue: Awaited<ReturnType<typeof getFlairCatalogue>>
  try {
    const user = await getSessionUser()
    if (!user) return null
    if ((await getClaimState(brawlhallaId, user.id)) !== "mine") return null
    custom = await getCustomization(brawlhallaId)
    // One read, two answers: the pro flag gates the text fields and the skin
    // seeds the picker. profiles.favorite_skin is where the choice lands, which
    // is why every surface that already draws a skin needs no change.
    const profile = await getProfile(brawlhallaId)
    isPro = !!profile?.verified
    favoriteSkin = profile?.favoriteSkin ?? null
    catalogue = await getFlairCatalogue()
  } catch {
    return null
  }

  return (
    <ProfileCustomizer
      brawlhallaId={brawlhallaId}
      initialBannerId={custom.bannerId}
      initialFlairId={custom.flairId}
      earnedFlairIds={earnedFlairIds(flairContext, catalogue)}
      initialSocialLinks={custom.socialLinks}
      initialFavoriteLegendIds={custom.favoriteLegendIds}
      initialFavoriteSkin={favoriteSkin}
      isPro={isPro}
      inline={inline}
      doneHref={doneHref}
    />
  )
}
