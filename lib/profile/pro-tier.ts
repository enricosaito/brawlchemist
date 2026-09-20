/**
 * How established a competitor is — one ordered axis, curated by hand.
 *
 * This replaces `profiles.is_pro`, a boolean that could only say "we vouch for
 * this person" and could not say how far. A known regional competitor and a
 * world champion both rendered the same blue check, so the badge meant
 * "somebody at Brawlchemist typed their name in" rather than anything about
 * them. Three levels, and the room to add a fourth, is the point.
 *
 * ORDERED, unlike role and plan, because these levels really are a ladder: Top
 * Player is strictly more than Pro Player is strictly more than Power Ranked.
 * That is what makes one column right here where two axes were right for
 * accounts (see lib/auth/account.ts) — nobody is Power Ranked *and* a Top
 * Player, and there is no pairing to represent.
 *
 * **But ordered is not the same as comparable at a call site.** "Is this person
 * curated at all" is `isCurated(tier)`, a named predicate, and never
 * `order <= 2` — the trap `ROLES.admin` is written around. Insert a tier
 * between two others one day and every rank comparison silently changes who it
 * covers, while a named predicate keeps meaning what it says. `order` is for
 * sorting and for picking the strongest of a set, nothing else.
 *
 * Curated, never derived. We hold facts that correlate — 30 of the 118 current
 * pros have won a Challengermode event, 26 hold a title — but "consistently
 * places well" is a judgement about a career, not a threshold anybody could
 * defend, and a tier that promoted itself would make a claim no human agreed
 * to. /admin shows the evidence beside the picker instead, the same way the
 * Esports links screen gathers evidence and refuses to write.
 *
 * No `server-only`: the badge renders on both sides of the RSC boundary
 * (FlairMark already pays for that boundary), and a parallel copy of the labels
 * would drift. Only components come from "use client" modules — constants live
 * in a plain one, which is why this is not inside the badge component.
 */

export const PRO_TIERS = ["top", "pro", "power-ranked", "none"] as const
export type ProTier = (typeof PRO_TIERS)[number]

export interface ProTierDef {
  id: ProTier
  /** On the tag and the admin picker. */
  label: string
  /**
   * The badge tooltip, and its aria-label.
   *
   * Spelled out per tier rather than built from `label`, because Power Ranked
   * must not say "Verified": we are reporting that they compete, not vouching
   * for how well. That distinction is the whole reason the bottom tier exists.
   */
  markLabel: string
  /** What an operator is asserting by choosing it. */
  description: string
  /** Display order, strongest first. Sorting and ranking only — see above. */
  order: number
  /** Announced. False means assignable but inert user-facing. */
  released: boolean
  /**
   * Colour for the check glyph. Gold is an accolade and grey is an
   * observation, which is the whole visual argument: the top tier is the only
   * one that gets to shout, and the bottom one deliberately does not read as a
   * verdict — it says "this is a competitor we know of", not "we vouch for
   * their results".
   *
   * Pro Player keeps `mystic`, the turquoise this check has always been.
   * `royal` was tried and reads as a heavier blue that competes with the gold
   * rather than sitting under it.
   *
   * Amber is untouched: it means caution on this site and nothing else.
   */
  markClass: string
  /** The text tag that replaces an in-game name in a table row. */
  tagClass: string
  /**
   * May put outbound links on their public profile.
   *
   * A named capability, not `order <= 1` — the same reason `ROLES.admin` is a
   * flag. Links are the one thing on a profile that sends a visitor somewhere
   * we do not control, which is why they were never open to everyone; Power
   * Ranked says "we know of this competitor", which is not the same as
   * vouching for where they point their audience.
   *
   * Losing it is never destructive: `saveProfileFieldsAction` carries stored
   * links through for a caller who cannot change them, so a demotion stops
   * them editing and never empties what they saved.
   */
  canEditLinks: boolean
}

