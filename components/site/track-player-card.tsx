import { FavoriteToggleControl } from "./favorite-toggle-control"

/**
 * Track-this-player card, in the profile's side column under 2v2 Teams.
 *
 * The star used to ride the name line, wedged between the claim prompt and the
 * in-game name. That row is identity — who this player is — and tracking is
 * something *the viewer* does about them, so it read as one more fact about the
 * player rather than an action available to you. Given a card of its own it can
 * say what it does, which a bare star next to a name never could.
 *
 * The card is now the button rather than a frame around one. A card whose only
 * interactive part is a small chip in its corner spends a hundred and fifty
 * pixels of width being un-clickable, and every hover teaches you that the card
 * is decoration — so the click target is the whole thing, and the chip inside it
 * becomes a label for what the click will do.
 *
 * Still not a second implementation: the add/arm/confirm machine and all four
 * states (signed out, your own profile, tracking, removing) live in
 * FavoriteToggleControl, and this is its card skin.
 */
export function TrackPlayerCard({
  brawlhallaId,
  name,
  className,
}: {
  brawlhallaId: number
  name: string
  /**
   * Passed `lg:flex-1` by the Overview so the card absorbs whatever height is
   * left in the side column and its bottom edge lands level with the rating
   * chart beside it. Left off everywhere else, where there is nothing to align
   * to and a stretched card would just be a tall one.
   */
  className?: string
}) {
  return (
    <FavoriteToggleControl brawlhallaId={brawlhallaId} card={{ name, className }} />
  )
}
