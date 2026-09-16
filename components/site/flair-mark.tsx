import Image from "next/image"
import { cn } from "@/lib/utils"
import {
  earnedFlairIds,
  flairById,
  resolveFlair,
  type FlairContext,
} from "@/lib/profile/flair"
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
}: {
  selectedId: string | null | undefined
  context: FlairContext
  /** Height utility; width follows the art. */
  className?: string
}) {
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
          className={cn("w-auto object-contain select-none", className)}
        />
      </span>
    </InfoTip>
  )
}

/**
 * Every flair a player holds, not just the one they fly.
 *
 * The profile button is the one place where showing all of them is right: it is
 * your own account, so the question is "what have I got" rather than "who is
 * this" — and unlike a leaderboard row, there is exactly one of them on screen,
 * so a row of badges can't turn into a column of the same badge repeated.
 *
 * Deliberately ignores the selection. A selection answers which one to fly in
 * public; here nothing is being chosen between.
 */
export function FlairMarks({
  context,
  className = "h-4",
}: {
  context: FlairContext
  className?: string
}) {
  const earned = earnedFlairIds(context)
  if (earned.length === 0) return null
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {earned.map((id) => {
        const flair = flairById(id)
        if (!flair) return null
        return (
          <InfoTip key={id} label={flair.label}>
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
        )
      })}
    </span>
  )
}
