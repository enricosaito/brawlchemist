import Link from "next/link"
import { cn } from "@/lib/utils"
import {
  apiToPrRegion,
  BOARD_DEFS,
  BOARDS,
  modeForBoard,
  prToApiRegion,
  type BoardId,
} from "@/lib/boards"

/**
 * Ladder · Pros · Power Rankings — which ranking you are reading.
 *
 * Replaces the two-state ALL/PRO switch, which could not hold a third option,
 * and the separate sidebar entry that made the power rankings look like a
 * different feature rather than a third answer to the same question.
 *
 * It leads the control row because it *gates* the row: each board publishes a
 * different set of modes (Pros is 1v1 only, the power rankings have no Solo 2v2
 * or 3v3), so a control that decides what the next control may contain has to
 * come first. `modeForBoard` is what keeps a switch from landing on a mode with
 * no rows upstream.
 *
 * Every option is a plain link to a page that fetches only its own data — the
 * whole point of joining the navigation and not the pages. See lib/boards.ts
 * for why merging them would cost ~3.2s and a shared region control that could
 * not tell the truth.
 */
export function BoardSwitch({
  board,
  mode,
  region,
  className,
}: {
  board: BoardId
  /** The mode key currently shown, in either vocabulary — they agree on 1v1/2v2. */
  mode: string
  /** The current region, in whichever vocabulary this board speaks. */
  region: string
  className?: string
}) {
  // Normalise once, so each link can be built in the target's own terms.
  const apiRegion = board === "pr" ? prToApiRegion(region) : region
  const prRegion = board === "pr" ? region : apiToPrRegion(region)

  function hrefFor(target: BoardId): string {
    const nextMode = modeForBoard(target, mode)
    if (target === "pr") {
      // No region when there is no honest mapping — the page picks its default
      // rather than being handed a region that means something else.
      const q = prRegion ? `&region=${prRegion}` : ""
      return `/power-rankings?mode=${nextMode}${q}`
    }
    const q = apiRegion ? `?region=${apiRegion}` : ""
    const pro = target === "pros" ? (q ? "&pro=1" : "?pro=1") : ""
    return `/leaderboards/${nextMode}${q}${pro}`
  }

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
        Board
      </span>
      <div
        role="tablist"
        aria-label="Ranking board"
        className="flex items-center rounded-md border border-border/60 bg-muted/40 p-1"
      >
        {BOARDS.map((id) => (
          <Link
            key={id}
            role="tab"
            aria-selected={board === id}
            href={hrefFor(id)}
            className={cn(
              "rounded-md px-2 py-1 font-mono text-xs tracking-wider whitespace-nowrap uppercase transition-colors",
              board === id
                ? "bg-card text-foreground shadow-[0_0_0_1px_oklch(1_0_0_/_0.06)]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {BOARD_DEFS[id].label}
          </Link>
        ))}
      </div>
    </div>
  )
}
