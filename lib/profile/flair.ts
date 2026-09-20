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

import {
  isVerified,
  isVerifiedKind,
  kindFromVerified,
  DEFAULT_VERIFIED_KIND,
  type VerifiedKind,
} from "@/lib/profile/verified"

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
 * - `pro-tier` — their curated standing is exactly `ruleValue` (a tier id from
 *   lib/profile/pro-tier.ts). Exact, never "this tier or better": a threshold
 *   would silently widen the moment a tier is inserted between two others, and
 *   the badge would start appearing on people nobody decided to give it to —
 *   the same trap `ROLES.admin` and `canEditLinks` are named flags to avoid. An
 *   operator who wants two tiers to share a badge makes two flairs.
 * - `earnings` — career tournament prize money is at least `ruleValue` USD.
 *   A threshold rather than an exact match, unlike `pro-tier`, because money is
 *   a quantity and "at least" is the only sensible reading of one; raising the
 *   bar later narrows the badge instead of silently re-pointing it at a
 *   different group. Reads `profiles.earnings`, which a script fills from
 *   brawltools — null means "never looked", and never-looked is not zero, so it
 *   fires for nobody rather than guessing.
 * - `manual` — awarded per player from /admin, recorded in `flair_grants`. The
 *   only rule available to a badge invented after the fact, and therefore the
 *   thing that makes "create a flair" mean anything.
 */
export const FLAIR_RULES = [
  "developer",
  "claimed",
  "achievement",
  "pro-tier",
  "earnings",
  "manual",
] as const
export type FlairRule = (typeof FLAIR_RULES)[number]

export const FLAIR_RULE_LABELS: Record<FlairRule, string> = {
  developer: "Developer role",
  claimed: "Linked account",
  achievement: "Accolade matches",
  "pro-tier": "Verified as",
  earnings: "Earnings at least",
  manual: "Granted by hand",
}

