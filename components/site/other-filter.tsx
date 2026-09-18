"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronDown, ListFilter } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Every ranking that is not one of the three in TYPE, as one dropdown.
 *
 * This used to be two controls sitting side by side — a tablist of three queues
 * (Solo 2v2, 3v3, Pros only) and a separate LEGEND picker — and the split was a
 * statement about our data rather than about the question being asked. Both
 * answer "show me a different slice of the ladder", both are mutually exclusive
 * with each other and with TYPE, and keeping them apart meant a control row
 * that could show two filters lit at once in a set where only one selection is
 * ever real.
 *
 * Folding them together also fixes the thing a tablist could never do: three
 * tabs is a row, seventy-three is not. A closed dropdown states the current
 * answer in one token and holds the rest behind a search field.
 *
 * Contract matches RegionFilter and the LegendFilter it replaces: every option
 * is a plain `Link` built server-side, so no function props cross the boundary,
 * deep links and back/forward work, and the server re-renders the board.
 *
 * The menu is always in the DOM and merely `hidden` when closed — the same call
 * RegionFilter makes, for the same reason (cardinal constraint #3: the crawlers
 * that reach these boards are ones we want indexing them). The seventy legend
 * boards are real pages with real rows, and the old mount-on-open picker kept
 * every one of them out of the HTML. Portraits are lazy by default and the menu
 * is hidden, so nothing is fetched until someone opens it.
 */
export interface OtherOption {
  key: string
  label: string
  href: string
  /** Section heading this option sits under. Repeats render once. */
  section: string
  /**
   * What the closed button says when this option is the selection. Falls back
   * to `label`. A legend drops the "Mains" here — the portrait beside it has
   * already said what kind of board this is, and the word costs five characters
   * in a control that has a fixed width to keep.
   */
  short?: string
  /** Optional art — a legend portrait, for the ones that have a face. */
  icon?: string
}

export function OtherFilter({
  options,
  selectedKey,
  label = "Other",
}: {
  options: OtherOption[]
  selectedKey: string | null
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find((o) => o.key === selectedKey) ?? null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, query])

  // Close on outside click / Escape; focus the search when opening.
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
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKey)
      window.clearTimeout(id)
    }
  }, [open])

  let lastSection: string | null = null

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
          // Fixed width on purpose: the label runs from "None" to
          // "Sir Roland", and letting the button size to its content would
          // reflow every control after it — and push the cutoff onto a second
          // line — each time the selection changed.
          "inline-flex w-[132px] items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1.5 font-mono text-xs tracking-wider whitespace-nowrap uppercase transition-colors",
          selected
            ? "border-tier-s/50 text-foreground"
            : open
              ? "border-pink/50 text-foreground"
              : "border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground"
        )}
      >
        {selected?.icon ? (
          <Image
            src={selected.icon}
            alt=""
            width={16}
            height={16}
            unoptimized
            className="size-4 shrink-0 rounded-sm object-cover"
          />
        ) : (
          <ListFilter className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">
          {selected ? (selected.short ?? selected.label) : "None"}
        </span>
        <ChevronDown
          className={cn(
            "ml-auto size-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      <div
        hidden={!open}
        className="absolute top-full left-0 z-30 mt-1 w-[224px] overflow-hidden rounded-md border border-border/60 bg-popover shadow-lg"
      >
        <div className="border-b border-border/60 p-1.5">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search rankings…"
            aria-label={`Search ${label.toLowerCase()} rankings`}
            className="w-full rounded-sm bg-muted/40 px-2 py-1 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-pink/40"
          />
        </div>
        <ul
          role="listbox"
          aria-label={label}
          className="max-h-[300px] overflow-y-auto py-1"
        >
          {filtered.length === 0 && (
            <li className="px-2.5 py-2 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
              No match
            </li>
          )}
          {filtered.map((o) => {
            const heading = o.section !== lastSection ? o.section : null
            lastSection = o.section
            return (
              <li key={o.key}>
                {heading && (
                  <div className="px-2.5 pt-2 pb-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                    {heading}
                  </div>
                )}
                <Link
                  href={o.href}
                  role="option"
                  aria-selected={o.key === selectedKey}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2 px-2.5 py-1.5 font-mono text-xs tracking-wider uppercase transition-colors",
                    o.key === selectedKey
                      ? "bg-muted/60 text-foreground"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  )}
                >
                  {o.icon ? (
                    <Image
                      src={o.icon}
                      alt=""
                      width={16}
                      height={16}
                      unoptimized
                      className="size-4 shrink-0 rounded-sm object-cover"
                    />
                  ) : (
                    <span className="size-4 shrink-0" />
                  )}
                  <span className="truncate">{o.label}</span>
                  {o.key === selectedKey && (
                    <Check className="ml-auto size-3 shrink-0 text-pink" />
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
