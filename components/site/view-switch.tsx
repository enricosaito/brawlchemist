import Link from "next/link"
import { cn } from "@/lib/utils"
import {
  apiToPrRegion,
  prToApiRegion,
  VIEWS_IN_GROUP,
  type ViewDef,
  type ViewGroup,
  type ViewId,
} from "@/lib/boards"

/**
 * One group of the ranking picker — TYPE or OTHER.
 *
 * Two groups, one selection: the six views are mutually exclusive, and only the
 * group holding the active one shows a highlight. That is the whole point of
 * the split. A flat row of six put "Ranked 2v2" beside "Solo 2v2" as though
 * they were the same kind of thing, when one is a board most people come for
 * and the other is a queue most have never played.
 *
 * Every option is a plain link to a page that fetches only its own data — see
 * lib/boards.ts for why the ladder and the power rankings stay separate pages.
 */
export function ViewSwitch({
  group,
  label,
  current,
  region,
  mode,
  className,
}: {
  group: ViewGroup
  /** Shown before the tabs. "Type", or whatever the group is called here. */
  label: string
  /** The active view, which may belong to the *other* group — then nothing lights. */
  current: ViewId
  /** The current region, in whichever vocabulary the current page speaks. */
  region: string
  /** The mode currently shown, so Power Rankings can carry 1v1 vs 2v2 across. */
  mode: string
  className?: string
}) {
  // Normalise once, so each link can be built in its target's own terms.
  const onPr = VIEWS_IN_GROUP.type.concat(VIEWS_IN_GROUP.other).some(
    (v) => v.id === current && v.board === "pr"
  )
  const apiRegion = onPr ? prToApiRegion(region) : region
  const prRegion = onPr ? region : apiToPrRegion(region)

  function hrefFor(view: ViewDef): string {
    if (view.board === "pr") {
      // 1v1 and 2v2 are both real boards upstream, so the power rankings keep
      // whichever mode you were already reading rather than resetting.
      const prMode = mode === "2v2" ? "2v2" : "1v1"
      const q = prRegion ? `&region=${prRegion}` : ""
      return `/power-rankings?mode=${prMode}${q}`
    }
    const q = apiRegion ? `?region=${apiRegion}` : ""
    const pro = view.pro ? (q ? "&pro=1" : "?pro=1") : ""
    return `/leaderboards/${view.mode}${q}${pro}`
  }

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <div
        role="tablist"
        aria-label={label}
        className="flex items-center rounded-md border border-border/60 bg-muted/40 p-1"
      >
        {VIEWS_IN_GROUP[group].map((view) => (
          <Link
            key={view.id}
            role="tab"
            aria-selected={current === view.id}
            href={hrefFor(view)}
            className={cn(
              "rounded-md px-2 py-1 font-mono text-xs tracking-wider whitespace-nowrap uppercase transition-colors",
              current === view.id
                ? "bg-card text-foreground shadow-[0_0_0_1px_oklch(1_0_0_/_0.06)]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {view.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
