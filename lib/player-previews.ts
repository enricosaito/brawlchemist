/**
 * Shape of the per-player presentation data layered onto a player: verified
 * pro status (+ handle), favorite skin, and esports accolades. The values live
 * in the profiles table and are read through lib/sync/profiles (getProfile /
 * getProfilesMap). This module is just the shared type, safe to import from
 * client and server alike.
 */
export interface PlayerPreview {
  favoriteSkin?: { src: string; name: string }
  /** Verified pro — `handle` is shown in blue next to the PRO tag. */
  verified?: { handle: string }
  /**
   * Esports titles — world championships and the like, shown in gold with a
   * trophy in the header. Admin-curated, and nothing to do with the
   * achievement shelf, which is derived and belongs to the player.
   */
  esportsTitles?: string[]
  /**
   * This player has been claimed by a Brawlchemist account — shown publicly as
   * the "Brawlchemist User" badge. Deliberately a boolean and not the owner's
   * id: who owns a profile stays private (see ClaimBanner), only that it is
   * owned is public.
   */
  claimed?: boolean
  /**
   * The owning account has the Developer role — drives the Brawlchemist flair.
   *
   * Like `claimed`, a boolean rather than the role string: the public side only
   * needs to know that this profile is run by someone who builds the site, not
   * the account model behind it. Undefined for everyone else so the cached
   * object stays small.
   */
  developer?: boolean
  /**
   * Flair ids awarded by hand from /admin (`flair_grants`).
   *
   * Rides the preview for the same reason `developer` does: entitlement has to
   * be answerable from data the page already loaded, and this map is the one
   * per-player read every surface already makes. Undefined for everyone without
   * a grant, which is almost everyone, so the cached object stays small.
   */
  flairGrants?: string[]
  /**
   * When the account behind this profile signed up, ISO date — "Brawlchemist
   * member since".
   *
   * The owner's `app_users.created_at`, not the claim date: the question is how
   * long they have been a user, and someone can sign up long before they get
   * round to claiming a player. Undefined for unclaimed profiles, which have no
   * account to have an age.
   *
   * A string rather than a Date because this object is cached, and the cache
   * round-trips through JSON — a Date goes in and a string comes out, so it may
   * as well be honest about it.
   */
  memberSince?: string
  /**
   * The account behind this profile has favourited at least one player.
   *
   * A boolean, not the list: who someone follows is theirs, and the badge only
   * needs to know that they use the feature. Computed in SQL so the prefs blob
   * never crosses the wire (cardinal constraint #2).
   */
  hasFavorites?: boolean
}
