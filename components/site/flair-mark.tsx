"use client"

import Image from "next/image"
import { cn } from "@/lib/utils"
import { resolveFlairs, type FlairContext } from "@/lib/profile/flair"
import { useFlairCatalogue } from "./flair-catalogue"
import { InfoTip } from "./info-tip"

/**
 * A player's flair, wherever it appears.
 *
 * Takes the raw selection plus the facts entitlement is derived from, rather
 * than a resolved flair, so every surface runs the same rule and none of them
 * can drift into showing a badge the profile wouldn't. Renders nothing when
 * there's nothing earned, which is the common case — no placeholder, no
 * reserved width.
 *
 * A client component since the catalogue moved to the database and reaches the
 * browser through context. That boundary was already here: `InfoTip` is a
 * client component, so every one of these was crossing it anyway, and this only
 * moves the crossing up one element.
 *
 * Bare art with the name in a tooltip: the badge is already a bounded object,
 * and a chip around it makes it read as one more tag in a row of tags.
 */
export function FlairMark({
  selectedId,
  context,
  className = "h-4",
}: {
  selectedId: string | null | undefined
  context: FlairContext
  /** Height utility; width follows the art. */
  className?: string
}) {
  const catalogue = useFlairCatalogue()
  const flairs = resolveFlairs(selectedId, context, catalogue)
  if (flairs.length === 0) return null
  // No wrapper element around the group: this renders inline beside a name on
  // fifteen surfaces, each with its own flex gap, and an extra span would
  // change the spacing on all of them to serve the one case with two badges.
  return (
    <>
      {flairs.map((flair) => (
        <InfoTip key={flair.id} label={flair.label}>
          <span className="inline-flex shrink-0 items-center">
            <Image
              src={flair.src}
              alt={flair.label}
              width={flair.width}
              height={flair.height}
              unoptimized
              className={cn("w-auto object-contain select-none", className)}
            />
          </span>
        </InfoTip>
      ))}
    </>
  )
}
