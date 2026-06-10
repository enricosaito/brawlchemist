"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronDown, Search, Swords, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { LegendChip } from "./primitives"

interface LegendOption {
  slug: string
  name: string
}

/**
 * Compact legend filter for the leaderboard control row — a dropdown combobox
 * with a live name search. Picking a legend switches the board to that legend's
 * mains (the former /otps view); "All legends" clears it. Navigation stays
 * URL-driven (Link hrefs into `basePath`) so deep links + back/forward work and
 * the server re-renders the board. No function props → server-component safe.
 */
export function LegendFilter({
  options,
  selectedSlug,
  region,
  basePath,
}: {
  options: LegendOption[]
  /** Active legend slug, or null when showing the full ladder. */
  selectedSlug: string | null
  region: string
  basePath: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = useMemo(
    () => options.find((o) => o.slug === selectedSlug) ?? null,
    [options, selectedSlug],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.name.toLowerCase().includes(q))
  }, [options, query])

  // Close on outside click / Escape; focus the search when opening.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
      window.clearTimeout(id)
    }
  }, [open])

  const allHref = `${basePath}?region=${region}`
  const legendHref = (slug: string) =>
    `${basePath}?region=${region}&legend=${slug}`

  return (
    <div ref={rootRef} className="relative flex items-center gap-1.5">
      <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        Legend
      </span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 font-mono text-xs uppercase tracking-wider transition-colors",
          selected
            ? "border-tier-s/50 text-foreground"
            : "border-border/60 text-muted-foreground hover:text-foreground",
        )}
      >
        {selected ? (
          <>
            <LegendChip legendId={selected.slug} size="sm" showName={false} />
            <span className="normal-case tracking-normal">{selected.name}</span>
          </>
        ) : (
          <>
            <Swords className="size-3.5" />
            All legends
          </>
        )}
        <ChevronDown
          className={cn(
            "size-3.5 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {/* Clear chip — only when a legend is active, so the empty state reads
          as the resting board. */}
      {selected && (
        <Link
          href={allHref}
          aria-label="Clear legend filter"
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Clear legend filter"
        >
          <X className="size-3.5" />
        </Link>
      )}

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-30 mt-2 w-64 rounded-xl border border-border/60 bg-card/95 p-2 shadow-2xl backdrop-blur-md"
        >
          <label className="mb-2 flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-2 py-1.5">
            <Search className="size-3.5 text-muted-foreground" aria-hidden />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search legend…"
              className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              aria-label="Search legends"
            />
          </label>

          <div className="max-h-72 overflow-y-auto">
            <Link
              href={allHref}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-muted",
                !selected && "text-foreground",
              )}
            >
              <span className="flex size-6 items-center justify-center">
                <Swords className="size-3.5 text-muted-foreground" />
              </span>
              <span className="flex-1">All legends</span>
              {!selected && <Check className="size-3.5 text-tier-s" />}
            </Link>

            {filtered.length === 0 ? (
              <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                No legend matches “{query}”.
              </div>
            ) : (
              filtered.map((o) => {
                const isSelected = o.slug === selectedSlug
                return (
                  <Link
                    key={o.slug}
                    href={legendHref(o.slug)}
                    onClick={() => setOpen(false)}
                    aria-selected={isSelected}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-muted",
                      isSelected
                        ? "bg-tier-s/10 text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <LegendChip legendId={o.slug} size="sm" showName={false} />
                    <span className="flex-1 truncate">{o.name}</span>
                    {isSelected && <Check className="size-3.5 text-tier-s" />}
                  </Link>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
