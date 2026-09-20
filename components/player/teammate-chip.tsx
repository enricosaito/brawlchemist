"use client"

import { PlayerLink } from "@/components/site/primitives"
import { VerifiedMark } from "@/components/site/verified-mark"
import { type VerifiedKind } from "@/lib/profile/verified"

/**
 * The partner, in the run header, as a link.
 *
 * A client component for the same reason `BracketLink` is: this sits inside
 * the run's `<summary>`, and a `<summary>` toggles its `<details>` on any
 * click that reaches it. Without stopping the click here, opening a teammate's
 * profile would also fold the run away on the way out. `PlayerLink` takes no
 * click handler of its own — it wraps its anchor in a context menu — so the
 * stop happens on the span around it.
 *
 * The header is the right home for this rather than the rail: a partner is
 * constant for a whole run, so it is a fact about the tournament, not about
 * any one match in it.
 */
export function TeammateChip({
  id,
  name,
  tier,
}: {
  id: number | null
  name: string
  tier: VerifiedKind
}) {
  return (
    <span
      role="presentation"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wider uppercase"
    >
      <span className="text-muted-foreground/60">+</span>
      <PlayerLink
        id={id}
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        {name}
      </PlayerLink>
      <VerifiedMark tier={tier} />
    </span>
  )
}
