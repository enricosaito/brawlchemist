"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { LegendChip } from "./primitives"

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
        <div className="flex flex-wrap gap-1.5">
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
