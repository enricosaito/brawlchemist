import type { ApiRegion } from "./brawlhalla-api"
import type { PrRegion } from "./brawltools-api"

/**
 * The three rankings the site publishes, as one vocabulary.
 *
 * They were two pages behind two sidebar entries, which made them read as two
 * features rather than three answers to "who is the best". They are not
 * merged — and should not be. The ladder comes from the Brawlhalla API keyed by
 * brawlhalla_id; the power rankings come from brawltools keyed by an esports id
 * that has to be bridged back. Rendering both at once measured ~3.2s and over a
 * megabyte for a visitor who wanted one of them.
 *
 * So the pages stay separate and only the *navigation* is joined: each board is
 * a link, and nothing is fetched until you ask for it.
 *
 * The harder reason not to merge is the regions. `NA` spans US-E and US-W,
 * `MENA` is `ME`, and there is no `ALL` upstream — so one shared region control
 * would have to either lie or blank half its options on switch. That is the
 * /meta-picks lesson inverted: there, one region control was the substance of
 * the merge because both halves drew on the same pool with the same
 * vocabulary. Here they genuinely do not.
 */
export const BOARDS = ["ladder", "pros", "pr"] as const
export type BoardId = (typeof BOARDS)[number]

export interface BoardDef {
  id: BoardId
  label: string
  /** Modes this board actually publishes. Anything else has no rows upstream. */
  modes: readonly string[]
}

export const BOARD_DEFS: Record<BoardId, BoardDef> = {
  ladder: {
    id: "ladder",
    label: "Ladder",
    modes: ["1v1", "2v2", "solo_2v2", "3v3"],
  },
  // A filter over the ladder rather than a separate source, but it answers the
  // same question the other two do, so it belongs in the same control.
  pros: { id: "pros", label: "Pros", modes: ["1v1"] },
  pr: { id: "pr", label: "Power Rankings", modes: ["1v1", "2v2"] },
}

export function boardSupportsMode(board: BoardId, mode: string): boolean {
  return BOARD_DEFS[board].modes.includes(mode)
}

/** The mode to land on when the current one doesn't exist on the target board. */
export function modeForBoard(board: BoardId, mode: string): string {
  return boardSupportsMode(board, mode) ? mode : BOARD_DEFS[board].modes[0]
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
