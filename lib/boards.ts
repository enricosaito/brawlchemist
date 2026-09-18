import type { ApiRegion } from "./brawlhalla-api"
import type { PrRegion } from "./brawltools-api"

/**
 * Every ranking the site publishes, as one list of *views* rather than a
 * board-and-mode grid.
 *
 * The grid was the honest model of the data and the wrong model for a control
 * row: it made "Ranked 2v2" and "Solo 2v2" look like siblings, when one is a
 * board most people want and the other is a queue most people have never
 * played. So the views are split by how often they are asked for, not by how
 * they are stored:
 *
 *   TYPE   the three people come here for
 *   OTHER  everything else, one click away rather than one row away
 *
 * They are one mutually exclusive choice across two groups — picking from
 * OTHER clears TYPE and vice versa. Two groups, one selection.
 *
 * The pages behind them are NOT merged, and should not be. The ladder comes
 * from the Brawlhalla API keyed by brawlhalla_id; the power rankings come from
 * brawltools keyed by an esports id that has to be bridged back. Rendering both
 * at once measured ~3.2s and over a megabyte for a visitor who wanted one.
 * Every view here is a link, and nothing is fetched until you ask for it.
 *
 * The harder reason not to merge is the regions — see the note on API_TO_PR.
 */
export const VIEW_GROUPS = ["type", "other"] as const
export type ViewGroup = (typeof VIEW_GROUPS)[number]

export type ViewId =
  | "ranked-1v1"
  | "ranked-2v2"
  | "pr"
  | "solo-2v2"
  | "3v3"
  | "pros"

export interface ViewDef {
  id: ViewId
  label: string
  group: ViewGroup
  /** Which page serves it. */
  board: "ladder" | "pr"
  /**
   * The ladder queue it maps to. Undefined for the power rankings, which carry
   * whichever mode you were already reading — 1v1 and 2v2 both have real
   * boards there (~20 ranked players per region in each).
   */
  mode?: string
  pro?: boolean
}

export const VIEWS: Record<ViewId, ViewDef> = {
  "ranked-1v1": {
    id: "ranked-1v1",
    label: "Ranked 1v1",
    group: "type",
    board: "ladder",
    mode: "1v1",
  },
  "ranked-2v2": {
    id: "ranked-2v2",
    label: "Ranked 2v2",
    group: "type",
    board: "ladder",
    mode: "2v2",
  },
  pr: { id: "pr", label: "Power Rankings", group: "type", board: "pr" },
  "solo-2v2": {
    id: "solo-2v2",
    label: "Solo 2v2",
    group: "other",
    board: "ladder",
    mode: "solo_2v2",
  },
  "3v3": { id: "3v3", label: "3v3", group: "other", board: "ladder", mode: "3v3" },
  pros: {
    id: "pros",
    label: "Pros only",
    group: "other",
    board: "ladder",
    mode: "1v1",
    pro: true,
  },
}

export const VIEWS_IN_GROUP: Record<ViewGroup, ViewDef[]> = {
  type: Object.values(VIEWS).filter((v) => v.group === "type"),
  other: Object.values(VIEWS).filter((v) => v.group === "other"),
}

/** Which view a leaderboard render is showing. */
export function ladderView(mode: string, pro: boolean): ViewId {
  if (pro) return "pros"
  if (mode === "2v2") return "ranked-2v2"
  if (mode === "solo_2v2") return "solo-2v2"
  if (mode === "3v3") return "3v3"
  return "ranked-1v1"
}

/**
 * Best-effort region carry-over between the two vocabularies.
 *
 * Only where the mapping is real. `NA` covers both American ladders, so either
 * one lands there; `SA` and `BRZ` are both South America; `MENA` is `ME` spelled
 * differently. `ALL`, `AUS` and `JPN` have no counterpart at all, and rather
 * than invent one they fall through to the board's own default — being sent to
 * a region you did not pick is better than being told Japan has a power
 * ranking.
 *
 * This asymmetry is also why the two pages keep separate region controls rather
 * than sharing one: a single control would have to either lie or blank half its
 * options on switch.
 */
const API_TO_PR: Partial<Record<ApiRegion, PrRegion>> = {
  "US-E": "NA",
  "US-W": "NA",
  EU: "EU",
  BRZ: "SA",
  SA: "SA",
  SEA: "SEA",
  ME: "MENA",
}

const PR_TO_API: Record<PrRegion, ApiRegion> = {
  NA: "US-E",
  EU: "EU",
  SA: "BRZ",
  SEA: "SEA",
  MENA: "ME",
}

export function apiToPrRegion(region: string): PrRegion | null {
  return API_TO_PR[region as ApiRegion] ?? null
}

export function prToApiRegion(region: string): ApiRegion | null {
  return PR_TO_API[region as PrRegion] ?? null
}
