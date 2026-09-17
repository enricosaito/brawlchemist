"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Search, X } from "lucide-react"
import { RegionPill } from "@/components/site/primitives"
import { cn } from "@/lib/utils"

/**
 * The nudge a signed-in account gets while it owns no Brawlhalla profile.
 *
 * Linking is the thing that makes an account mean anything here — favorites,
 * the membership badge, achievements and gems are all keyed off a claimed
 * player — and the two existing entry points are places you have to already be
 * going: /account, and the banner on your own profile, which you cannot find
 * until you know your own id. So the account that most needs this is the one
 * least likely to stumble into it.
 *
 * Deliberately gentle about it:
 *
 *  - It asks for a **name or an id**, because almost nobody knows their
 *    Brawlhalla id. The claim flow itself only accepts the number, which is
 *    the actual reason this dialog exists rather than a link to /claim.
 *  - Dismissal is remembered on the device and never asked again. Both other
 *    entry points still exist, so a permanent "no" costs nothing — where a
 *    prompt that returns every session would be the kind of thing people learn
 *    to close without reading.
 *  - It waits for the page to settle before appearing, and stays off the
 *    routes where it would be noise or in the way.
 *
 * The search hits our own `players` table through /api/search/players, never
 * the Brawlhalla API (cardinal constraint #1) — the same endpoint the header
 * typeahead uses, so a warm process pays nothing per keystroke.
 */

const DISMISS_KEY = "bc-claim-prompt"
/** Long enough for the page to paint and settle; short enough to feel offered. */
const APPEAR_AFTER_MS = 1400

/** Routes where the dialog would be noise, in the way, or both. */
const SKIP = ["/claim", "/login", "/auth", "/account", "/admin"]

interface Hit {
  id: number
  username: string
  handle: string | null
  rating: number | null
  region: string | null
}

export function ClaimPrompt() {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  // Results carry the query they answer. Keying them means a stale set can
  // never be shown against a newer query, and — the reason it is shaped this
  // way — nothing has to be cleared synchronously inside the effect, which is
  // the cascading-render pattern React now warns about.
  const [answer, setAnswer] = useState<{ q: string; hits: Hit[] }>({
    q: "",
    hits: [],
  })
  const inputRef = useRef<HTMLInputElement | null>(null)

  const skipped = SKIP.some((p) => pathname?.startsWith(p))

  useEffect(() => {
    if (skipped) return
    let dismissed = false
    try {
      dismissed = window.localStorage.getItem(DISMISS_KEY) === "dismissed"
    } catch {
      // Private mode, blocked storage. Showing once beats throwing.
    }
    if (dismissed) return
    const t = setTimeout(() => setOpen(true), APPEAR_AFTER_MS)
    return () => clearTimeout(t)
  }, [skipped])

  function close() {
    setOpen(false)
    try {
      window.localStorage.setItem(DISMISS_KEY, "dismissed")
    } catch {
      // Not worth a broken dialog; they will just see it again next device.
    }
  }

  // Escape closes, and the input takes focus when it opens.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close()
    document.addEventListener("keydown", onKey)
    inputRef.current?.focus()
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  // A number is an id and needs no lookup. Anything else is a name.
  const trimmed = query.trim()
  const isId = /^\d+$/.test(trimmed)

  const wantsSearch = open && !isId && trimmed.length >= 2

  useEffect(() => {
    if (!wantsSearch) return
    const ctl = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/search/players?q=${encodeURIComponent(trimmed)}`, {
        signal: ctl.signal,
      })
        .then((r) => r.json())
        .then((d) =>
          setAnswer({
            q: trimmed,
            hits: Array.isArray(d.results) ? d.results : [],
          })
        )
        .catch(() => {
          // Aborted, offline, or a bad payload. Leaving the answer unset keeps
          // the row in its "searching" state rather than claiming no matches.
        })
    }, 220)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
  }, [trimmed, wantsSearch])

  // Both derived, so neither needs a setState of its own.
  const hits = answer.q === trimmed ? answer.hits : []
  const searching = wantsSearch && answer.q !== trimmed

  function go(id: number) {
    close()
    router.push(`/claim?id=${id}`)
  }

  if (!open || skipped) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="claim-prompt-title"
      className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center"
    >
      <button
        type="button"
        aria-label="Dismiss"
        onClick={close}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
      />

      <div className="animate-slide-in relative w-full max-w-md rounded-2xl border border-border/60 bg-card/95 p-5 shadow-2xl backdrop-blur-md motion-reduce:animate-none">
        <button
          type="button"
          onClick={close}
          aria-label="Not now"
          className="absolute top-3 right-3 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>

        <h2
          id="claim-prompt-title"
          className="pr-8 font-display text-lg font-semibold"
        >
          Which player are you?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Link your Brawlhalla profile to track your own stats, keep favorites
          and earn badges. Search your in-game name, or enter your Brawlhalla
          ID.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (isId) go(Number(trimmed))
            else if (hits.length > 0) go(hits[0].id)
          }}
          className="mt-4"
        >
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Your in-game name or Brawlhalla ID"
              aria-label="Your in-game name or Brawlhalla ID"
              className="w-full rounded-md border border-border/60 bg-background py-2 pr-3 pl-9 text-sm outline-none focus:border-pink"
            />
          </div>

          {isId ? (
            <button
              type="submit"
              className="mt-3 w-full rounded-md bg-pink px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-pink/90"
            >
              Continue with #{trimmed}
            </button>
          ) : null}
        </form>

        {!isId && trimmed.length >= 2 && (
          <ul className="mt-3 max-h-64 overflow-y-auto">
            {hits.length === 0 ? (
              <li className="px-1 py-3 text-xs text-muted-foreground">
                {searching ? "Searching…" : "No players by that name."}
              </li>
            ) : (
              hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => go(h.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/60"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {h.handle ?? h.username}
                    </span>
                    {h.region && <RegionPill region={h.region} />}
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                      {h.rating ?? "—"}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}

        {/* Named rather than an X alone: a dialog that only offers a close
            button reads as something you have to get past, and this one is a
            genuine offer. Both other entry points survive the dismissal. */}
        <button
          type="button"
          onClick={close}
          className={cn(
            "mt-2 w-full rounded-md px-4 py-2 font-mono text-[11px] tracking-wider uppercase",
            "text-muted-foreground transition-colors hover:text-foreground"
          )}
        >
          Not my account / later
        </button>
      </div>
    </div>
  )
}
