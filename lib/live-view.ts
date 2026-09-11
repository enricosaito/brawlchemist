/**
 * Shared contract for the remembered live-queue view.
 *
 * This deliberately does NOT live in the client component that writes the
 * cookie. Every export of a `"use client"` module becomes a client reference on
 * the server, so a plain string constant imported across that boundary arrives
 * as an opaque proxy rather than its value — `cookies().get(NAME)` then quietly
 * returns undefined while `cookies().getAll()` clearly shows the cookie is
 * there. Keeping the name in a neutral module is what makes both sides agree.
 */

/** Cookie holding the viewer's last live view, encoded as "queue:region". */
export const LIVE_VIEW_COOKIE = "bc-live-view"

/** Six months — a view preference, not a session. */
export const LIVE_VIEW_MAX_AGE = 180 * 24 * 60 * 60

/** Parse the cookie into its two parts; unset or malformed yields empties. */
export function parseLiveView(raw: string | undefined): {
  queue: string
  region: string
} {
  if (!raw) return { queue: "", region: "" }
  let value = raw
  try {
    value = decodeURIComponent(raw)
  } catch {
    // Malformed encoding — fall through with the raw value.
  }
  const [queue = "", region = ""] = value.split(":")
  return { queue, region }
}
