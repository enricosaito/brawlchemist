"use client"

import Image from "next/image"
import { SOCIAL_META, type SocialLink } from "@/lib/profile/social"
import { SocialIcon } from "./brand-icons"
import { InfoTip } from "./info-tip"
import { useProfilePreview, type PreviewLegend } from "./profile-preview"

/**
 * The mains-and-links row in the profile header.
 *
 * Both of these used to sit in a card below the fold, under headings that said
 * "Favorite legends" and "Links". They are the two things on a profile that
 * answer "who is this" rather than "how are they doing", which is the header's
 * job — and they are small, bounded tokens, so they read as insignia beside the
 * name rather than as a section.
 *
 * Links are marks, not labelled buttons. A row of six chips reading "X (Twitter)
 * ↗" is wider than the name it belongs to and says nothing the glyph doesn't;
 * the label moves to the tooltip and the accessible name, which is where a
 * label belongs once the icon is recognisable. Same treatment as the sidebar's
 * own socials, and now literally the same icons.
 *
 * A client component only so the legends can show what the owner has picked but
 * not yet saved. Links deliberately do not preview: they are free-text inputs,
 * and repainting the header on every keystroke would flicker a row of glyphs
 * through every half-typed URL. A legend is a discrete choice from a list, so
 * there is a moment to react to; a URL is not one until you stop typing.
 *
 * It takes legends already resolved to name + slug rather than roster ids, so
 * the roster itself never crosses the boundary — see PreviewLegend.
 */
export function ProfileIdentityRow({
  favoriteLegends,
  socialLinks,
}: {
  favoriteLegends: PreviewLegend[]
  socialLinks: SocialLink[]
}) {
  const preview = useProfilePreview()
  // Null means nothing pending, which is the common case and every visitor's.
  const legends = preview?.favoriteLegends ?? favoriteLegends

  if (legends.length === 0 && socialLinks.length === 0) return null

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
      {legends.length > 0 && (
        <div className="flex items-center gap-1">
          {legends.map((l) => (
            // The portrait carries the name in a tooltip rather than beside it:
            // three named chips is a sentence, three faces is a glance.
            <InfoTip key={l.slug} label={l.name}>
              <Image
                src={`/assets/legends/${l.slug}.png`}
                alt={l.name}
                width={28}
                height={28}
                unoptimized
                className="size-7 rounded-full object-cover ring-1 ring-border/60"
              />
            </InfoTip>
          ))}
        </div>
      )}

      {legends.length > 0 && socialLinks.length > 0 && (
        <span aria-hidden className="h-4 w-px bg-border/60" />
      )}

      {socialLinks.length > 0 && (
        <div className="flex items-center gap-1">
          {socialLinks.map((link) => (
            <a
              key={link.kind}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              title={SOCIAL_META[link.kind].label}
              aria-label={SOCIAL_META[link.kind].label}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <SocialIcon kind={link.kind} className="size-4" />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
