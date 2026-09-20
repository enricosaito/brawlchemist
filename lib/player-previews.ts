/**
 * Shape of the per-player presentation data layered onto a player: curated
 * competitor standing (+ handle), favorite skin, and esports accolades. The
 * values live in the profiles table and are read through lib/sync/profiles
 * (getProfile / getProfilesMap). This module is just the shared type, safe to
 * import from client and server alike.
 */
import { kindFromVerified, type VerifiedKind } from "@/lib/profile/verified"

export interface PlayerPreview {
  favoriteSkin?: { src: string; name: string }
  /**
   * A curated competitor — `handle` replaces their in-game name, and `tier`
   * decides which check they fly (see lib/profile/pro-tier.ts).
   *
   * Present if and only if the tier is curated at all, which is what lets the
   * thirty-odd surfaces that only ask "is this a pro" keep testing
   * `preview.verified` and stay correct. Undefined for the ~99% of rows with
   * no tier, so the cached object stays small — the same rule every optional
   * on this type follows.
   *
   * `tier` is a string literal union rather than an object because this whole
   * preview round-trips through JSON inside `unstable_cache`.
   *
   * `tier` is the field's old spelling, kept readable for one cache window:
   * this object lives for an hour, so the deploy that renames it has live
   * entries holding the old key. `kindFromVerified` reads `kind` then `tier`,
   * so nobody loses their check while an entry ages out. Droppable an hour
   * after that deploy.
   *
   * Both are **optional**, and that is about the cache rather than the column.
   * This object is stored for an hour, so any deploy that changes its shape has
   * live entries holding the old one — when tiers shipped those held
   * `{ handle }` alone. A required field would read as `undefined`, resolve to
   * "not curated", and take the check off every pro on the site until the entry
   * turned over. Read it through `previewKind`, which resolves a curated player
   * with no recorded tier to the Pro Player they were already rendering as.
   */
  verified?: { handle: string; kind?: VerifiedKind; tier?: VerifiedKind }
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

/**
 * The tier to draw for a player, from whatever we hold about them.
 *
 * Every badge site calls this instead of reaching for `verified?.tier` itself,
 * so "we know nothing about this player" and "this player is not curated"
 * arrive at `VerifiedMark` as the same value — which is the input it already
 * knows how to render as nothing. That is what lets the call sites drop their
 * `{handle && …}` guards: the component owns the fallback, the way `RankHelm`
 * and `LegendChip` do.
 */
export function previewKind(preview?: PlayerPreview | null): VerifiedKind {
  return kindFromVerified(preview?.verified)
}
