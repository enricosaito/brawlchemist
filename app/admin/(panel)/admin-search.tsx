"use client"

import { Suspense, useEffect, useRef, useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Loader2, Search, X } from "lucide-react"

/**
 * Search box for a server-paginated admin list.
 *
 * The query lives in the URL (`?q=`) rather than in component state, so the
 * list it filters is the one the server renders — which is what makes the
 * total in the pager, the filter chips and the page number all agree with the
 * rows. Typing debounces into `router.replace`, and the transition's pending
 * flag is the spinner: the box never blocks, the rows update under it.
 *
 * Changing the query resets the page, because page 4 of a different result set
 * is not a place. Everything else in the URL (tab, filter) survives.
 */
export function AdminSearch({ placeholder }: { placeholder: string }) {
  // useSearchParams wants a Suspense boundary above it; /admin is dynamic so
  // it never prerenders, but the boundary costs nothing and removes the one
  // way this component could take the tab down.
  return (
    <Suspense fallback={<Shell placeholder={placeholder} />}>
      <SearchBox placeholder={placeholder} />
    </Suspense>
  )
}

function Shell({ placeholder }: { placeholder: string }) {
  return (
    <div className="flex h-9 w-full items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 sm:w-72">
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="text-sm text-muted-foreground">{placeholder}</span>
    </div>
  )
}

function SearchBox({ placeholder }: { placeholder: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [value, setValue] = useState(params.get("q") ?? "")
  const [pending, startTransition] = useTransition()
  const timer = useRef<number | null>(null)

  function push(q: string) {
    const next = new URLSearchParams(params.toString())
    if (q) next.set("q", q)
    else next.delete("q")
    next.delete("page")
    const qs = next.toString()
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    })
  }

  function schedule(q: string) {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => push(q.trim()), 300)
  }

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  return (
    <div className="flex h-9 w-full items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 transition-colors focus-within:border-pink sm:w-72">
      {pending ? (
        <Loader2
          className="size-4 shrink-0 animate-spin text-muted-foreground"
          aria-hidden
        />
      ) : (
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <input
        type="search"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          schedule(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (timer.current) window.clearTimeout(timer.current)
            push(value.trim())
          }
          if (e.key === "Escape") {
            setValue("")
            push("")
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            setValue("")
            push("")
          }}
          aria-label="Clear search"
          className="rounded text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  )
}
