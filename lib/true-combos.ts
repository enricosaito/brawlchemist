import type { WeaponId } from "@/lib/types"

/**
 * A true combo: a string that cannot be escaped once the first hit lands.
 *
 * The clip is the point. Notation tells you what to press, but "dLight → nAir"
 * is only legible to someone who already knows the combo, so every entry is a
 * video first and a caption second.
 */
export interface TrueCombo {
  /** Stable within its weapon — used as the React key and the anchor. */
  id: string
  /** Input notation, e.g. "dLight → nAir". */
  notation: string
  /** When it works: the damage window, the gravity, the stage position. */
  note?: string
  /** Video under `public/assets/combos/`. */
  src: string
  /** Poster frame, so a card isn't a black rectangle before it plays. */
  poster?: string
}

/**
 * The library, keyed by weapon.
 *
 * **Deliberately empty.** Combo data is a game fact, not a derivation, and
 * there is no endpoint for it — the Brawlhalla API reports matches and levels,
 * never inputs. Seeding this with notation from memory would put guesses on a
 * page whose whole promise is that these strings are *true*, and this codebase
 * has been bitten by exactly that before: the homepage legend card once carried
 * hardcoded tier grades beside live numbers, and the live numbers lent the
 * guesses credibility.
 *
 * So the shelf is built and the shelf is honest: every weapon renders, each one
 * says it has no clips yet, and `/lab` becomes useful the moment a real clip
 * lands rather than the moment someone remembers a combo.
 *
 * Adding one is two steps and no code:
 *   1. Drop the file at `public/assets/combos/<weapon-id>/<combo-id>.mp4`
 *      (weapon ids are the `WeaponId` union — "rocket-lance", "battle-boots").
 *   2. Add an entry here under that weapon.
 *
 * Keep clips short and silent. They autoplay muted on loop, which is what makes
 * a page of them readable at a glance; anything with audio or a long wind-up
 * turns a reference into a playlist.
 */
export const TRUE_COMBOS: Partial<Record<WeaponId, TrueCombo[]>> = {}

/** Clips for a weapon, newest-authored last. Empty array when we have none. */
export function combosFor(weapon: WeaponId): TrueCombo[] {
  return TRUE_COMBOS[weapon] ?? []
}

/** How many clips the library holds, for the page's provenance chip. */
export function totalCombos(): number {
  return Object.values(TRUE_COMBOS).reduce((n, list) => n + list.length, 0)
}
