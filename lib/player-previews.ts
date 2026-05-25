/**
 * Shape of the admin-curated presentation data layered onto a player: verified
 * pro status (+ handle), favorite skin, and esports accolades. The values live
 * in the player_overrides table and are read through lib/sync/player-overrides
 * (getOverride / getOverridesMap). This module is just the shared type, safe to
 * import from client and server alike.
 */
export interface PlayerPreview {
  favoriteSkin?: { src: string; name: string }
  /** Verified pro — `handle` is shown in blue next to the PRO tag. */
  verified?: { handle: string }
  /** Esports accolades, shown in gold with a trophy in the header. */
  achievements?: string[]
}
