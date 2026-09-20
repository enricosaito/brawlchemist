/**
 * What we verify a player *as* — the badge beside their name, and the reason
 * their handle replaces their in-game name everywhere on the site.
 *
 * This started as `pro_tier`, an ordered ladder of competitive standing, and
 * that shape stopped fitting the moment the question became "who do we vouch
 * for" rather than "how good are they". A Content Creator is not above or below
 * a Pro Player; a Developer is not a weaker Hall of Famer. They are different
 * kinds of the same claim: *we know who this person is, and the name we show is
 * the one they are known by.*
 *
 * So this is a **set of kinds, not a ladder**, and `order` is display
 * precedence — which badge to draw when only one fits, and what order the admin
 * picker lists them in. It is not a ranking, and nothing may read it as one.
 *
 * **Comparisons are named flags, never `order <= n`.** `isVerified` answers
 * "does this person get a badge and a handle". `competitive` answers "does this
 * person belong on a leaderboard of competitors" — which is what keeps the Pros
 * board from filling up with streamers. `canEditLinks` answers "may they put an
 * outbound URL on a public page". Each is a property of the kind, because
 * inserting a kind between two others must never silently hand it a capability
 * nobody granted — the trap `ROLES.admin` is written around.
 *
 * Curated, never derived. There is no fact on a player record that says
 * "content creator", and "consistently places well" is a judgement about a
 * career rather than a threshold anyone could defend. /admin shows what
 * evidence we hold beside the picker and a human asserts.
 *
 * **The stored token and the column keep their old names on purpose.** The
 * column is `profiles.pro_tier` and the flair rule token is `pro-tier`:
 * `drizzle-kit push` has no rename, and `parseFlairRule` degrades anything
 * unrecognised to `manual`, so renaming the rule would silently demote the
 * Grand Champion flair between the deploy and the data edit. Same two-step
 * `esportsTitles` is in, and the same reason.
 *
 * No `server-only`: the badge renders on both sides of the RSC boundary, and a
 * parallel copy of these labels would drift.
 */

export const VERIFIED_KINDS = [
  "top",
  "pro",
  "hall-of-famer",
  "content-creator",
  "developer",
  "power-ranked",
  "none",
] as const
export type VerifiedKind = (typeof VERIFIED_KINDS)[number]

export interface VerifiedKindDef {
  id: VerifiedKind
  /** On the tag and the admin picker. */
  label: string
  /** What an operator is asserting by choosing it. */
  description: string
  /**
   * The badge tooltip, and its aria-label.
   *
   * Spelled out per kind rather than built from `label`, because Power Ranked
   * must not say "Verified": it reports that someone competes, not that we
   * vouch for them. That distinction is the whole reason the kind exists.
   */
  markLabel: string
  /** Display precedence, lowest first. NOT a rank — see the module note. */
  order: number
  /** Announced. False means assignable but inert user-facing. */
  released: boolean
  /** Colour for the check glyph. */
  markClass: string
  /** The text tag that stands in for a standing in a table row. */
  tagClass: string
  /**
   * Belongs on a board of competitors — the Pros leaderboard, the esports
   * linking screen.
   *
   * A named flag rather than a rank cut, and the reason one exists at all: a
   * Verified Content Creator is someone we vouch for and emphatically not
   * someone to rank on a competitive ladder. Hall of Famer counts, because a
   * hall of fame is made of competitors.
   */
  competitive: boolean
  /**
   * May put outbound links on their public profile.
   *
   * Links are the one thing on a profile that sends a visitor somewhere we do
   * not control, which is why they were never open to everyone. Power Ranked
   * says "we know of this competitor", which is not the same as vouching for
   * where they point their audience. Everyone we actually vouch for gets them —
   * a Content Creator most of all, since the links are the point of the badge.
   *
   * Losing it is never destructive: `saveProfileFieldsAction` carries stored
   * links through for a caller who cannot change them, so a demotion stops
   * them editing and never empties what they saved.
   */
  canEditLinks: boolean
}

export const VERIFIED_KIND_DEFS: Record<VerifiedKind, VerifiedKindDef> = {
  top: {
    id: "top",
    label: "Top Player",
    description:
      "The best of the best — champions and perennial contenders. The rarest badge on the site; if it is not obvious, it is Pro Player.",
    markLabel: "Verified Top Player",
    order: 0,
    released: true,
    markClass: "text-tier-gold",
    tagClass: "border-tier-gold/50 bg-tier-gold/15 text-tier-gold",
    competitive: true,
    canEditLinks: true,
  },
  pro: {
    id: "pro",
    label: "Pro Player",
    description:
      "A verified professional who places well consistently. What every curated pro was before this had kinds.",
    markLabel: "Verified Pro Player",
    order: 1,
    released: true,
    markClass: "text-mystic",
    tagClass: "border-mystic/50 bg-mystic/15 text-mystic",
    competitive: true,
    canEditLinks: true,
  },
  "hall-of-famer": {
    id: "hall-of-famer",
    label: "Hall of Famer",
    description:
      "A name the scene is built on, whether or not they still queue. Silver because it is a legacy badge — earned once and never lost.",
    markLabel: "Verified Hall of Famer",
    order: 2,
    released: true,
    markClass: "text-tier-silver",
    tagClass: "border-tier-silver/50 bg-tier-silver/15 text-tier-silver",
    // A hall of fame is made of competitors, so they belong on a competitive
    // board even if they have stopped laddering. Flip this if it ever starts
    // being used for casters and organisers rather than players.
    competitive: true,
    canEditLinks: true,
  },
  "content-creator": {
    id: "content-creator",
    label: "Content Creator",
    description:
      "A streamer or video creator the community knows by name. Verified so their handle is the name we show, and so the links on their profile are theirs.",
    markLabel: "Verified Content Creator",
    order: 3,
    released: true,
    markClass: "text-twitch",
    tagClass: "border-twitch/50 bg-twitch/15 text-twitch",
    // Emphatically not a competitor: this is the kind the flag exists for.
    competitive: false,
    canEditLinks: true,
  },
  developer: {
    id: "developer",
    label: "Developer",
    description:
      "Builds Brawlhalla, or builds for the community. Distinct from the Developer account role, which is about admin access to this site.",
    markLabel: "Verified Developer",
    order: 4,
    released: true,
    markClass: "text-pink",
    tagClass: "border-pink/50 bg-pink/15 text-pink",
    competitive: false,
    canEditLinks: true,
  },
  "power-ranked": {
    id: "power-ranked",
    label: "Power Ranked",
    description:
      "A known competitor — on a power ranking or a regular entrant. An observation about who they are, not a claim about their results.",
    markLabel: "Power Ranked player",
    order: 5,
    released: true,
    markClass: "text-muted-foreground",
    tagClass: "border-border/60 bg-muted/40 text-muted-foreground",
    competitive: true,
    canEditLinks: false,
  },
  none: {
    id: "none",
    label: "Not verified",
    description:
      "No badge, and their in-game name is the name we show. The default, and what every ordinary player is — including an account that claimed its own profile.",
    markLabel: "",
    order: 6,
    released: true,
    markClass: "",
    tagClass: "",
    competitive: false,
    canEditLinks: false,
  },
}

