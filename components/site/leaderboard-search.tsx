"use client"

import { Search } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Live text filter for the leaderboard table. Standalone input — on each
 * keystroke it toggles visibility of `tr[data-search]` rows (rendered by
 * DataTable with `searchValue`) plus a `#leaderboard-no-match` message, so it
 * can live anywhere in the controls without wrapping the table. Filters the
 * current page's rows; the top-3 podium stays visible above.
 */
export function LeaderboardSearch({ className }: { className?: string }) {
  function onInput(e: React.FormEvent<HTMLInputElement>) {
    const q = e.currentTarget.value.trim().toLowerCase()
    let visible = 0
    document
      .querySelectorAll<HTMLTableRowElement>("tr[data-search]")
      .forEach((tr) => {
        const match = !q || (tr.dataset.search ?? "").includes(q)
        tr.classList.toggle("hidden", !match)
        if (match) visible += 1
      })
    const empty = document.getElementById("leaderboard-no-match")
    if (empty) empty.hidden = !(q.length > 0 && visible === 0)
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-1.5 transition-colors focus-within:border-copper",
        className,
      )}
    >
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <input
        type="search"
        onInput={onInput}
        placeholder="Filter by player…"
        aria-label="Filter leaderboard by player"
        className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}