export const PRO_TIER_DEFS: Record<ProTier, ProTierDef> = {
  top: {
    id: "top",
    label: "Top Player",
    markLabel: "Verified Top Player",
    description:
      "The best of the best — champions and perennial contenders. The rarest badge on the site; if it is not obvious, it is Pro Player.",
    order: 0,
    released: true,
    markClass: "text-tier-gold",
    tagClass: "border-tier-gold/50 bg-tier-gold/15 text-tier-gold",
    canEditLinks: true,
  },
  pro: {
    id: "pro",
    label: "Pro Player",
    markLabel: "Verified Pro Player",
    description:
      "A verified professional who places well consistently. What every curated pro was before tiers existed.",
    order: 1,
    released: true,
    markClass: "text-mystic",
    tagClass: "border-mystic/50 bg-mystic/15 text-mystic",
    canEditLinks: true,
  },
  "power-ranked": {
    id: "power-ranked",
    label: "Power Ranked",
    markLabel: "Power Ranked player",
    description:
      "A known competitor — on a power ranking or a regular entrant. An observation about who they are, not a claim about their results.",
    order: 2,
    released: true,
    markClass: "text-muted-foreground",
    tagClass: "border-border/60 bg-muted/40 text-muted-foreground",
    canEditLinks: false,
  },
  none: {
    id: "none",
    label: "Not curated",
    markLabel: "",
    description:
      "No badge. The default, and what every ordinary player is — including an account that claimed its own profile.",
    order: 3,
    released: true,
    markClass: "",
    tagClass: "",
    canEditLinks: false,
  },
}

export const DEFAULT_PRO_TIER: ProTier = "none"

/** Every tier an operator may assign, strongest first. */
export const ASSIGNABLE_PRO_TIERS: ProTier[] = [...PRO_TIERS].sort(
  (a, b) => PRO_TIER_DEFS[a].order - PRO_TIER_DEFS[b].order
)

export function isProTier(v: unknown): v is ProTier {
  return typeof v === "string" && (PRO_TIERS as readonly string[]).includes(v)
}

/**
 * A stored value as a tier, falling back to none.
 *
 * Unrecognised degrades to *no badge*, which is the safe direction: a row
 * holding an id we no longer ship must never be mistaken for a claim we make
 * about a person. Same rule `parseRole` and `parsePlan` follow.
 */
export function parseProTier(v: unknown): ProTier {
  return isProTier(v) ? v : DEFAULT_PRO_TIER
}

/**
 * The tier for a row that may predate the column.
 *
 * `is_pro` stays declared and written for one deploy so the previously-running
 * build can keep selecting it — `drizzle-kit push` has no rename, and a dropped
 * column takes its data with it. Until it goes, a row with a real tier wins and
 * a legacy `is_pro = true` reads as Pro Player, which is exactly the claim it
 * was already making. Nobody is promoted or demoted by the migration.
 */
export function resolveProTier(
  stored: unknown,
  legacyIsPro?: boolean | null
): ProTier {
  if (isProTier(stored)) return stored
  return legacyIsPro ? "pro" : DEFAULT_PRO_TIER
}

/**
 * Whether this person is curated at all — the named predicate every "is a pro"
 * question asks, in place of the old boolean.
 *
 * Deliberately NOT a comparison on `order`. Adding a tier below Power Ranked
 * later must not silently enrol it in the pros board, the handle swap and
 * fourteen other surfaces; it must fail to compile, or be an edit here.
 */
export function isCurated(tier: ProTier): boolean {
  return tier !== "none"
}

/** Strongest first, for sorting a list by standing. */
export function compareProTier(a: ProTier, b: ProTier): number {
  return PRO_TIER_DEFS[a].order - PRO_TIER_DEFS[b].order
}

/**
 * The tier carried by a `verified` object, with the fallback for one written
 * before tiers existed.
 *
 * Shared by `previewTier` and `flairContextFrom` so the cache rule lives in a
 * single place. A curated player whose entry predates the column was drawing
 * the blue check a moment ago and must keep drawing it, so an absent tier
 * resolves to Pro Player rather than to nothing — see the note on
 * `PlayerPreview.verified`.
 */
export function tierFromVerified(
  verified?: { tier?: ProTier } | null
): ProTier {
  if (!verified) return DEFAULT_PRO_TIER
  return verified.tier ?? "pro"
}

/** Whether this tier may put outbound links on its public profile. */
export function tierCanEditLinks(tier: ProTier): boolean {
  return PRO_TIER_DEFS[tier].canEditLinks
}

/** The strongest tier in a set, or none. */
export function bestProTier(tiers: Iterable<ProTier>): ProTier {
  let best: ProTier = DEFAULT_PRO_TIER
  for (const t of tiers) if (compareProTier(t, best) < 0) best = t
  return best
}
