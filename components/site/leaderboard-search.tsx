"use client"

import { useRef } from "react"
import { Search } from "lucide-react"

/**
 * Live, client-side text filter over a server-rendered DataTable. Wraps the
 * table (rendered with `searchValue`, so each row carries a `data-search`
 * attr) and toggles row visibility imperatively — no need to re-serialize the
 * rich server cells across the client boundary. Filters the rows on the
 * current page; the podium (top 3) always stays visible above it.
 */
export function LeaderboardSearch({
  children,
  placeholder = "Filter by player…",
}: {
  children: React.ReactNode
  placeholder?: string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const emptyRef = useRef<HTMLParagraphElement>(null)

  function onInput(e: React.FormEvent<HTMLInputElement>) {
    const q = e.currentTarget.value.trim().toLowerCase()
    const rows = wrapRef.current?.querySelectorAll<HTMLTableRowElement>(
      "tr[data-search]",
    )
    if (!rows) return
    let visible = 0
    rows.forEach((tr) => {
      const match = !q || (tr.dataset.search ?? "").includes(q)
      tr.classList.toggle("hidden", !match)
      if (match) visible += 1
    })
    if (emptyRef.current) {
      emptyRef.current.hidden = !(q.length > 0 && visible === 0)
    }
  }

  return (
    <>
      <div className="mx-auto mb-3 max-w-[1280px]">
        <div className="flex max-w-sm items-center gap-2 rounded-md border border-border/60 bg-card/40 px-3 py-2 transition-colors focus-within:border-copper">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="search"
            onInput={onInput}
            placeholder={placeholder}
            aria-label="Filter leaderboard by player"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
      <div ref={wrapRef}>{children}</div>
      <p
        ref={emptyRef}
        hidden
        className="mx-auto mt-3 max-w-[1280px] text-sm text-muted-foreground"
      >
        No players match your search.
      </p>
    </>
  )
}
