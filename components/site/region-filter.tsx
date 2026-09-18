"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { Check, ChevronDown, Globe } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Region as a dropdown rather than a row of chips.
 *
 * Ten chips were the heaviest thing in the control row, and they were paying
 * for a choice almost nobody makes: `resolvePreferredRegion` already opens on
 * the region you play — your linked account first, then the one you last had
 * open — so the row existed to let people change something that was usually
 * already right. A closed dropdown states the answer in one token and keeps the
 * other nine one click away.
 *
 * Navigation stays URL-driven (Link hrefs) so deep links and back/forward work
 * and the server re-renders the board, and no function props cross the boundary
 * — same contract as OtherFilter.
 *
 * The menu is always in the DOM and merely `hidden` when closed, which is the
 * one place this departs from a mount-on-open menu. Rendering it conditionally
 * would take ten internal links per leaderboard out of the HTML, and the
 * crawlers that reach these boards are ones we want indexing them (cardinal
 * constraint #3). OtherFilter makes the same call for the same reason.
 */
export function RegionFilter({
  regions,
  selected,
  basePath,
  suffix = "",
  label = "Region",
}: {
  regions: readonly string[]
  selected: string
  /** Path the links point at, e.g. "/leaderboards/1v1". */
  basePath: string
  /** Extra query appended after `?region=…`, e.g. "&pro=1". */
  suffix?: string
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative flex items-center gap-1.5">
      <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1.5 font-mono text-xs tracking-wider uppercase transition-colors",
          open
            ? "border-pink/50 text-foreground"
            : "border-border/60 text-foreground hover:border-foreground/40"
        )}
      >
        <Globe className="size-3.5 shrink-0 text-muted-foreground" />
        {selected}
        <ChevronDown
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      <div
        hidden={!open}
        role="listbox"
        aria-label={label}
        className="absolute top-full left-0 z-30 mt-1 w-[168px] overflow-hidden rounded-md border border-border/60 bg-popover shadow-lg"
      >
        <ul className="max-h-[280px] overflow-y-auto py-1">
          {regions.map((r) => (
            <li key={r}>
              <Link
                href={`${basePath}?region=${r}${suffix}`}
                role="option"
                aria-selected={r === selected}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center justify-between gap-2 px-2.5 py-1.5 font-mono text-xs tracking-wider uppercase transition-colors",
                  r === selected
                    ? "bg-muted/60 text-foreground"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                )}
              >
                {r === "ALL" ? "All regions" : r}
                {r === selected && (
                  <Check className="size-3 shrink-0 text-pink" />
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
