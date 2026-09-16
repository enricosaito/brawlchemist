/**
 * Achievements — the shelf of feats on a player's profile.
 *
 * Deliberately not flair, though both are badges. Flair answers "which one do
 * you fly", so it is a rarity-ranked catalogue you pick one from and it follows
 * the player's name across the site. An achievement answers "what have you
 * done", so the whole set renders at once, in a fixed order, on the profile and
 * nowhere else — and the ones you *haven't* earned show as silhouettes, because
 * the unearned half is the entire point. A locked badge nobody can see is a
 * feature nobody chases.
 *
 * That difference is why the catalogue is code rather than a curated table like
 * `flairs`. A flair's rule comes from a short allow-list an operator picks from;
 * an achievement's rule is the achievement — "peak 2,000 elo" and "claimed your
 * profile" have nothing in common to pick between. Adding one is a predicate,
 * which means a deploy either way, so the entry and its rule live together.
 *
 * Predicates can't cross the RSC boundary, so `AchievementShelf` evaluates them
 * server-side and ships the answer — the one client boundary there is the
 * tooltip, which was already one.
 *
 * The module itself is importable from the client, deliberately. The unlock
 * toast has to name and picture the badge it is announcing, and importing the
 * catalogue is how it says the same thing the shelf says. Duplicating the three
 * presentational fields into the toast would mean renaming a badge in two
 * places, and the second one always gets missed. Nothing here touches the
 * database or the filesystem, so the bundle cost is the entries themselves.
 *
 * ## Adding one
 *
 * Drop art in `public/assets/badges/`, add an entry below, and give it a rule
 * over `AchievementContext`. The hard constraint is that constraint: a rule may
 * only read what the profile page has already loaded (cardinal constraint #1 —
 * a badge must not put a query, let alone an API call, on a render path). If
 * the fact you want isn't in the context, the honest fix is to add it to the
 * context from data the page holds, not to fetch it.
 */

export interface AchievementDef {
  id: string
  /** Tooltip title. */
  name: string
  /**
   * One line, written so it reads as an instruction when locked and as a fact
   * when earned — the same string serves both states, and a badge whose
   * requirement only appears once you've met it explains nothing.
   */
  description: string
  src: string
  width: number
  height: number
  /** Shelf order, ascending. Stable, so a new badge doesn't reshuffle the row. */
  sort: number
  /** Earned? Reads only the context — see the note above about queries. */
  holds: (ctx: AchievementContext) => boolean
  /**
   * An extra line shown only once the badge is earned — when, or how far past
   * the bar they are.
   *
   * Locked, a badge should say what to do and nothing else; a date or a count
   * there would either be blank or, worse, leak the viewer's progress into a
   * requirement. Earned, the interesting part stops being "what is this" and
   * becomes "when did I do it", which is what every achievement system worth
   * copying shows.
   */
  detail?: (ctx: AchievementContext) => string | null
}

/**
 * Everything the rules may read.
 *
 * All of it already computed for the profile header, so the shelf costs one
 * pass over a short array and nothing else. Fields are optional because the
 * page renders for players with no ranked season, no account stats and no
 * profile row, and a rule must return false for them rather than throw.
 */
