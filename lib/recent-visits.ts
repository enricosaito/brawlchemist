/**
 * Recent profile visits — device-local, no account required.
 *
 * Stored in localStorage (key `bc-recent-visits`) so it works for signed-out
 * visitors too, costs zero DB writes / egress / API, and carries the correct
 * per-device semantics ("my recents on this machine"). Cross-device sync is
 * deliberately NOT here — that's the favorites/pro upsell.
 *
 * The stored shape mirrors a search result row exactly, so the home search
 * dropdown renders a recent identically to a live suggestion. Every accessor
 * fails open (returns []/no-ops) — a malformed blob or a privacy-mode browser
 * must never break the search bar.
 */

import type { Tier } from "@/lib/types"
import { type ProTier } from "@/lib/profile/pro-tier"

export interface RecentVisit {
  id: number
  username: string
  legendSlug: string | null
  rating: number | null
  region: string | null
  pro?: boolean
  /**
   * Which check to draw for them — see lib/profile/pro-tier.ts.
   *
   * Optional because this list lives in the visitor's own localStorage: crumbs
   * written before tiers existed have no tier, and must keep rendering rather
   * than being thrown away. They read as `none` until that player is visited
   * again, which is the honest answer — we did not record one.
   */
  proTier?: ProTier
  /**
   * Verified pro handle. Optional because entries stored before this existed
   * are read back from localStorage without it — those just show the in-game
   * name, which is what they showed when they were written.
   */
  handle?: string | null
  /**
   * Rank tier, for the helm beside the rating. Derived server-side because
   * Valhallan is ladder membership, not a rating threshold, and the client
   * has no way to ask.
   */
  tier?: Tier | null
  /**
   * Flair selection + the accolades entitlement is derived from. Passed raw,
   * not as a resolved flair, so the dropdown runs the same rule as the profile
   * (see lib/profile/flair.ts) rather than trusting a precomputed answer.
   */
  flairId?: string | null
  esportsTitles?: string[]
  /** Owning account has the Developer role — drives the Brawlchemist flair. */
  developer?: boolean
  /**
   * Their record reads as a possible smurf (see lib/profile/smurf.ts). Derived
   * server-side like `tier`: it needs level and playtime, which nothing on the
   * client has.
   */
  smurf?: boolean
}

const KEY = "bc-recent-visits"
const MAX = 8

function read(): RecentVisit[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (v): v is RecentVisit =>
          !!v &&
          typeof v === "object" &&
          typeof (v as RecentVisit).id === "number" &&
          typeof (v as RecentVisit).username === "string",
      )
      .slice(0, MAX)
  } catch {
    return []
  }
}

function write(list: RecentVisit[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {
    /* quota / privacy mode — fail open */
  }
}

/** Most-recent-first, capped. Safe to call from any client render. */
export function getRecentVisits(): RecentVisit[] {
  return read()
}

/** Record a profile view: move it to the front, dedupe by id, cap the list. */
export function recordVisit(visit: RecentVisit): void {
  if (typeof visit.id !== "number" || !visit.username) return
  const next = [visit, ...read().filter((v) => v.id !== visit.id)].slice(0, MAX)
  write(next)
}

export function removeRecentVisit(id: number): void {
  write(read().filter((v) => v.id !== id))
}

export function clearRecentVisits(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    /* fail open */
  }
}
