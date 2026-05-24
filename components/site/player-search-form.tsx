"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Loader2, Search } from "lucide-react"
import { cn } from "@/lib/utils"

interface SearchResult {
  id: number
  username: string
  legendSlug: string | null
  rating: number | null
  region: string | null
}

type Kind = "empty" | "name" | "id" | "steam"

/** Mirror of the server-side resolution in /search, so the dropdown can hint
 * what Enter will do without a round-trip. */
function classify(raw: string): Kind {
  const q = raw.trim()
  if (!q) return "empty"
  const digits = q.replace(/\D/g, "")
  if (/(7656119\d{10})/.test(q) || /^\d{17}$/.test(digits)) return "steam"
  if (/^\d+$/.test(q)) return "id"
  return "name"
}

type Option =
  | { type: "player"; href: string; result: SearchResult }
  | { type: "note"; href: string; label: string; hint: string }

interface Anchor {
  top: number
  left: number
  width: number
}

/**
 * PlayerSearchForm — player lookup with a live dropdown. Username typing is
 * debounced and hits our own DB (`/api/search/players`), never the Brawlhalla
 * API. Steam/Brawlhalla-ID input shows an instant action row and only resolves
 * on click/Enter. Degrades to a plain GET form to /search without JS.
 *
 * The dropdown is portaled to <body> with fixed positioning so it can never be
 * clipped or covered by an ancestor's overflow/stacking context (e.g. the home
 * hero's `overflow-hidden` + `isolate`).
 */
