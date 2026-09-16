/**
 * Flair — the badge a player flies next to their name.
 *
 * Two halves that must not be confused. *Entitlement* is what a player has
 * earned and is derived on every render from data we already hold — it can
 * never be set. The *selection* is which of those they choose to show, stored
 * on their customization row. Locked flair still renders in the picker, greyed
 * with the unlock line, because a badge nobody can see isn't worth chasing.
 *
 * The *catalogue* — what exists, what it's called, what it looks like, how rare
 * it is — is curated from /admin and lives in the `flairs` table. Every
 * function here takes it as an argument rather than importing it, because this
 * module is shared by client and server: the server reads it from Postgres
 * (lib/sync/flairs), the client gets it through FlairCatalogueProvider, and
 * both fall back to BUILTIN_FLAIRS so a missing table or a failed read costs a
 * badge's *editability*, never the badge (cardinal constraint #5).
 *
 * No "server-only" import: the picker is a client component and needs the
 * catalogue's labels and art. Entitlement is computed from a context the server
 * assembles and passes in.
 */

/** A catalogue id. Free-form since operators mint these — see isFlairIdShape. */
export type FlairId = string

/**
 * How a flair is earned. Deliberately a closed, code-backed list: an operator
 * picks which rule a badge uses, but cannot author a new one, because "has this
 * player earned it" is a question only code can ask of the player record.
 *
 * - `developer` — the account behind the profile has the Developer role.
 * - `claimed` — the profile is linked to a Brawlchemist account. The one rule
 *   everybody can satisfy, which is exactly why it exists: a catalogue where
 *   every badge is unreachable teaches nobody that badges exist at all.
 * - `achievement` — `ruleValue` appears (case-insensitively) in their esports
 *   titles. The stored token stays "achievement" even though the field it reads
 *   was renamed: it lives in `flairs.rule`, `parseFlairRule` degrades anything
 *   unrecognised to `manual`, and renaming it would silently demote the World
 *   Champion flair between the deploy and the data edit.
 * - `manual` — awarded per player from /admin, recorded in `flair_grants`. The
 *   only rule available to a badge invented after the fact, and therefore the
 *   thing that makes "create a flair" mean anything.
 */
export const FLAIR_RULES = [
  "developer",
  "claimed",
  "achievement",
  "manual",
] as const
export type FlairRule = (typeof FLAIR_RULES)[number]

export const FLAIR_RULE_LABELS: Record<FlairRule, string> = {
  developer: "Developer role",
  claimed: "Linked account",
  achievement: "Accolade matches",
  manual: "Granted by hand",
}

export function isFlairRule(value: unknown): value is FlairRule {
  return (
    typeof value === "string" && (FLAIR_RULES as readonly string[]).includes(value)
  )
}

export function parseFlairRule(value: unknown): FlairRule {
  return isFlairRule(value) ? value : "manual"
}

export interface FlairDef {
  id: FlairId
  /** Shown in the picker and as the tooltip on the profile. */
  label: string
  /** How to earn it — shown when the player hasn't. */
  requirement: string
  src: string
  width: number
  height: number
  rule: FlairRule
  /** The accolade substring, for rule `achievement`. Ignored otherwise. */
  ruleValue?: string | null
  /** Rarity rank, ascending — the lowest a player holds is the one they fly. */
  sort: number
  /**
   * Off hides the badge everywhere without deleting the row, so an operator can
   * retire a flair without destroying anyone's selection of it. Optional
   * because the public catalogue is already filtered; the guard in
   * earnedFlairIds is what makes a disabled row safe to pass anywhere.
   */
  enabled?: boolean
}

/**
 * An id is a slug, not a catalogue lookup.
 *
 * Validating a *selection* against the catalogue used to be the check, and it
 * was subtly wrong the moment the catalogue became editable: a player choosing
 * a newly created flair would have had their choice silently dropped by
 * whichever server hadn't seen the new row yet. Entitlement is re-derived on
 * every render anyway, so an id that means nothing simply falls back — the only
 * thing worth rejecting here is a value that isn't shaped like an id at all.
 */
export function isFlairIdShape(value: unknown): value is FlairId {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 64 &&
    /^[a-z0-9][a-z0-9-]*$/.test(value)
  )
}

/** Force arbitrary text into a usable id, for the admin create form. */
export function toFlairId(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
}

/**
 * The catalogue the site ships with, and the floor every read falls back to.
 *
 * These two predate the `flairs` table and are seeded into it from the admin
 * panel; until that happens — and any time the read fails — they are what
 * renders, so a badge never disappears because a query did.
 */
export const BUILTIN_FLAIRS: FlairDef[] = [
  {
    // Lowest sort, so it wins autoFlairId: catalogue order is the rarity
    // ranking, and there are a handful of these against every world champion
    // the game has produced.
    id: "developer",
    label: "Brawlchemist Developer",
    requirement: "Build Brawlchemist",
    src: "/assets/flairs/flair-developer.png",
    // Resampled from 1024px: flair draws at 16px and ships unoptimised on every
    // leaderboard row, so the source size lands fifty times on one screen.
    width: 193,
    height: 192,
    rule: "developer",
    sort: 10,
  },
  {
    id: "world-champion",
    label: "World Champion",
    requirement: "Win a Brawlhalla world championship",
    src: "/assets/Legendary_moment_trophy.png",
    width: 616,
    height: 1212,
    rule: "achievement",
    ruleValue: "world champion",
    sort: 20,
  },
  {
    // Last, so it never outranks a badge someone had to do something for. It is
    // the floor of the catalogue rather than a prize: a linked account flies it
    // until they earn something rarer, at which point autoFlairId moves on
    // without anyone having to visit a settings panel.
    id: "brawlchemist-user",
    label: "Brawlchemist User",
    requirement: "Link your account and claim your Brawlhalla profile",
    src: "/assets/Brawlchemist.png",
    width: 192,
    height: 192,
    rule: "claimed",
    sort: 100,
  },
]