export function isFlairRule(value: unknown): value is FlairRule {
  return (
    typeof value === "string" &&
    (FLAIR_RULES as readonly string[]).includes(value)
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
  /**
   * What the rule matches against: an accolade substring for `achievement`, a
   * kind id for `pro-tier`, a whole-dollar threshold for `earnings`. Ignored by
   * the rules that read a boolean.
   */
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
 * Seeded into the `flairs` table from the admin panel; until that happens —
 * and any time the read fails — they are what renders, so a badge never
 * disappears because a query did.
 *
 * Adding one here does NOT make it appear on a site whose table is already
 * seeded: the fallback is only consulted when the read comes back empty or
 * throws. A new badge needs its row as well, or it exists in the code and
 * nowhere anyone can see.
 */
export const BUILTIN_FLAIRS: FlairDef[] = [
  {
    // Lowest sort, so it wins autoFlairId: catalogue order is the rarity
    // ranking, and there are a handful of these against every world champion
    // the game has produced.
    id: "developer",
    label: "Brawlchemist Developer",
    requirement: "Build Brawlchemist",
    src: "/assets/flairs/flair-developer.gif",
    // Animated, and therefore served whole: Next’s optimizer detects animation
    // and passes the file through untouched, so the raw weight lands on every
    // leaderboard row that draws it. Worth keeping small for that reason rather
    // than for the 16px it renders at.
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
    // Between the championship and the hand-awarded badge: rarer than Early
    // Tester, commoner than winning a world championship. Sort is the rarity
    // ranking and autoFlairId flies the lowest a player holds, so a champion
    // who is also top-tier keeps flying the championship.
    id: "grand-champion",
    label: "Grand Champion",
    requirement: "Win $50,000 in tournament prize money",
    src: "/assets/flairs/grand-champion.png",
    width: 201,
    height: 192,
    rule: "earnings",
    ruleValue: "50000",
    sort: 30,
  },
  {
    // Hand-awarded, because there is no fact on a player record that says
    // "was here early" — the site keeps no history of who visited before what.
    // `manual` is the rule for exactly that: a badge whose evidence lives in
    // someone's memory rather than in a column.
    id: "early-tester",
    label: "Early Tester",
    requirement: "Use Brawlchemist while it was still being built",
    src: "/assets/flairs/flair-tester.png",
    width: 544,
    height: 719,
    rule: "manual",
    sort: 50,
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
  catalogue: FlairDef[] = BUILTIN_FLAIRS
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
  /**
   * Career tournament prize money in whole USD, for rule `earnings`.
   *
   * Undefined means we have never looked this player up, which is deliberately
   * not the same as zero: the rule declines rather than guessing.
   */
  earnings?: number
  /**
   * Their curated standing, for rule `pro-tier`.
   *
   * `none` is a real answer rather than a missing one, because the rule has to
   * be able to say no. Derived like everything else here, so an operator
   * demoting someone takes the badge with it on the next render.
   */
  verifiedKind?: VerifiedKind
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
        earnings?: number
        /** A PlayerPreview carries the standing inside `verified`… */
        verified?: { kind?: VerifiedKind; tier?: VerifiedKind } | null
        /** …a hand-built member object carries it flat. */
        verifiedKind?: VerifiedKind
      }
    | null
    | undefined
): FlairContext {
  return {
    esportsTitles: preview?.esportsTitles,
    developer: preview?.developer,
    grants: preview?.flairGrants,
    claimed: preview?.claimed,
    earnings: preview?.earnings,
    // Two shapes, one answer, and both read here rather than at fifteen call
    // sites. This function takes a *structural* type, so an object missing the
    // field is still assignable and quietly reads as "no standing" — the trap
    // CLAUDE.md records for the esportsTitles rename.
    verifiedKind: preview?.verified
      ? kindFromVerified(preview.verified)
      : (preview?.verifiedKind ?? DEFAULT_VERIFIED_KIND),
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
      return !!ctx.esportsTitles?.some((t) => t.toLowerCase().includes(needle))
    }
    case "pro-tier": {
      const want = (flair.ruleValue ?? "").trim()
      // A value that is not a tier we ship, or is the absence of one, fires for
      // nobody. Without the second guard a typo would parse to `none` and hand
      // the badge to every uncurated player on the site — which is almost
      // everyone, and the same failure an empty `achievement` needle has.
      if (!isVerifiedKind(want) || !isVerified(want)) return false
      return ctx.verifiedKind === want
    }
    case "earnings": {
      const threshold = Number((flair.ruleValue ?? "").trim())
      // A missing or nonsensical threshold fires for nobody, the same as an
      // empty `achievement` needle — and zero would hand the badge to every
      // player we have ever looked up, which is the failure worth guarding.
      if (!Number.isFinite(threshold) || threshold <= 0) return false
      return (ctx.earnings ?? 0) >= threshold
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
  catalogue: FlairDef[] = BUILTIN_FLAIRS
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
  catalogue: FlairDef[] = BUILTIN_FLAIRS
): FlairId | null {
  return byRarity(catalogue).find((f) => earned.includes(f.id))?.id ?? null
}

/**
 * Which rules a player can *choose* between.
 *
 * Two of the rules aren't choices at all. `claimed` fires for every linked
 * account, so its badge is the floor of the catalogue rather than a prize, and
 * `developer` follows a role the account either has or doesn't. Offering either
 * one in the picker asks a question with one answer — and worse, implies you
 * could decline it, which you can't: both are derived on every render.
 *
 * So they render but are never listed. A flair you earn by *doing* something is
 * the only kind worth a tile: an accolade, a hand-awarded badge, or a standing
 * you competed your way into. `pro-tier` is listed for that last reason — it is
 * rare, it is earned, and unlike the two above it is genuinely a choice, since
 * a player who holds it may prefer to fly something else.
 */
export const SELECTABLE_FLAIR_RULES: FlairRule[] = [
  "achievement",
  "pro-tier",
  "earnings",
  "manual",
]

export function isSelectableFlair(flair: FlairDef): boolean {
  return flair.enabled !== false && SELECTABLE_FLAIR_RULES.includes(flair.rule)
}

/**
 * The membership badge: the rarest enabled flair whose rule is `claimed`.
 *
 * Found by rule rather than by id, so nothing hardcodes "brawlchemist-user". An
 * operator can rename or replace it and the badge keeps meaning "this profile
 * belongs to someone with an account here".
 */
export function memberFlair(
  catalogue: FlairDef[] = BUILTIN_FLAIRS
): FlairDef | null {
  return (
    byRarity(catalogue).find(
      (f) => f.enabled !== false && f.rule === "claimed"
    ) ?? null
  )
}

/** The catalogue as the picker should show it. */
export function selectableFlairs(
  catalogue: FlairDef[] = BUILTIN_FLAIRS
): FlairDef[] {
  return byRarity(catalogue).filter(isSelectableFlair)
}

/**
 * The flair to actually render: the player's choice, honoured only while they
 * still hold it. An unset choice falls back to their best earned one so a badge
 * shows up the moment it's won without anyone visiting a settings panel — and
 * so a profile never silently loses its badge when a selection lapses. A player
 * who drops out of Valhallan keeps showing the trophy they also earned rather
 * than nothing.
 *
 * The membership badge rides to the right of it, always, for anyone who has
 * one. It is not a second prize and not a choice — it says the profile belongs
 * to someone with an account here, which is true independently of whatever they
 * are flying, so it is appended rather than competing for the slot. A linked
 * account that has earned nothing else shows it alone, because the badge it
 * would otherwise fly *is* the membership badge and one is enough.
 *
 * It is also the one badge "None" cannot take away, for the same reason: None
 * is a choice about what you fly, and membership is not one of the things you
 * are choosing between.
 */
export function resolveFlair(
  selectedId: string | null | undefined,
  ctx: FlairContext,
  catalogue: FlairDef[] = BUILTIN_FLAIRS
): FlairDef | null {
  return resolveFlairs(selectedId, ctx, catalogue)[0] ?? null
}

/** Every badge to draw, left to right. */
export function resolveFlairs(
  selectedId: string | null | undefined,
  ctx: FlairContext,
  catalogue: FlairDef[] = BUILTIN_FLAIRS
): FlairDef[] {
  return resolveEarnedFlairs(
    selectedId,
    earnedFlairIds(ctx, catalogue),
    catalogue
  )
}

/**
 * The same rule, for callers that already hold the earned list.
 *
 * The profile header is one: it is handed `earned` by the server and used to
 * re-implement this — pick the selection if earned, else the automatic one — in
 * its own component. A second copy of a rule does not announce itself when the
 * rule changes, and that one had already drifted once. There is one now.
 */
export function resolveEarnedFlairs(
  selectedId: string | null | undefined,
  earned: FlairId[],
  catalogue: FlairDef[] = BUILTIN_FLAIRS
): FlairDef[] {
  // An explicit None drops the badge you chose to fly. It does not drop the
  // one that says you have an account here — that is not a flair you picked,
  // it is what a linked profile *is*, derived on every render from
  // profiles.userId and never stored as a selection. Letting None clear it made
  // membership look optional and made two different states ("no account" and
  // "account, badge off") render identically next to a name.
  if (selectedId === FLAIR_NONE) {
    const only = memberFlair(catalogue)
    return only && earned.includes(only.id) ? [only] : []
  }
  if (earned.length === 0) return []

  const chosen =
    selectedId && earned.includes(selectedId)
      ? flairById(selectedId, catalogue)
      : flairById(autoFlairId(earned, catalogue), catalogue)

  const out = chosen ? [chosen] : []
  const member = memberFlair(catalogue)
  if (member && earned.includes(member.id) && member.id !== chosen?.id) {
    out.push(member)
  }
  return out
}
