"use client"

import { Search } from "lucide-react"

/**
 * Live filter for the People list. Toggles `[data-admin-search]` rows on each
 * keystroke — no state, no re-render of a list the server already produced,
 * and it works anywhere in the controls without wrapping the list.
 */
export function AdminPeopleSearch() {
  function onInput(e: React.FormEvent<HTMLInputElement>) {
    const q = e.currentTarget.value.trim().toLowerCase()
    let visible = 0
    document
      .querySelectorAll<HTMLElement>("[data-admin-search]")
      .forEach((el) => {
        const match = !q || (el.dataset.adminSearch ?? "").includes(q)
        el.classList.toggle("hidden", !match)
        if (match) visible += 1
      })
    const empty = document.getElementById("admin-no-match")
    if (empty) empty.hidden = !(q.length > 0 && visible === 0)
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-1.5 transition-colors focus-within:border-pink">
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <input
        type="search"
        onInput={onInput}
        placeholder="Name, handle, email or ID…"
        aria-label="Filter people"
        className="w-56 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}
