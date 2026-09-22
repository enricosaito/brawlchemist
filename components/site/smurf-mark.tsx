import { TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  SMURF_LABEL,
  smurfTooltip,
  type SmurfEvidence,
} from "@/lib/profile/smurf"
import { InfoTip } from "./info-tip"

/**
 * Two renderings of one reading — see lib/profile/smurf.ts for what earns it.
 *
 * Both take the **evidence** rather than a boolean, and both render nothing
 * when it is absent. That is the same contract `RankHelm` and `LegendChip`
 * follow, and for the same reason: a call site written as
 * `<SmurfMark evidence={smurfs.get(id)} />` cannot forget the guard, and cannot
 * draw the tag without the numbers the tooltip is about to quote.
 *
 * The mark is the list-view form, and it is built like VerifiedMark on purpose:
 * a glyph tight against the name, carrying its meaning in a tooltip. That
 * pairing matters, because the two marks are opposites sitting in the same slot
 * — one says "we know who this is", the other says "this record doesn't add
 * up" — and reading them as one family is what makes the second one legible at
 * a glance instead of alarming.
 *
 * Red — the site's `negative` token. It was amber for a while, on the argument
 * that red already means a loss here and a caution should not borrow it. The
 * argument lost to legibility: amber on a dark glass row read as a highlight,
 * and the one thing this mark must do is register as a flag. Red does that,
 * and the tooltip keeps it from reading as an error by saying exactly what the
 * flag rests on.
 */
export function SmurfMark({
  evidence,
  className = "size-3.5",
}: {
  /** The player's level and hours; undefined draws nothing. */
  evidence: SmurfEvidence | undefined
  className?: string
}) {
  if (!evidence) return null
  return (
    <InfoTip label={smurfTooltip(evidence)}>
      <span className="inline-flex shrink-0">
        <TriangleAlert
          className={cn("text-negative", className)}
          aria-label={SMURF_LABEL}
        />
      </span>
    </InfoTip>
  )
}

/**
 * The profile-card form: a tag in the meta row, beside "Brawlchemist User" and
 * the ladder standing.
 *
 * Spelled out here rather than left as a glyph because the profile is the one
 * page with room to make a claim in words — and because the numbers behind it
 * (level, playtime) are on this same page, so a reader who wants to disagree
 * can check immediately. Same tag shape as every other one in that row.
 */
export function SmurfTag({
  evidence,
  className,
}: {
  evidence: SmurfEvidence | null | undefined
  className?: string
}) {
  if (!evidence) return null
  return (
    <InfoTip label={smurfTooltip(evidence)}>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md border border-negative/50 bg-negative/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-negative uppercase",
          className
        )}
      >
        <TriangleAlert className="size-3" />
        {SMURF_LABEL}
      </span>
    </InfoTip>
  )
}
