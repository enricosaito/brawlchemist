import type { Stance } from "@/lib/types"

/**
 * The stance we recommend for a legend, keyed by roster slug.
 *
 * **This is the one editorial field on the Top Legends card**, and it is
 * deliberately fenced off from everything else there. The pick rates, win rates
 * and game counts are measured out of the Valhallan pool; a best stance is not
 * measurable at all, because the API reports no stance data anywhere — it is a
 * build recommendation, and someone has to hold the opinion.
 *
 * That card once carried hardcoded tier grades *and* stances out of mock-data,
 * sitting next to live numbers that lent them credibility, and it could call a
 * legend S+ on a patch where nobody had looked in months. The fix is not to
 * refuse opinions, it is to keep them from impersonating measurements: this map
 * is partial on purpose and `bestStanceFor` returns null for anything it does
 * not name, so a legend rising into the top six shows its pick rate rather than
 * a stance nobody has actually picked for it. Nothing here can go stale into a
 * confident-looking wrong answer; it can only go quiet.
 *
 * Separate from `lib/mock-data.ts`, which still holds a `bestStance` beside
 * invented pick rates and tier grades. That file is fixtures. This one ships.
 */
const BEST_STANCE: Record<string, Stance> = {
  caspian: "strength",
  mordex: "base",
  sidra: "strength",
  teros: "superdex",
  diana: "speed",
  asuri: "superstrength",
}

/** The recommended stance for a legend slug, or null if we have no opinion. */
export function bestStanceFor(slug: string): Stance | null {
  return BEST_STANCE[slug] ?? null
}
