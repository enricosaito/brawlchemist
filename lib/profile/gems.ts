import type { AchievementContext } from "./achievements"

/**
 * Gems — the graded half of the accolade system.
 *
 * Three kinds of thing now hang off a profile and they are not
 * interchangeable:
 *
 *   esports titles   admin-curated, a fact about their career
 *   achievements     derived, binary — you did it or you haven't
 *   gems             derived, *graded* — the same gem at a different level
 *
 * A gem is the right shape for anything with a number behind it. "Peak elo"
 * has no honest yes/no answer, and minting one achievement per threshold would
 * put five nearly identical badges on the shelf and call four of them locked.
 * One gem that changes colour says the same thing in one object, and says it
 * better: the level *is* the number.
 *
 * Like achievements, a gem reads only `AchievementContext` — facts the profile
 * header already computed. Same hard rule: a gem does not get to put a query on
 * a render path.
 */
export type GemContext = AchievementContext

export interface GemLevelDef {
  /** 1-based. The array index is not the level, so a tier can be inserted. */
  level: number
  /** The colour's name, which is also the level's name. */
  label: string
  /** Inclusive floor. Levels are ascending; the highest one reached wins. */
  min: number
  /**
   * Sprite for this level, once the art exists.
   *
   * Optional on purpose. Every level renders a tinted facet shape until a
   * sprite is dropped in, so the system works before the art does and adding
   * art later is filling in a field rather than changing a component. The
   * fallback is a real design, not a placeholder box — a gem is a gem.
   */
  src?: string
  width?: number
  height?: number
  /** CSS custom property the fallback facets are tinted with. */
  tone: string
}

export interface GemDef {
  id: string
  /** What the gem is called — the metric, not the colour. */
  name: string
  /** One line for the tooltip, present tense. */
  description: string
  /** The number behind it, or null when the profile has no answer. */
  metric: (ctx: GemContext) => number | null
  /** How that number reads to a person. */
  format: (value: number) => string
  /** Ascending by `min`. */
  levels: GemLevelDef[]
}

/**
 * The ladder every gem climbs.
 *
 * Deliberately not the rank tiers. A gem that went Bronze -> Diamond would read
 * as a rank a player doesn't have, on a profile that already prints their real
 * one two inches below — which is also why the top level is Ruby rather than
 * Diamond. Mineral names and a cool-to-hot ramp keep the two systems from being
 * confused at a glance.
 *
 * Art is Brawlhalla's Scrying Glass and its colour variants. **The filenames
 * lie**: the file called Cyan is orange, the one called Orange is dusty rose,
 * and Verdant Bloom is cream rather than green. Every mapping below was picked
 * by looking at the sprite, not by reading its name — do the same before adding
 * a level. Four variants are unused and waiting: teal, magenta, rose and orange.
 *
 * `tone` still matters. It is what the fallback facet shape is tinted with when
 * a level has no sprite, which is the state every new level starts in.
 */
const LEVELS = [
  {
    label: "Quartz",
    tone: "var(--color-muted-foreground)",
    src: "/assets/gems/Scrying_Glass_Verdant_Bloom.webp",
    width: 192,
    height: 194,
  },
  {
    label: "Amethyst",
    tone: "var(--color-mystic)",
    src: "/assets/gems/Scrying_Glass_Gala.webp",
    width: 192,
    height: 194,
  },
  {
    label: "Sapphire",
    tone: "var(--color-ice)",
    src: "/assets/gems/Scrying_Glass_Team_Blue_Secondary.webp",
    width: 192,
    height: 192,
  },
  {
    label: "Emerald",
    tone: "var(--color-positive)",
    src: "/assets/gems/Scrying_Glass_Lucky_Clover.webp",
    width: 192,
    height: 194,
  },
  {
    label: "Ruby",
    // Copper rather than the negative token: the fallback wants a warm red, and
    // negative means "you lost" everywhere else on the site.
    tone: "var(--color-copper)",
    src: "/assets/gems/Scrying_Glass_Red.webp",
    width: 192,
    height: 194,
  },
] as const

/** Five levels with the same names everywhere, so a colour means one thing. */
function ladder(mins: [number, number, number, number, number]): GemLevelDef[] {
  return LEVELS.map((l, i) => ({ level: i + 1, min: mins[i], ...l }))
}

/**
 * Three to start. Each reads a number the profile header already has, which is
 * the constraint that decides what can be a gem at all.
 */
export const GEMS: GemDef[] = [
  {
    id: "peak-elo",
    name: "Peak Elo",
    description: "Highest 1v1 rating reached this season",
    metric: (ctx) => ctx.peakRating ?? null,
    format: (v) => `${v.toLocaleString()} elo`,
    // Diamond starts at 2,000 in game, so the top gem sits above it: a gem
    // should mean something past the tier the profile already shows.
    levels: ladder([1000, 1400, 1700, 2000, 2400]),
  },
  {
    id: "total-wins",
    name: "Total Wins",
    description: "Lifetime wins across every mode",
    // Lifetime, not the season. A gem grades a career; reading the season total
    // would reset every gem on the site the day a new one starts.
    metric: (ctx) => ctx.lifetimeWins ?? null,
    format: (v) => `${v.toLocaleString()} wins`,
    // Pitched off real accounts rather than guessed. Sampled five: 14.5k,
    // 34.6k, 66k, 87.6k and 112k lifetime wins — "lifetime, all modes" counts
    // every custom and unranked game too, so the numbers run an order of
    // magnitude above anything ranked. A first pass at 250-20,000 put all five
    // at Diamond, which is a gem that grades nothing.
    levels: ladder([1000, 5000, 15000, 40000, 100000]),
  },
  {
    id: "account-level",
    name: "Account Level",
    description: "Brawlhalla account level",
    metric: (ctx) => ctx.accountLevel ?? null,
    format: (v) => `Level ${v}`,
    // The game caps at 100, so the ladder has to reach it rather than stopping
    // at a round number nobody can pass.
    levels: ladder([10, 25, 50, 75, 100]),
  },
]

export interface GemState {
  def: GemDef
  /** The raw number, or null when the profile has nothing to measure. */
  value: number | null
  /** Highest level reached, or null for uncut — below the first threshold. */
  level: GemLevelDef | null
  /** The next one up, or null at the top. Drives "N to go". */
  next: GemLevelDef | null
}

/**
 * Every gem, graded.
 *
 * Returns all of them including uncut ones, for the same reason the achievement
 * shelf shows silhouettes: the ones you haven't cut are the ones worth
 * chasing. A gem with no value at all (no ranked season, no account stats) is
 * uncut rather than hidden — "not yet" is information, an absent slot is not.
 */
export function resolveGems(ctx: GemContext): GemState[] {
  return GEMS.map((def) => {
    let value: number | null = null
    try {
      value = def.metric(ctx)
    } catch {
      // Fails open to uncut, like an achievement rule that throws.
      value = null
    }
    const sorted = [...def.levels].sort((a, b) => a.min - b.min)
    const reached =
      value == null ? [] : sorted.filter((l) => value >= l.min)
    const level = reached.length > 0 ? reached[reached.length - 1] : null
    const next = sorted.find((l) => value == null || value < l.min) ?? null
    return { def, value, level, next }
  })
}
