import "server-only"

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
 * `server-only` because every entry carries a function: predicates can't cross
 * the RSC boundary, so the shelf evaluates them server-side and ships the
 * answer. The one client boundary is the tooltip, which was already there.
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
  },
]

export interface AchievementState {
  def: AchievementDef
  unlocked: boolean
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
    .map((def) => ({
      def,
      // Fails open to locked: a rule that throws is a silhouette, never a
      // broken profile (cardinal constraint #5).
      unlocked: (() => {
        try {
          return def.holds(ctx)
        } catch (err) {
          console.error(`[achievements] rule "${def.id}" threw:`, err)
          return false
        }
      })(),
    }))
}