export const DEFAULT_VERIFIED_KIND: VerifiedKind = "none"

/** Every kind an operator may assign, in display order. */
export const ASSIGNABLE_VERIFIED_KINDS: VerifiedKind[] = [
  ...VERIFIED_KINDS,
].sort((a, b) => VERIFIED_KIND_DEFS[a].order - VERIFIED_KIND_DEFS[b].order)

export function isVerifiedKind(v: unknown): v is VerifiedKind {
  return (
    typeof v === "string" && (VERIFIED_KINDS as readonly string[]).includes(v)
  )
}

/**
 * A stored value as a kind, falling back to none.
 *
 * Unrecognised degrades to *no badge*, which is the safe direction: a row
 * holding an id we no longer ship must never be mistaken for a claim we make
 * about a person. Same rule `parseRole` and `parsePlan` follow.
 */
export function parseVerifiedKind(v: unknown): VerifiedKind {
  return isVerifiedKind(v) ? v : DEFAULT_VERIFIED_KIND
}

/**
 * The kind for a row that may predate the column.
 *
 * `is_pro` stays declared and written for one deploy so the previously-running
 * build can keep selecting it. Until it goes, a row with a real kind wins and a
 * legacy `is_pro = true` reads as Pro Player, which is exactly the claim it was
 * already making. Nobody is promoted or demoted by the migration.
 */
export function resolveVerifiedKind(
  stored: unknown,
  legacyIsPro?: boolean | null
): VerifiedKind {
  if (isVerifiedKind(stored)) return stored
  return legacyIsPro ? "pro" : DEFAULT_VERIFIED_KIND
}

/**
 * The kind carried by a `verified` object, with the fallback for one written
 * before this shape existed.
 *
 * Shared by `previewKind` and `flairContextFrom` so the cache rule lives in one
 * place. Reads `kind` and then the older `tier`, because the preview is cached
 * for an hour: the deploy that renames the field has live entries holding the
 * old spelling, and a verified player must not lose their check while one ages
 * out. An entry with neither is someone we verified before kinds existed, so it
 * resolves to Pro Player — the badge they were already wearing.
 *
 * The `tier` arm is a bounded shim: droppable once the cache has certainly
 * turned over, which is one hour after the deploy that ships this.
 */
export function kindFromVerified(
  verified?: { kind?: VerifiedKind; tier?: VerifiedKind } | null
): VerifiedKind {
  if (!verified) return DEFAULT_VERIFIED_KIND
  return verified.kind ?? verified.tier ?? "pro"
}

/**
 * Do we vouch for this person at all — the named predicate every "is this a
 * verified player" question asks.
 *
 * Deliberately NOT a comparison on `order`. Adding a kind must not silently
 * enrol it in the handle swap and fourteen other surfaces; it must be an edit
 * to the catalogue above.
 */
export function isVerified(kind: VerifiedKind): boolean {
  return kind !== "none"
}

/** Belongs on a board of competitors. See `VerifiedKindDef.competitive`. */
export function isCompetitive(kind: VerifiedKind): boolean {
  return VERIFIED_KIND_DEFS[kind].competitive
}

/** May put outbound links on their public profile. */
export function kindCanEditLinks(kind: VerifiedKind): boolean {
  return VERIFIED_KIND_DEFS[kind].canEditLinks
}

/** Display precedence, lowest first. Presentation only — never a ranking. */
export function compareVerifiedKind(a: VerifiedKind, b: VerifiedKind): number {
  return VERIFIED_KIND_DEFS[a].order - VERIFIED_KIND_DEFS[b].order
}

/**
 * The one to show when a card has room for a single badge — a 2v2 podium
 * carries one mark for the pair.
 *
 * "First by display precedence", not "best": these kinds are not comparable,
 * and the only thing being decided is which glyph gets the slot.
 */
export function primaryVerifiedKind(
  kinds: Iterable<VerifiedKind>
): VerifiedKind {
  let best: VerifiedKind = DEFAULT_VERIFIED_KIND
  for (const k of kinds) if (compareVerifiedKind(k, best) < 0) best = k
  return best
}
