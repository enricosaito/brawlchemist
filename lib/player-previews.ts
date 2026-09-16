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
  /** Esports accolades, shown in gold with a trophy in the header. */
  achievements?: string[]
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
}
