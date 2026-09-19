"use client"

import { ExternalLink } from "lucide-react"

/**
 * The link out to the event's own bracket on Challengermode.
 *
 * A client component for one reason: it lives inside the run's `<summary>`,
 * and a `<summary>` toggles its `<details>` on any click that reaches it. An
 * anchor in there would both open the bracket and fold the run away behind it,
 * so the click has to stop where it is handled — the same shape `DataTable`
 * uses for the button inside its clickable row.
 *
 * The rail answers "how did this run go"; the bracket answers "what else
 * happened at this event", which is the one question the rail deliberately
 * cannot, since we only store the matches of players we track.
 */
export function BracketLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wider text-muted-foreground uppercase transition-colors hover:border-pink/50 hover:text-foreground"
    >
      <ExternalLink className="size-2.5" />
      Bracket
    </a>
  )
}
