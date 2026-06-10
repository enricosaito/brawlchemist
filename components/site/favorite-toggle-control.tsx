"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Star } from "lucide-react"
import { useFavorites } from "./favorites-provider"
import { cn } from "@/lib/utils"

/** How long the "Tracking" confirmation label lingers after a star is added. */
const TRACKING_MS = 2400

/**
 * The favorite star, reading shared state from FavoritesProvider.
 *
 * - Signed out → a sign-in nudge linking back to the current page.
 * - Add → optimistic fill + a quick pop, and a brief "Tracking" label that
 *   collapses back to just the star after a couple seconds.
 * - Remove → guarded: hovering a tracked star reveals "Remove?", a first click
 *   arms it ("Remove", red), and only a second click removes — leaving the chip
 *   cancels. No accidental untracks.
 *
 * `size="md"` shows labels (profile header); `size="sm"` is the compact list
 * star (icon-only at rest, expands for the remove flow).
 */
export function FavoriteToggleControl({
  brawlhallaId,
  size = "md",
}: {
  brawlhallaId: number
  size?: "sm" | "md"
}) {
  const { loggedIn, selfId, isFavorite, toggle } = useFavorites()
  const pathname = usePathname() ?? "/"
  const fav = isFavorite(brawlhallaId)
  const isSelf = selfId === brawlhallaId

  const [justAdded, setJustAdded] = useState(false)
  const [pop, setPop] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [armed, setArmed] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (addedTimer.current) clearTimeout(addedTimer.current)
    },
    [],
  )

  // Your own profile — you can't track yourself (it's always pinned in
  // /favorites). Show a disabled star so the affordance reads as intentional.
  if (isSelf) {
    return (
      <span
        title="This is your profile"
        aria-disabled
        className="inline-flex cursor-default items-center gap-1.5 rounded-full border border-border/50 bg-card/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground/50"
      >
        <Star className="size-3.5 shrink-0" />
        {size === "md" && "Your profile"}
      </span>
    )
  }

  // Signed-out: a nudge to sign in, returning to wherever the star lives.
  if (!loggedIn) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(pathname)}`}
        title="Sign in to track this player"
        className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-tier-gold/50 hover:text-foreground"
      >
        <Star className="size-3.5 shrink-0" />
        {size === "md" && "Track"}
      </Link>
    )
  }

  async function onClick() {
    setNote(null)
    // Adding.
    if (!fav) {
      setPop(true)
      setJustAdded(true)
      window.setTimeout(() => setPop(false), 280)
      if (addedTimer.current) clearTimeout(addedTimer.current)
      addedTimer.current = setTimeout(() => setJustAdded(false), TRACKING_MS)
      setPending(true)
      const res = await toggle(brawlhallaId)
      setPending(false)
      if (!res.ok || res.atCap) {
        setJustAdded(false)
        if (addedTimer.current) clearTimeout(addedTimer.current)
        setNote(
          res.atCap
            ? "Favorites are full (100)."
            : res.error === "auth"
              ? "Sign in again."
              : "Try again.",
        )
      }
      return
    }
    // Removing — two-step: first click arms, second confirms.
    if (!armed) {
      setArmed(true)
      return
    }
    setArmed(false)
    setPending(true)
    const res = await toggle(brawlhallaId)
    setPending(false)
    if (!res.ok) setNote("Try again.")
  }

  const showTracking = fav && justAdded
  const showConfirm = fav && armed && !justAdded
  const showRemoveHint = fav && hovered && !armed && !justAdded

  let label: string | null = null
  if (!fav) label = size === "md" ? "Track" : null
  else if (showTracking) label = "Tracking"
  else if (showConfirm) label = "Remove"
  else if (showRemoveHint) label = "Remove?"

  const danger = showConfirm || showRemoveHint

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false)
        setArmed(false)
      }}
      aria-pressed={fav}
      aria-label={fav ? "Remove from favorites" : "Add to favorites"}
      title={note ?? (fav ? "Tracking — click to remove" : "Track this player")}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium transition-all duration-200 disabled:opacity-60",
        label ? "px-2.5 py-1 text-[11px]" : "size-8 justify-center",
        showConfirm
          ? "border-negative/60 bg-negative/15 text-negative"
          : danger
            ? "border-negative/40 bg-card/60 text-negative"
            : fav
              ? "border-tier-gold/50 bg-tier-gold/10 text-tier-gold hover:border-tier-gold/70"
              : "border-border/60 bg-card/60 text-muted-foreground hover:border-tier-gold/50 hover:text-foreground",
      )}
    >
      <Star
        className={cn(
          "size-3.5 shrink-0 transition-transform duration-300",
          fav && !danger && "fill-current",
          pop && "scale-125",
        )}
      />
      {label && <span className={cn(showTracking && "animate-slide-in")}>{label}</span>}
    </button>
  )
}