export interface AchievementContext {
  /** Profile claimed by a Brawlchemist account (the Discord/email link). */
  claimed?: boolean
  /** This ranked season's rating, and the best it has been. */
  rating?: number | null
  peakRating?: number | null
  /** 1v1 plus every 2v2 team, the same total the header shows. */
  games?: number
  wins?: number
  /** Brawlhalla account level, when lifetime stats loaded. */
  accountLevel?: number | null
  /** Valhallan this season — ladder membership, not a rating threshold. */
  valhallan?: boolean
  /** Admin-curated esports accolades, the same strings the title tags use. */
  accolades?: string[]
  /**
   * When the account behind this profile joined Brawlchemist, ISO date.
   *
   * Sign-up, not claim: how long they have been a *user*. Undefined for an
   * unclaimed profile, which has no account and therefore no age — so an
   * age-based rule must return false for it rather than treat missing as zero.
   *
   * The Brawlhalla account's own age is deliberately absent: the developer API
   * exposes no creation date on /player/{id}/stats or anywhere else (level, xp,
   * games and clan are the whole of it), and the only thing shaped like one —
   * clan_create_date — belongs to the clan. Inferring it from the ordinal of a
   * brawlhalla_id would be a guess printed as a fact.
   */
  memberSince?: string
  /** That account has favourited at least one player. */
  hasFavorites?: boolean
  /**
   * The owner has changed something about how this profile looks — a banner, a
   * flair, a bio, a link, a favourite legend.
   *
   * Free to ask: the profile page already reads the customization row to render
   * the header, so this is a boolean over data in hand rather than a lookup.
   */
  hasCustomization?: boolean
}

/**
 * The catalogue, rarest last so the shelf reads left to right as a ladder.
 *
 * One entry today. It is the one that makes the shelf worth rendering at all:
 * every other feat is something you did in Brawlhalla, and this is the only one
 * that is something you did here.
 */
export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "new-user",
    name: "Welcome to Brawlchemist",
    description: "Link your account and claim your Brawlhalla profile",
    src: "/assets/badges/new-user.webp",
    // The source art was 1000×870; it renders at 56px and ships unoptimised
    // like everything else here, so it was resampled to 256px wide (~21 KB).
    width: 256,
    height: 223,
    sort: 10,
    holds: (ctx) => !!ctx.claimed,
    detail: (ctx) =>
      ctx.memberSince ? `Member since ${monthYear(ctx.memberSince)}` : null,
  },
  {
    id: "add-to-favorites",
    name: "Talent Scout",
    // Enrico's own wording. It is the requirement verbatim, which is exactly
    // what a locked row needs.
    description: "Added a player profile to the Favorites",
    src: "/assets/badges/add-to-favorites.webp",
    width: 256,
    height: 288,
    sort: 20,
    holds: (ctx) => !!ctx.hasFavorites,
  },
  {
    id: "customize-profile",
    name: "Made It Yours",
    description: "Customized your profile",
    src: "/assets/badges/customize-profile.webp",
    width: 256,
    height: 196,
    sort: 30,
    holds: (ctx) => !!ctx.hasCustomization,
  },
]

/**
 * "Sep 2026" — a month, not a day.
 *
 * Fixed en-US like every other date on the site, so the server-rendered string
 * can't disagree with a client locale. Month granularity because the exact day
 * someone signed up is nobody's business but theirs, and a badge is not an
 * audit log.
 */
function monthYear(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

export interface AchievementState {
  def: AchievementDef
  unlocked: boolean
  /** The earned-only extra line, already evaluated. Null when there is none. */
  detail: string | null
}

/**
 * The whole shelf, in order, each marked earned or not.
 *
 * Returns every badge rather than only the earned ones — the locked half is
 * what the shelf is for. Sorted defensively rather than trusting catalogue
 * order, so an entry appended in the wrong place still lands where its `sort`
 * says.
 */
export function resolveAchievements(
  ctx: AchievementContext,
): AchievementState[] {
  return [...ACHIEVEMENTS]
    .sort((a, b) => a.sort - b.sort)
    .map((def) => {
      // Fails open to locked: a rule that throws is a silhouette, never a
      // broken profile (cardinal constraint #5).
      let unlocked = false
      try {
        unlocked = def.holds(ctx)
      } catch (err) {
        console.error(`[achievements] rule "${def.id}" threw:`, err)
      }
      let detail: string | null = null
      if (unlocked && def.detail) {
        try {
          detail = def.detail(ctx)
        } catch (err) {
          console.error(`[achievements] detail "${def.id}" threw:`, err)
        }
      }
      return { def, unlocked, detail }
    })
}
