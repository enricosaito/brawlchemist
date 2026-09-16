/**
 * Which ladder region a visitor sees when they haven't asked for one.
 *
 * Shared by /queue and /leaderboards, and deliberately one module rather than
 * two matching implementations: "my region" is one idea, and two pages that
 * answer it separately will disagree the first time either is touched.
 *
 * This deliberately does NOT live in the client component that writes the
 * cookie. Every export of a `"use client"` module becomes a client reference on
 * the server, so a plain string constant imported across that boundary arrives
 * as an opaque proxy rather than its value — `cookies().get(NAME)` then quietly
 * returns undefined while `cookies().getAll()` clearly shows the cookie is
 * there. Keeping the name in a neutral module is what makes both sides agree.
 */

/**
 * Cookie holding the region the viewer last had open.
 *
 * Still named for the live queue, which is where it started, and still stored
 * as "queue:region" with the queue half empty. Renaming it would be tidier and
 * would silently forget every region anyone has already chosen, which is a bad
 * trade for a nicer string.
 */
export const REGION_COOKIE = "bc-live-view"

/** Six months — a view preference, not a session. */
export const REGION_COOKIE_MAX_AGE = 180 * 24 * 60 * 60

/** Parse the cookie's region half; unset or malformed yields "". */
export function parseRememberedRegion(raw: string | undefined): string {
  if (!raw) return ""
  let value = raw
  try {
    value = decodeURIComponent(raw)
  } catch {
    // Malformed encoding — fall through with the raw value.
  }
  // Two halves historically; the queue half is no longer written but old
  // cookies still carry it, so splitting is what keeps them readable.
  const [, region = ""] = value.split(":")
  return region
}

/**
 * The region to open on, in priority order:
 *
 *   1. An explicit `?region=` — someone asking for a ladder gets that ladder,
 *      always. This is also what makes a shared link mean what it says.
 *   2. The signed-in viewer's own region, from their linked profile. If you
 *      have proved you play in BRZ, BRZ is the ladder you care about, and a
 *      remembered click from a session spent browsing EU should not outrank
 *      the account you actually own.
 *   3. The region they last had open, from the cookie. The answer for everyone
 *      who hasn't linked an account: choose once, and it sticks.
 *   4. The caller's own default.
 *
 * Resolved server-side, which is the whole point of using a cookie rather than
 * localStorage: a returning visitor's ladder is right in the first paint. The
 * localStorage version renders the default and then corrects itself, flashing
 * the wrong ladder on every single visit.
 */
export function resolvePreferredRegion<T extends string>({
  requested,
  viewer,
  remembered,
  fallback,
  isValid,
}: {
  /** From `?region=`. */
  requested: string | undefined
  /** From the linked profile (`getViewerDefaultRegion`), or null. */
  viewer: string | null
  /** From the cookie (`parseRememberedRegion`). */
  remembered: string
  fallback: T
  isValid: (value: string) => value is T
}): T {
  for (const candidate of [requested, viewer, remembered]) {
    if (candidate && isValid(candidate)) return candidate
  }
  return fallback
}
