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

export interface RecentVisit {
  id: number
  username: string
  legendSlug: string | null
  rating: number | null
  region: string | null
  pro?: boolean
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