export function flairById(
  id: string | null | undefined,
  catalogue: FlairDef[] = BUILTIN_FLAIRS,
): FlairDef | null {
  if (!id) return null
  return catalogue.find((f) => f.id === id) ?? null
}

/**
 * Everything the entitlement rules read.
 *
 * All of it already loaded for the profile: accolades and the owner's role come
 * off the cached profiles map, and manual grants ride along with them. A rule
 * that needed its own query would put a cost on every render for a 20px image,
 * which is why the rule list is closed rather than open-ended.
 */
export interface FlairContext {
  /** Admin-curated esports titles, the same strings the title tags use. */
  esportsTitles?: string[]
  /**
   * The account behind this profile has the Developer role.
   *
   * Derived, never selected — computed on each render from
   * `app_users.account_role`, so revoking the role takes the badge with it and
   * there is nothing to clean up.
   */
  developer?: boolean
  /** Flair ids awarded by hand from /admin (see `flair_grants`). */
  grants?: string[]
  /**
   * This profile is linked to a Brawlchemist account.
   *
   * Derived from `profiles.userId` like everything else here, so the badge
   * appears the moment a claim lands — verifyClaim already busts the profiles
   * tag this preview is read from — and leaves again if the link is removed.
   */
  claimed?: boolean
}

/**
 * Build the context from a player's preview.
 *
 * One place, so adding a rule later is an edit here rather than an audit of
 * every surface that renders a badge. Each call site used to spell out
 * `{ esportsTitles: x?.esportsTitles }` by hand, and the twelfth one to be
 * forgotten is a flair that silently doesn't show on one page.
 */
export function flairContextFrom(
  preview:
    | {
        esportsTitles?: string[]
        developer?: boolean
        flairGrants?: string[]
        claimed?: boolean
      }
    | null
    | undefined,
): FlairContext {
  return {
    esportsTitles: preview?.esportsTitles,
    developer: preview?.developer,
    grants: preview?.flairGrants,
    claimed: preview?.claimed,
  }
}

/** Does this one flair's rule fire for this player? */
function holds(flair: FlairDef, ctx: FlairContext): boolean {
  switch (flair.rule) {
    case "developer":
      return !!ctx.developer
    case "claimed":
      return !!ctx.claimed
    case "achievement": {
      const needle = (flair.ruleValue ?? "").trim().toLowerCase()
      // An empty needle would match every accolade, handing the badge to every
      // pro on the site. A rule with nothing to match fires for nobody.
      if (!needle) return false
      return !!ctx.esportsTitles?.some((t) =>
        t.toLowerCase().includes(needle),
      )
    }
    case "manual":
      return !!ctx.grants?.includes(flair.id)
  }
}

/** Rarest first, which is the order every "best held" question is answered in. */
function byRarity(catalogue: FlairDef[]): FlairDef[] {
  return [...catalogue].sort((a, b) => a.sort - b.sort)
}

export function earnedFlairIds(
  ctx: FlairContext,
  catalogue: FlairDef[] = BUILTIN_FLAIRS,
): FlairId[] {
  return byRarity(catalogue)
    .filter((f) => f.enabled !== false && holds(f, ctx))
    .map((f) => f.id)
}

/**
 * Stored value meaning "I don't want to fly one", as distinct from null, which
 * means "never chose" and gets the automatic pick below. Without the
 * distinction, turning your flair off would be indistinguishable from not
 * having touched the setting, and the next render would put it back.
 */
export const FLAIR_NONE = "none"

/**
 * The flair a player flies when they haven't picked one: the rarest they hold.
 *
 * Shared with the picker so the panel can show the automatic choice as the
 * selected row. Without it the panel would say "None" while the profile behind
 * it displayed a badge, which is the kind of disagreement that makes a settings
 * screen untrustworthy.
 */
export function autoFlairId(
  earned: FlairId[],
  catalogue: FlairDef[] = BUILTIN_FLAIRS,
): FlairId | null {
  return byRarity(catalogue).find((f) => earned.includes(f.id))?.id ?? null
}

/**
 * The flair to actually render: the player's choice, honoured only while they
 * still hold it. An unset choice falls back to their best earned one so a badge
 * shows up the moment it's won without anyone visiting a settings panel — and
 * so a profile never silently loses its badge when a selection lapses. A player
 * who drops out of Valhallan keeps showing the trophy they also earned rather
 * than nothing.
 */
export function resolveFlair(
  selectedId: string | null | undefined,
  ctx: FlairContext,
  catalogue: FlairDef[] = BUILTIN_FLAIRS,
): FlairDef | null {
  if (selectedId === FLAIR_NONE) return null
  const earned = earnedFlairIds(ctx, catalogue)
  if (earned.length === 0) return null
  if (selectedId && earned.includes(selectedId)) {
    return flairById(selectedId, catalogue)
  }
  return flairById(autoFlairId(earned, catalogue), catalogue)
}
