import { BadgeCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  isCurated,
  PRO_TIER_DEFS,
  type ProTier,
} from "@/lib/profile/pro-tier"
import { InfoTip } from "./info-tip"

/**
 * VerifiedMark — the check that says "this is really them, and this is how far".
 *
 * One component because it appeared in seven places and only three of them had
 * the tooltip, so the same mark meant something you could hover to read on a
 * podium and nothing at all in the row directly beneath it. The label is the
 * whole point of the mark: a check on its own is decoration until it says what
 * was verified.
 *
 * `tier` is **required and owns its own fallback** — a `none` renders nothing.
 * Same contract `RankHelm` and `LegendChip` follow: never guard a call site
 * with `{tier && <VerifiedMark …>}`, because the component is the one place
 * that knows what an absent tier should look like. Required rather than
 * defaulted so adding a tier cannot silently leave a surface drawing the old
 * blue check for someone we now say something different about.
 *
 * One glyph in three colours, never three glyphs: it has to read as the same
 * kind of claim at 14px, and the tooltip is what distinguishes the levels for
 * anyone the colour does not.
 *
 * Sized by the caller — it sits beside a 4xl name on a profile and a 15px one
 * in a table row.
 */
export function VerifiedMark({
  tier,
  className = "size-3.5",
}: {
  tier: ProTier
  className?: string
}) {
  if (!isCurated(tier)) return null
  const def = PRO_TIER_DEFS[tier]
  return (
    <InfoTip label={def.markLabel}>
      <span className="inline-flex shrink-0">
        <BadgeCheck
          className={cn(def.markClass, className)}
          aria-label={def.markLabel}
        />
      </span>
    </InfoTip>
  )
}

/**
 * The tier as a word, for the places that print a standing beside a name
 * rather than only marking it (the OTP board, the profile header).
 *
 * Renders nothing when there is nothing to say, for the reason above.
 */
export function ProTierTag({
  tier,
  className,
}: {
  tier: ProTier
  className?: string
}) {
  if (!isCurated(tier)) return null
  const def = PRO_TIER_DEFS[tier]
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wider uppercase",
        def.tagClass,
        className
      )}
    >
      {def.label}
    </span>
  )
}
