import { FavoriteToggleControl } from "./favorite-toggle-control"

/**
 * Track-this-player card, in the profile's side column under Top 2v2 Teams.
 *
 * The star used to ride the name line, wedged between the claim prompt and the
 * in-game name. That row is identity — who this player is — and tracking is
 * something *the viewer* does about them, so it read as one more fact about the
 * player rather than an action available to you. Given a card of its own it can
 * say what it does, which a bare star next to a name never could.
 *
 * The control keeps every state it had (signed-out nudge, optimistic add,
 * two-step remove, and the disabled "your profile" case), so this is a frame,
 * not a second implementation.
 */
export function TrackPlayerCard({
  brawlhallaId,
  name,
}: {
  brawlhallaId: number
  name: string
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card/50 p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Track
          </h2>
          <p className="mt-0.5 truncate text-xs text-foreground/80">
            Keep {name} in your favorites.
          </p>
        </div>
        <div className="shrink-0">
          <FavoriteToggleControl brawlhallaId={brawlhallaId} />
        </div>
      </div>
    </section>
  )
}
