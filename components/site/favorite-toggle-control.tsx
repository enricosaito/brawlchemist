"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Star } from "lucide-react"
import { toggleFavoriteAction } from "@/app/favorites/actions"
import { cn } from "@/lib/utils"

/**
 * Star toggle for tracking a player. Optimistic: flips immediately, reverts on
 * failure (auth lost / at cap / save error) and surfaces the reason in the
 * tooltip. The server action is the authority; this is the UI half (the server
 * wrapper only renders it for signed-in viewers).
 *
 * `size="md"` shows a Track/Tracking label (profile header); `size="sm"` is
 * icon-only (list rows).
 */
export function FavoriteToggleControl({
  brawlhallaId,
  initialFavorited,
  size = "md",
}: {
  brawlhallaId: number
  initialFavorited: boolean
  size?: "sm" | "md"
}) {
  const router = useRouter()
  const [fav, setFav] = useState(initialFavorited)
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function toggle() {
    setNote(null)
    const optimistic = !fav
    setFav(optimistic)
    start(async () => {
      const res = await toggleFavoriteAction(brawlhallaId)
      if (!res.ok) {
        setFav(!optimistic)
        setNote(res.error === "auth" ? "Sign in to track players." : "Try again.")
        return
      }
      if (res.atCap) {
        setFav(false)
        setNote("Favorites are full (100).")
        return
      }
      setFav(!!res.favorited)
      // Re-sync server surfaces (the /favorites list, the header wrapper).
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={fav}
      aria-label={fav ? "Remove from favorites" : "Add to favorites"}
      title={note ?? (fav ? "Tracking — click to remove" : "Track this player")}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors disabled:opacity-60",
        size === "md" ? "px-2.5 py-1 text-[11px]" : "size-8 justify-center",
        fav
          ? "border-tier-gold/50 bg-tier-gold/10 text-tier-gold hover:border-tier-gold/70"
          : "border-border/60 bg-card/60 text-muted-foreground hover:border-tier-gold/50 hover:text-foreground",
      )}
    >
      <Star className={cn("size-3.5 shrink-0", fav && "fill-current")} />
      {size === "md" && (fav ? "Tracking" : "Track")}
    </button>
  )
}
