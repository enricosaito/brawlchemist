"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Star } from "lucide-react"
import { useFavorites } from "./favorites-provider"
import { cn } from "@/lib/utils"
import { InfoTip } from "./info-tip"

/** How long the "Tracking" confirmation label lingers after a star is added. */
const TRACKING_MS = 2400

/**
 * The favorite star, reading shared state from FavoritesProvider.
 *
 * - Signed out → a sign-in nudge linking back to the current page.
 * - Add → optimistic fill + a quick pop, and a brief "Tracking" label that
 *   collapses back to just the star after a couple seconds. The fill is the
 *   whole of the tracked state: no gold frame, no gold tint. Gold on a border
 *   means "you could press this", so it belongs to hover and nowhere else.
 * - Remove → guarded: hovering a tracked star reveals "Remove?", a first click
 *   arms it ("Remove", red), and only a second click removes — leaving the chip
 *   cancels. No accidental untracks.
 *
 * `size="md"` shows labels (profile header); `size="sm"` is the compact list
 * star (icon-only at rest, expands for the remove flow).
 *
 * `card` is the third skin and the reason this file grew a variant rather than
 * gaining a sibling: on the profile the whole card is the button, and a second
 * component would have meant a second copy of the add/arm/confirm machine —
 * which is the part that is easy to get subtly wrong and impossible to notice.
 * Every state below renders through the same `shell`, so the card cannot drift
 * from the chip.
 */
export function FavoriteToggleControl({
  brawlhallaId,
  size = "md",
  card,
}: {
  brawlhallaId: number
  size?: "sm" | "md"
  /** Full-bleed card mode. Needs the name, since the card says it aloud. */
  card?: { name: string; className?: string }
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

  /**
   * The card frame, wrapped around whatever the state wants to say.
   *
   * A column with the label pinned to the top and the star row to the bottom,
   * so the card can be stretched to a neighbour's height without its contents
   * drifting into the middle of the empty space.
   */
  const shell = (
    interactive: string,
    heading: string,
    body: string,
    chip: React.ReactNode,
  ) => (
    <>
      <span className="flex min-w-0 flex-col gap-0.5 text-left">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {heading}
        </span>
        <span className="truncate text-xs text-foreground/80">{body}</span>
      </span>
      <span className="mt-3 flex items-center">{chip}</span>
      <span className="sr-only">{interactive}</span>
    </>
  )
  const cardCls = cn(
    "flex w-full flex-col justify-between rounded-2xl border bg-card/50 p-4 text-left backdrop-blur-sm transition-colors",
    card?.className,
  )

  useEffect(
    () => () => {
      if (addedTimer.current) clearTimeout(addedTimer.current)
    },
    [],
  )

  // Your own profile — you can't track yourself (it's always pinned in
  // /favorites). Show a disabled star so the affordance reads as intentional.
  if (isSelf) {
    if (card) {
      return (
        <div
          aria-disabled
          className={cn(cardCls, "cursor-default border-border/40 opacity-70")}
        >
          {shell(
            "This is your profile",
            "Track",
            "This is your profile — it's always in your favorites.",
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/60">
              <Star className="size-3.5 shrink-0" />
              Your profile
            </span>,
          )}
        </div>
      )
    }
    return (
      <InfoTip label="This is your profile">
        <span
          aria-disabled
          className="inline-flex cursor-default items-center gap-1.5 rounded-md border border-border/50 bg-card/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground/50"
        >
          <Star className="size-3.5 shrink-0" />
          {size === "md" && "Your profile"}
        </span>
      </InfoTip>
    )
  }

  // Signed-out: a nudge to sign in, returning to wherever the star lives.
  if (!loggedIn) {
    if (card) {
      return (
        <Link
          href={`/login?next=${encodeURIComponent(pathname)}`}
          className={cn(
            cardCls,
            "border-border/60 hover:border-tier-gold/50 hover:bg-card/70",
          )}
        >
          {shell(
            "Sign in to track this player",
            "Track",
            `Sign in to keep ${card.name} in your favorites.`,
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <Star className="size-3.5 shrink-0" />
              Sign in to track
            </span>,
          )}
        </Link>
      )
    }
    return (
      <InfoTip label="Sign in to track this player">
        <Link
          href={`/login?next=${encodeURIComponent(pathname)}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-tier-gold/50 hover:text-foreground"
        >
          <Star className="size-3.5 shrink-0" />
          {size === "md" && "Track"}
        </Link>
      </InfoTip>
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

  /**
   * What the state says, in colour.
   *
   * **Gold is a hover affordance, never a resting one.** A tracked player used
   * to sit in a permanently gold-bordered, gold-tinted box, which on a profile
   * full of cards read as an alert about something that had already gone
   * right. Tracked now rests exactly as neutral as untracked; the only gold
   * left at rest is the filled star, which is the state, not a glow.
   *
   * Hovering a tracked control still turns red rather than gold, because there
   * the affordance is "click to remove" and that has to look like what it is.
   */
  // `danger` already covers the armed state, so one branch decides this.
  const tone = danger ? "text-negative" : "text-muted-foreground"
  const star = (
    <Star
      className={cn(
        "size-3.5 shrink-0 transition-transform duration-300",
        // Filled and gold when tracked — the one place the colour survives.
        fav && !danger && "fill-current text-tier-gold",
        pop && "scale-125",
      )}
    />
  )
  /**
   * Inside the card the star and its word carry no outline of their own. A
   * bordered pill inside a bordered card is a box in a box, and the card is
   * already the button — this is content, not a second control. The standalone
   * chip further down still has an edge, because on its own in a table row it
   * needs one to read as a control at all.
   */
  const cardChipCls = cn(
    "inline-flex items-center gap-1.5 font-medium transition-colors duration-200 text-[11px]",
    tone,
  )

  if (card) {
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
        className={cn(
          cardCls,
          "disabled:opacity-60",
          showConfirm
            ? "border-negative/60 bg-negative/10"
            : danger
              ? "border-negative/40"
              : // Identical resting frame whether or not they are tracked. The
                // difference is the star and the word, which is enough.
                "border-border/60 hover:border-tier-gold/50 hover:bg-card/70",
        )}
      >
        {shell(
          fav ? "Tracking — click to remove" : "Track this player",
          "Track",
          note ??
            (fav
              ? `${card.name} is in your favorites.`
              : `Keep ${card.name} in your favorites.`),
          <span className={cardChipCls}>
            {star}
            {/* The card always carries a word. A bare star was fine on a chip
                the size of a star; on something this big it would be a large
                target with no idea what it does. */}
            {showTracking
              ? "Tracking"
              : showConfirm
                ? "Remove"
                : showRemoveHint
                  ? "Remove?"
                  : fav
                    ? "Tracking"
                    : "Track"}
          </span>,
        )}
      </button>
    )
  }

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
        "inline-flex items-center gap-1.5 rounded-md border font-medium transition-all duration-200 disabled:opacity-60",
        label ? "px-2.5 py-1 text-[11px]" : "size-8 justify-center",
        showConfirm
          ? "border-negative/60 bg-negative/15 text-negative"
          : danger
            ? "border-negative/40 bg-card/60 text-negative"
            : cn(
                "border-border/60 bg-card/60 hover:border-tier-gold/50 hover:text-foreground",
                tone,
              ),
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