export function PlayerSearchForm({
  defaultValue,
  className,
  showHint = false,
  autoFocus = false,
}: {
  defaultValue?: string
  className?: string
  showHint?: boolean
  autoFocus?: boolean
}) {
  const router = useRouter()
  const [value, setValue] = useState(defaultValue ?? "")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const trimmed = value.trim()
  const kind = classify(trimmed)

  // Position the popover under the input box, in viewport coordinates.
  const measure = useCallback(() => {
    const el = boxRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setAnchor({ top: r.bottom + 8, left: r.left, width: r.width })
  }, [])

  const openDropdown = useCallback(() => {
    setOpen(true)
    measure()
  }, [measure])

  // Debounced username lookup against our own DB (never the Brawlhalla API).
  // All setState happens inside async callbacks, never synchronously in the
  // effect body, so we don't trigger cascading renders.
  useEffect(() => {
    if (!open || kind !== "name" || trimmed.length < 2) return
    const t = setTimeout(() => {
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      setLoading(true)
      fetch(`/api/search/players?q=${encodeURIComponent(trimmed)}`, {
        signal: ac.signal,
      })
        .then((r) => r.json())
        .then((d) => setResults(Array.isArray(d.results) ? d.results : []))
        .catch((e) => {
          if ((e as Error).name !== "AbortError") setResults([])
        })
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(t)
  }, [trimmed, kind, open])

  // Keep the popover anchored while it's open and the page scrolls/resizes.
  useEffect(() => {
    if (!open) return
    const update = () => measure()
    window.addEventListener("scroll", update, true)
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update, true)
      window.removeEventListener("resize", update)
    }
  }, [open, measure])

  // Close on any click outside the box *and* the portaled popover.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (boxRef.current?.contains(t)) return
      if (popRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [])

  const options: Option[] = useMemo(() => {
    if (kind === "name") {
      if (trimmed.length < 2) return []
      return results.map((r) => ({
        type: "player" as const,
        href: `/player/${r.id}`,
        result: r,
      }))
    }
    if (kind === "id") {
      return [
        {
          type: "note" as const,
          href: `/player/${trimmed}`,
          label: "Open Brawlhalla profile",
          hint: `#${trimmed}`,
        },
      ]
    }
    if (kind === "steam") {
      return [
        {
          type: "note" as const,
          href: `/search?q=${encodeURIComponent(trimmed)}`,
          label: "Resolve Steam ID",
          hint: trimmed,
        },
      ]
    }
    return []
  }, [kind, results, trimmed])

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!trimmed) return
    if (highlight >= 0 && options[highlight]) {
      go(options[highlight].href)
      return
    }
    go(`/search?q=${encodeURIComponent(trimmed)}`)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      openDropdown()
      setHighlight((h) => Math.min(h + 1, options.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, -1))
    } else if (e.key === "Escape") {
      setOpen(false)
      setHighlight(-1)
    }
  }

  const showDropdown = open && trimmed !== ""

  return (
    <div ref={boxRef} className={cn("relative w-full max-w-xl", className)}>
      <form
        action="/search"
        method="get"
        onSubmit={onSubmit}
        className="group relative"
      >
        <div className="absolute inset-0 -z-10 rounded-xl bg-copper/10 opacity-60 blur-xl transition-opacity group-focus-within:opacity-100" />
        <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-card/70 px-4 py-3 shadow-[0_1px_0_0_oklch(1_0_0_/_0.04)_inset] backdrop-blur-md transition-colors focus-within:border-copper/60">
          {loading ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <Search className="size-4 shrink-0 text-muted-foreground" />
          )}
          <input
            type="search"
            name="q"
            value={value}
            autoFocus={autoFocus}
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={showDropdown}
            aria-autocomplete="list"
            aria-controls="player-search-listbox"
            placeholder="Search by name, Brawlhalla ID, or Steam ID"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Search players by name, Brawlhalla ID, or Steam ID"
            onChange={(e) => {
              setValue(e.target.value)
              openDropdown()
              setHighlight(-1)
            }}
            onFocus={openDropdown}
            onKeyDown={onKeyDown}
          />
          {showHint && (
            <kbd className="hidden rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
              /
            </kbd>
          )}
        </div>
      </form>

      {showDropdown &&
        anchor &&
        createPortal(
          <div
            ref={popRef}
            id="player-search-listbox"
            role="listbox"
            style={{
              position: "fixed",
              top: anchor.top,
              left: anchor.left,
              width: anchor.width,
            }}
            className="z-[100] overflow-hidden rounded-xl border border-border/80 bg-card/95 text-left shadow-xl backdrop-blur-md"
          >
            {options.length > 0 ? (
              <ul className="max-h-80 overflow-y-auto py-1">
                {options.map((opt, i) => (
                  <li key={opt.type === "player" ? opt.result.id : opt.href}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === highlight}
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => go(opt.href)}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                        i === highlight ? "bg-muted/60" : "hover:bg-muted/40",
                      )}
                    >
                      {opt.type === "player" ? (
                        <>
                          {opt.result.legendSlug ? (
                            <Image
                              src={`/assets/legends/${opt.result.legendSlug}.png`}
                              alt=""
                              width={28}
                              height={28}
                              className="size-7 shrink-0 rounded-md border border-border/60 object-cover"
                            />
                          ) : (
                            <span className="size-7 shrink-0 rounded-md border border-border/60 bg-muted/30" />
                          )}
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-sm font-medium">
                              {opt.result.username}
                            </span>
                            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                              ID {opt.result.id}
                              {opt.result.region ? ` · ${opt.result.region}` : ""}
                            </span>
                          </span>
                          {opt.result.rating != null && (
                            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                              {opt.result.rating.toLocaleString()}
                              <span className="ml-1 text-[9px] uppercase">ELO</span>
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <Search className="size-4 shrink-0 text-copper" />
                          <span className="flex-1 truncate text-sm">
                            {opt.label}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                            {opt.hint}
                          </span>
                        </>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-3 py-3 text-sm text-muted-foreground">
                {kind === "name" && loading && "Searching…"}
                {kind === "name" &&
                  !loading &&
                  trimmed.length < 2 &&
                  "Type at least 2 characters."}
                {kind === "name" &&
                  !loading &&
                  trimmed.length >= 2 &&
                  "No matching players in our database yet."}
              </div>
            )}

            {kind === "name" && (
              <div className="border-t border-border/60 px-3 py-1.5 text-[10px] text-muted-foreground/70">
                Name search covers players already in our database. Press Enter
                to open the full results page.
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
