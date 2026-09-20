"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Loader2, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { VerifiedMark } from "./verified-mark"
import { SmurfMark } from "./smurf-mark"
import { FlairMark } from "./flair-mark"
import { flairContextFrom } from "@/lib/profile/flair"
import { RankHelm, RegionPill } from "./primitives"
import type { Tier } from "@/lib/types"
import { type VerifiedKind } from "@/lib/profile/verified"

/** Mirrors a row from /api/search/players — see RecentVisit for the same shape
 * on the home dropdown, which renders these identically. */
interface PlayerHit {
  id: number
  username: string
  legendSlug: string | null
  rating: number | null
  region: string | null
  /** Which check to draw — see lib/profile/pro-tier.ts. */
  verifiedKind?: VerifiedKind
  /** Curated handle, when set — the row leads with it. */
  handle?: string | null
  /** Derived server-side: Valhallan is ladder membership, not a rating band. */
  tier?: Tier | null
  /** Raw selection + the accolades it's checked against, so this runs the same
   * entitlement rule as the profile rather than trusting a resolved flair. */
  flairId?: string | null
  esportsTitles?: string[]
  developer?: boolean
  /**
   * Their record reads as a possible smurf (see lib/profile/smurf.ts). Derived
   * server-side like `tier`: it needs level and playtime, which nothing on the
   * client has.
   */
  smurf?: boolean
}

type Kind = "empty" | "name" | "id" | "steam"

/** Mirror of /search's server-side resolution, so Enter can act without a
 * round-trip and the dropdown can hint what a pure-ID/Steam query will do. */
function classify(raw: string): Kind {
  const q = raw.trim()
  if (!q) return "empty"
  const digits = q.replace(/\D/g, "")
  if (/(7656119\d{10})/.test(q) || /^\d{17}$/.test(digits)) return "steam"
  if (/^\d+$/.test(q)) return "id"
  return "name"
}

type Option =
  | { type: "player"; href: string; hit: PlayerHit }
  | { type: "note"; href: string; label: string; hint: string }

interface Anchor {
  top: number
  left: number
  width: number
}

/**
 * LeaderboardPlayerSearch — a compact typeahead for the leaderboard control
 * row. Unlike a same-page row filter, this searches our *entire* players DB
 * (via `/api/search/players`, never the Brawlhalla API) so a player ranked on
 * page 2 or beyond is still found; selecting one opens their profile. Degrades
 * to a plain GET form to /search without JS.
 *
 * The dropdown is portaled to <body> with fixed positioning so the control
 * row's flex-wrap and any ancestor overflow can never clip it.
 */
export function LeaderboardPlayerSearch({ className }: { className?: string }) {
  const router = useRouter()
  const [value, setValue] = useState("")
  const [results, setResults] = useState<PlayerHit[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const trimmed = value.trim()
  const kind = classify(trimmed)

  const measure = useCallback(() => {
    const el = boxRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    // The popover is allowed to be wider than the input it hangs off. This box
    // is ~240px on desktop, and once a row carries a region pill, a helm and a
    // rating there is nothing left for the name — it truncated to "Ky…". Cap at
    // whatever still fits to the viewport's right edge, so a wide popover can
    // never be what puts a horizontal scrollbar on the page.
    const room = window.innerWidth - r.left - 16
    setAnchor({
      top: r.bottom + 6,
      left: r.left,
      width: Math.max(r.width, Math.min(400, room)),
    })
  }, [])

  const openDropdown = useCallback(() => {
    setOpen(true)
    measure()
  }, [measure])

  // Debounced username lookup against our own DB (never the Brawlhalla API).
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

  // Keep the popover anchored while open and the page scrolls/resizes.
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
      return results.map((hit) => ({
        type: "player" as const,
        href: `/player/${hit.id}`,
        hit,
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
    if (highlight >= 0 && options[highlight]) {
      go(options[highlight].href)
      return
    }
    if (!trimmed) return
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
    <div ref={boxRef} className={cn("relative", className)}>
      <form action="/search" method="get" onSubmit={onSubmit}>
        <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-1.5 transition-colors focus-within:border-pink">
          {loading ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <Search className="size-4 shrink-0 text-muted-foreground" />
          )}
          <input
            type="search"
            name="q"
            value={value}
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={showDropdown}
            aria-autocomplete="list"
            aria-controls="leaderboard-search-listbox"
            placeholder="Search any player…"
            aria-label="Search for any player"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            onChange={(e) => {
              setValue(e.target.value)
              openDropdown()
              setHighlight(-1)
            }}
            onFocus={openDropdown}
            onKeyDown={onKeyDown}
          />
        </div>
      </form>

      {showDropdown &&
        anchor &&
        createPortal(
          <div
            ref={popRef}
            id="leaderboard-search-listbox"
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
                  <li key={opt.type === "player" ? opt.hit.id : opt.href}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === highlight}
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => go(opt.href)}
                      className={cn(
                        "flex w-full min-w-0 items-center gap-3 px-3 py-2 text-left transition-colors",
                        i === highlight ? "bg-muted/60" : "hover:bg-muted/40",
                      )}
                    >
                      {opt.type === "player" ? (
                        <>
                          {opt.hit.legendSlug ? (
                            <Image
                              src={`/assets/legends/${opt.hit.legendSlug}.png`}
                              alt=""
                              width={28}
                              height={28}
                              className="size-7 shrink-0 rounded-md border border-border/60 object-cover"
                            />
                          ) : (
                            <span className="size-7 shrink-0 rounded-md border border-border/60 bg-muted/30" />
                          )}
                          {/* Same row as the home search dropdown, down to the
                              class names — these two are the same control in
                              two places, and a player who looks one way on the
                              homepage and another on the leaderboard reads as
                              two different records. */}
                          <span className="flex min-w-0 flex-1 items-center gap-1.5">
                            <span className="min-w-0 truncate text-sm font-medium">
                              {opt.hit.handle || opt.hit.username}
                            </span>
                            <VerifiedMark tier={opt.hit.verifiedKind ?? "none"} />
                            <FlairMark
                              selectedId={opt.hit.flairId}
                              context={flairContextFrom(opt.hit)}
                              className="h-3.5"
                            />
                            {opt.hit.smurf && <SmurfMark className="size-3.5" />}
                          </span>
                          {opt.hit.region && (
                            <RegionPill
                              region={opt.hit.region.toUpperCase()}
                              className="shrink-0"
                            />
                          )}
                          {opt.hit.rating != null && (
                            <span className="flex shrink-0 items-center gap-1.5 font-mono text-xs tabular-nums text-foreground">
                              {opt.hit.tier && (
                                <RankHelm tier={opt.hit.tier} className="h-4" />
                              )}
                              <span>
                                {opt.hit.rating.toLocaleString()}
                                <span className="ml-1 text-[9px] uppercase text-muted-foreground">
                                  ELO
                                </span>
                              </span>
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <Search className="size-4 shrink-0 text-pink" />
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
                Searches every player we&apos;ve indexed — not just this page.
                Press Enter for the full results page.
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
