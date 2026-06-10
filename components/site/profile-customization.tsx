import Image from "next/image"
import { ExternalLink } from "lucide-react"
import {
  rosterEntryByLegendId,
  slugForLegendId,
} from "@/lib/legends-roster"
import { getCustomization, SOCIAL_META } from "@/lib/sync/customizations"
import { getSessionUser } from "@/lib/auth/session"
import { getClaimState } from "@/lib/sync/claims"
import { EditableBio } from "./editable-bio"

/**
 * Owner-set profile customization (bio, favorite legends, social links) on the
 * public profile. For non-owners it renders nothing when the player has set
 * nothing — so unclaimed/empty profiles are unchanged. The verified owner
 * always gets the card, with an inline bio editor (and an "Add a bio" prompt
 * when empty). Fails open: ownership lookups degrade to the public view.
 */
export async function ProfileCustomization({
  brawlhallaId,
}: {
  brawlhallaId: number
}) {
  const custom = await getCustomization(brawlhallaId)

  // Is the viewer the verified owner? Fail open to a plain (non-editable) view.
  let isOwner = false
  try {
    const user = await getSessionUser()
    if (user) {
      isOwner = (await getClaimState(brawlhallaId, user.id)) === "mine"
    }
  } catch {
    isOwner = false
  }

  const favorites = custom.favoriteLegendIds
    .map((id) => {
      const entry = rosterEntryByLegendId(id)
      const slug = slugForLegendId(id)
      return entry && slug ? { name: entry.name, slug } : null
    })
    .filter((f): f is { name: string; slug: string } => f !== null)

  const hasContent =
    !!custom.bio || favorites.length > 0 || custom.socialLinks.length > 0
  // Non-owners only see the card when there's something to show. Owners always
  // see it so they have an entry point to add a bio.
  if (!hasContent && !isOwner) return null

  // The bio block is always present for owners (editor/prompt), so downstream
  // sections always get their top margin in that case.
  const bioShown = isOwner || !!custom.bio

  return (
    <div className="mt-6 px-4 sm:px-6">
      <section className="mx-auto max-w-[1280px] rounded-2xl border border-border/60 bg-card/50 p-5 backdrop-blur-sm">
        {isOwner ? (
          <EditableBio brawlhallaId={brawlhallaId} initialBio={custom.bio} />
        ) : custom.bio ? (
          <p className="text-sm leading-relaxed text-foreground/90">
            {custom.bio}
          </p>
        ) : null}

        {favorites.length > 0 && (
          <div className={bioShown ? "mt-4" : ""}>
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
