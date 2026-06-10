import Link from "next/link"
import { Star } from "lucide-react"
import { getSessionUser } from "@/lib/auth/session"
import { isFavorited } from "@/lib/sync/favorites"
import { FavoriteToggleControl } from "./favorite-toggle-control"

/**
 * Server wrapper for the favorite star. Signed-in viewers get the real toggle
 * (pre-seeded with current state); signed-out viewers get a sign-in nudge that
 * returns to this profile — discoverability + a sign-up hook for a free
 * feature. Fails open: a session/lookup error renders the nudge, never throws.
 *
 * Anonymous views cost nothing here (no DB read) — only signed-in views read the
 * cached favorites list.
 */
export async function FavoriteToggle({
  brawlhallaId,
  size = "md",
}: {
  brawlhallaId: number
  size?: "sm" | "md"
}) {
  let userId: string | null = null
  try {
    userId = (await getSessionUser())?.id ?? null
  } catch {
    userId = null
  }

  if (!userId) {
    return (
      <Link
        href={`/login?next=/player/${brawlhallaId}`}
        title="Sign in to track this player"
        className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-tier-gold/50 hover:text-foreground"
      >
        <Star className="size-3.5 shrink-0" />
        Track
      </Link>
    )
  }

  let fav = false
  try {
    fav = await isFavorited(userId, brawlhallaId)
  } catch {
    fav = false
  }

  return (
    <FavoriteToggleControl
      brawlhallaId={brawlhallaId}
      initialFavorited={fav}
      size={size}
    />
  )
}
