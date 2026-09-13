/**
 * Flair — the badge a player flies next to their name.
 *
 * Two halves that must not be confused. *Entitlement* is what a player has
 * earned and is derived from data we already hold — it can never be set. The
 * *selection* is which of those they choose to show, stored on their
 * customization row. Locked flair still renders in the picker, greyed with the
 * unlock line, because a badge nobody can see isn't worth chasing.
 *
 * No "server-only" import: the picker is a client component and needs the
 * catalogue's labels and art. Entitlement is computed server-side and passed in.
 */

export type FlairId = "world-champion" | "valhallan" | "top-10" | "veteran"

export interface FlairDef {
  id: FlairId
  /** Shown in the picker and as the tooltip on the profile. */
  label: string
  /** How to earn it — shown when the player hasn't. */
  requirement: string
  src: string
  width: number
  height: number
}

/**
 * Deliberately small and closed. Every entry must be decidable from data the
 * profile already loads: a flair that needs its own query would put a cost on
 * every profile render for a 20px image.
 */
export const FLAIRS: FlairDef[] = [
  {
    id: "world-champion",
    label: "World Champion",
    requirement: "Win a Brawlhalla world championship",
    src: "/assets/Legendary_moment_trophy.png",
    width: 616,
    height: 1212,
  },
  {
    id: "valhallan",
    label: "Valhallan",
    requirement: "Reach Valhallan in 1v1",
    src: "/assets/valhallan-helm.png",
    width: 48,
    height: 48,
  },
  {
    id: "top-10",
    label: "Top 10",
    requirement: "Reach the global top 10 in 1v1",
    src: "/assets/Valhallan-GIF.webp",
    width: 48,
    height: 48,
  },
  {
    id: "veteran",
    label: "Veteran",
    requirement: "Play 1,000 ranked 1v1 games in a season",
    src: "/assets/diamond-helm.png",
    width: 48,
    height: 48,
  },
]

const BY_ID = new Map(FLAIRS.map((f) => [f.id, f]))

export function flairById(id: string | null | undefined): FlairDef | null {
  return (id ? BY_ID.get(id as FlairId) : undefined) ?? null
}

export function isValidFlairId(id: string): id is FlairId {
  return BY_ID.has(id as FlairId)
}

/** Everything the entitlement rules need, all of it already on the profile. */
export interface FlairContext {
  /** Admin-curated esports accolades, the same strings the title tags use. */
  achievements?: string[]
  valhallan?: boolean
  /** Global 1v1 ladder position, or null below the tracked top 500. */
  ladderRank?: number | null
  /** Ranked 1v1 games this season. */
  games?: number | null
}

/**
 * Which flair this player has earned.
 *
 * Accolades are free text an admin types, so world champion matches on the
 * phrase: "2v2 World Champion '24" and "1v1 World Champion '23" both earn the
 * one trophy, because the badge is the honour and not each time it was won.
 */
export function earnedFlairIds(ctx: FlairContext): FlairId[] {
  const earned: FlairId[] = []
  if (ctx.achievements?.some((a) => /world champion/i.test(a))) {
    earned.push("world-champion")
  }
  if (ctx.valhallan) earned.push("valhallan")
  if (ctx.ladderRank != null && ctx.ladderRank <= 10) earned.push("top-10")
  if ((ctx.games ?? 0) >= 1000) earned.push("veteran")
  return earned
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
 * Catalogue order is the ranking, so the rarest comes first.
 *
 * Shared with the picker so the panel can show the automatic choice as the
 * selected row. Without it the panel would say "None" while the profile behind
 * it displayed a badge, which is the kind of disagreement that makes a settings
 * screen untrustworthy.
 */
export function autoFlairId(earned: FlairId[]): FlairId | null {
  return FLAIRS.find((f) => earned.includes(f.id))?.id ?? null
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
  ctx: FlairContext
): FlairDef | null {
  if (selectedId === FLAIR_NONE) return null
  const earned = earnedFlairIds(ctx)
  if (earned.length === 0) return null
  if (selectedId && isValidFlairId(selectedId) && earned.includes(selectedId)) {
    return flairById(selectedId)
  }
  return flairById(autoFlairId(earned))
}
