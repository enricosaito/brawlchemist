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

export type FlairId = "world-champion"

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
]

const BY_ID = new Map(FLAIRS.map((f) => [f.id, f]))

export function flairById(id: string | null | undefined): FlairDef | null {
  return (id ? BY_ID.get(id as FlairId) : undefined) ?? null
}

export function isValidFlairId(id: string): id is FlairId {
  return BY_ID.has(id as FlairId)
}

/**
 * Everything the entitlement rules read, all of it already on the profile.
 *
 * One field today because there is one flair. Tier-, ladder- and games-based
 * flair were tried and pulled: they fire for so many players at once that a
 * leaderboard column fills with the same badge, which is the opposite of what
 * a badge is for. Anything added back has to stay rare, and has to be
 * decidable from data the page already holds — a flair that needs its own
 * query puts a cost on every render for a 20px image.
 */
export interface FlairContext {
  /** Admin-curated esports accolades, the same strings the title tags use. */
  achievements?: string[]
}
export function earnedFlairIds(ctx: FlairContext): FlairId[] {
  const earned: FlairId[] = []
  if (ctx.achievements?.some((a) => /world champion/i.test(a))) {
    earned.push("world-champion")
  }
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
