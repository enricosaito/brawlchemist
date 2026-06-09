import Image from "next/image"
import { ExternalLink } from "lucide-react"
import {
  rosterEntryByLegendId,
  slugForLegendId,
} from "@/lib/legends-roster"
import { getCustomization, SOCIAL_META } from "@/lib/sync/customizations"

/**
 * Owner-set profile customization (bio, favorite legends, social links) on the
 * public profile. Renders nothing when the player has set nothing — so profiles
 * without an owner (or without customization) are unchanged. Fails open via
 * getCustomization.
 */
export async function ProfileCustomization({
  brawlhallaId,
}: {
  brawlhallaId: number
}) {
  const custom = await getCustomization(brawlhallaId)
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

  return (
    <div className="mt-6 px-4 sm:px-6">
      <section className="mx-auto max-w-[1280px] rounded-2xl border border-border/60 bg-card/50 p-5 backdrop-blur-sm">
      {custom.bio && (
        <p className="text-sm leading-relaxed text-foreground/90">{custom.bio}</p>
      )}

      {favorites.length > 0 && (
        <div className={custom.bio ? "mt-4" : ""}>
          <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Favorite legends
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {favorites.map((f) => (
              <span
                key={f.slug}
                className="flex items-center gap-2 rounded-full border border-border/60 bg-card/40 py-1 pl-1 pr-3"
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
        <div className={custom.bio || favorites.length ? "mt-4" : ""}>
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
                className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card/40 px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-copper/60 hover:text-copper"
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
