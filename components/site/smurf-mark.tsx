import { TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { SMURF_LABEL, SMURF_TOOLTIP } from "@/lib/profile/smurf"
import { InfoTip } from "./info-tip"

/**
 * Two renderings of one reading — see lib/profile/smurf.ts for what earns it.
 *
 * The mark is the list-view form, and it is built like VerifiedMark on purpose:
 * a glyph tight against the name, carrying its meaning in a tooltip. That
 * pairing matters, because the two marks are opposites sitting in the same slot
 * — one says "we know who this is", the other says "this record doesn't add
 * up" — and reading them as one family is what makes the second one legible at
 * a glance instead of alarming.
 *
 * Amber, its own token. Gold already means an accolade here and red already
 * means a losing delta; borrowing either would have this either congratulate
 * the player or report an error. Amber is the colour nothing else on the site
 * uses, which is the point of a caution.
 */
export function SmurfMark({ className = "size-3.5" }: { className?: string }) {
  return (
    <InfoTip label={SMURF_TOOLTIP}>
      <span className="inline-flex shrink-0">
        <TriangleAlert
          className={cn("text-warning", className)}
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
export function SmurfTag({ className }: { className?: string }) {
  return (
    <InfoTip label={SMURF_TOOLTIP}>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md border border-warning/50 bg-warning/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-warning uppercase",
          className
        )}
      >
        <TriangleAlert className="size-3" />
        {SMURF_LABEL}
      </span>
    </InfoTip>
  )
}
