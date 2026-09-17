import { getCustomization } from "@/lib/sync/customizations"
import { getProfile } from "@/lib/sync/profiles"

/**
 * The owner-set bio as it appears on the public profile.
 *
 * Favorite legends and links used to share this card; they moved to the header
 * (ProfileIdentityRow) because they are identity rather than prose. What is
 * left is one paragraph, so the card renders only when there is one. Display only — editing lives in the Customize
 * panel in the header, which is the single place anything here is set. This
 * card used to carry its own inline bio editor, which meant a bio could be
 * changed in two places with two different save paths.
 *
 * Verified pros only, for now. The three fields here are the ones that put
 * free text and outbound links on a public page, so they stay with the
 * accounts we have actually vetted — everyone else keeps the banner and the
 * flair, which can only ever say something true about them. Gated on read as
 * well as on write, so a row written before the gate existed stops showing
 * without needing to be deleted.
 *
 * Renders nothing when the player has set nothing, owner or not: an empty card
 * offering no affordance is just a hole in the layout.
 *
 * Owns its own outer spacing. It used to render bare inside a wrapper the
 * Overview always emitted, which left that wrapper's top margin behind as a
 * gap whenever this returned null — rare when the only empty case was a
 * player who had set nothing, routine now that every non-pro takes it.
 */
export async function ProfileCustomization({
  brawlhallaId,
}: {
  brawlhallaId: number
}) {
  const [custom, preview] = await Promise.all([
    getCustomization(brawlhallaId),
    getProfile(brawlhallaId),
  ])
  if (!preview?.verified) return null

  // Favorite legends and links render in the header now (see
  // ProfileIdentityRow) — they are identity, and this card is prose. With
  // nothing to say, there is no card.
  if (!custom.bio) return null

  return (
    <div className="mt-6 px-4 sm:px-6">
      <section className="mx-auto max-w-[1280px] rounded-2xl border border-border/60 bg-card/50 p-5 backdrop-blur-sm">
        <p className="text-sm leading-relaxed text-foreground/90">
          {custom.bio}
        </p>
      </section>
    </div>
  )
}
