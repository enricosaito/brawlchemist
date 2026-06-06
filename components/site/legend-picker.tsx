"use client"

import Link from "next/link"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { LegendChip } from "./primitives"

// useLayoutEffect on the client, useEffect on the server — avoids the SSR
// warning while still measuring before paint in the browser.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect

interface LegendOption {
  slug: string
  name: string
}

/**
 * Roster picker with a live name-filter input. Renders portrait chips
 * that route to `/otps?legend=<slug>&region=<currentRegion>`. Query
 * state lives client-side; navigation stays URL-driven so deep links
 * still work. Kept server-component-friendly by not accepting a
 * function prop.
 */
export function LegendPicker({
  options,
  selectedSlug,
  currentRegion,
}: {
  options: LegendOption[]
  selectedSlug: string
  currentRegion: string
}) {
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.name.toLowerCase().includes(q))
  }, [options, query])

  // Balance the chip rows so the last row isn't a lonely few (e.g. 32/32/2).
  // Measure how many fit, then cap the row width to the evenly-distributed
  // count: ceil(N / rows). With 68 legends that turns 32/32/4 into 23/23/22.
  const rowRef = useRef<HTMLDivElement>(null)
  const [maxWidth, setMaxWidth] = useState<number>()

  useIsomorphicLayoutEffect(() => {
    const row = rowRef.current
    const parent = row?.parentElement
    if (!row || !parent) return

    const balance = () => {
      const items = row.children
      const n = items.length
      if (n === 0) {
        setMaxWidth(undefined)
        return
      }
      const GAP = 6 // gap-1.5 → 0.375rem
      const unit = (items[0] as HTMLElement).offsetWidth + GAP
      const perRow = Math.max(1, Math.floor((parent.clientWidth + GAP) / unit))
      if (n <= perRow) {
        setMaxWidth(undefined) // already one row — no cap needed
        return
      }
      const rows = Math.ceil(n / perRow)
      const balanced = Math.ceil(n / rows)
      setMaxWidth(balanced * unit)
    }

    balance()
    const ro = new ResizeObserver(balance)
    ro.observe(parent)
    return () => ro.disconnect()
  }, [filtered.length])

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Pick a legend
        </span>
        <label className="flex items-center gap-2 rounded-md border border-border/60 bg-card/60 px-2 py-1">
          <Search className="size-3.5 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search legend…"
            className="w-32 bg-transparent text-xs outline-none placeholder:text-muted-foreground sm:w-48"
            aria-label="Search legends"
          />
        </label>
      </div>
      {filtered.length === 0 ? (
        <div className="rounded-md border border-border/40 bg-card/40 px-3 py-4 text-center text-xs text-muted-foreground">
          No legend matches “{query}”.
        </div>
      ) : (
        <div
          ref={rowRef}
          style={{ maxWidth }}
          className="mx-auto flex flex-wrap justify-center gap-1.5"
        >
          {filtered.map((entry) => {
            const isSelected = entry.slug === selectedSlug
            return (
              <Link
                key={entry.slug}
                href={`/otps?legend=${entry.slug}&region=${currentRegion}`}
                title={entry.name}
                aria-current={isSelected ? "true" : undefined}
                className={cn(
                  "rounded-md border transition-all",
                  isSelected
                    ? "border-tier-s bg-tier-s/15 ring-2 ring-tier-s/40"
                    : "border-border/40 bg-card/40 opacity-70 hover:border-border hover:opacity-100",
                )}
              >
                <LegendChip
                  legendId={entry.slug}
                  size="md"
                  showName={false}
                />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
