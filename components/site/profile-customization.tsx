import Image from "next/image"
import { ExternalLink } from "lucide-react"
import {
  rosterEntryByLegendId,
  slugForLegendId,
} from "@/lib/legends-roster"
import { getCustomization, SOCIAL_META } from "@/lib/sync/customizations"
import { getProfile } from "@/lib/sync/profiles"

/**
 * Owner-set profile customization (bio, favorite legends, social links) as it
 * appears on the public profile. Display only — editing lives in the Customize
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

  const favorites = custom.favoriteLegendIds
    .map((id) => {
      const entry = rosterEntryByLegendId(id)
      const slug = slugForLegendId(id)
      return entry && slug ? { name: entry.name, slug } : null
    })
    .filter((f): f is { name: string; slug: string } => f !== null)

  const hasContent =
    !!custom.bio || favorites.length > 0 || custom.socialLinks.length > 0
  if (!hasContent) return null

  const bioShown = !!custom.bio

  return (
    <div className="mt-6 px-4 sm:px-6">
      <section className="mx-auto max-w-[1280px] rounded-2xl border border-border/60 bg-card/50 p-5 backdrop-blur-sm">
        {custom.bio && (
          <p className="text-sm leading-relaxed text-foreground/90">
            {custom.bio}
          </p>
        )}

        {favorites.length > 0 && (
          <div className={bioShown ? "mt-4" : ""}>
            <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Favorite legends
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {favorites.map((f) => (
                <span
                  key={f.slug}
                  className="flex items-center gap-2 rounded-md border border-border/60 bg-card/40 py-1 pl-1 pr-3"
                >
                  <Image
                    src={`/assets/legends/${f.slug}.png`}
                    alt=""
                    width={24}
                    height={24}
                    unoptimized
                    className="size-6 rounded-full object-cover"
                  />
                  <span className="text-xs font-semibold">{f.name}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {custom.socialLinks.length > 0 && (
          <div className={bioShown || favorites.length ? "mt-4" : ""}>
            <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Links
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {custom.socialLinks.map((l) => (
                <a
                  key={l.kind}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card/40 px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-pink/60 hover:text-pink"
                >
                  {SOCIAL_META[l.kind].label}
                  <ExternalLink className="size-3" />
                </a>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
