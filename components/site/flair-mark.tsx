import Image from "next/image"
import { cn } from "@/lib/utils"
import { resolveFlair, type FlairContext } from "@/lib/profile/flair"
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
 * Bare art with the name in a tooltip: the badge is already a bounded object,
 * and a chip around it makes it read as one more tag in a row of tags.
 */
export function FlairMark({
  selectedId,
  context,
  className = "h-4",
  onlyWhenChosen = false,
}: {
  selectedId: string | null | undefined
  context: FlairContext
  /** Height utility; width follows the art. */
  className?: string
  /**
   * Require a deliberate choice instead of falling back to the best earned.
   *
   * For list views. A profile showing your rarest badge automatically is a
   * nice touch; a leaderboard doing it puts the same Valhallan helm on fifty
   * consecutive rows, restating the tier the rank column already gives and
   * turning a rare mark into wallpaper. Here flair earns its place by being
   * something the player picked.
   */
  onlyWhenChosen?: boolean
}) {
  if (onlyWhenChosen && !selectedId) return null
  const flair = resolveFlair(selectedId, context)
  if (!flair) return null
  return (
    <InfoTip label={flair.label}>
      <span className="inline-flex shrink-0 items-center">
        <Image
          src={flair.src}
          alt={flair.label}
          width={flair.width}
          height={flair.height}
          unoptimized
          className={cn("w-auto select-none object-contain", className)}
        />
      </span>
    </InfoTip>
  )
}
