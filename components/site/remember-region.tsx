"use client"

import { useEffect } from "react"

import { REGION_COOKIE, REGION_COOKIE_MAX_AGE } from "@/lib/region-preference"

/**
 * Remembers the ladder region the viewer last had open.
 *
 * Mounted on /queue and on /leaderboards, sharing one cookie on purpose: "my
 * region" is one idea, and a viewer who picks EU on one of them meant it for
 * both. A signed-in viewer's own region outranks this — see
 * resolvePreferredRegion — so for them it is a fallback that only matters if
 * they ever unlink.
 *
 * A cookie rather than localStorage, deliberately. Both are equally "local",
 * but the server can read a cookie while rendering — so a returning visitor
 * gets their queue and region in the first paint. The localStorage version of
 * this has to render the default first, then correct itself on the client,
 * which is a visible flash of the wrong ladder every single visit.
 *
 * Writing it from an effect (rather than wiring every filter link) means it
 * records whatever view is actually on screen, however the viewer got there —
 * a filter click, a shared link, or the back button.
 *
 * Purely a convenience: it carries no identity, and a viewer with cookies
 * disabled just always lands on the default view.
 */
export function RememberRegion({ region }: { region: string }) {
  useEffect(() => {
    try {
      // Still written as "queue:region" with the queue half empty. There is no
      // queue to remember any more, and the leaderboards never had one — keeping
      // the shape means cookies written by the old two-tab page still parse to
      // the right region instead of being discarded.
      const value = `:${region}`
      document.cookie = `${REGION_COOKIE}=${encodeURIComponent(
        value,
      )}; path=/; max-age=${REGION_COOKIE_MAX_AGE}; SameSite=Lax`
    } catch {
      // Cookies disabled — the default view is a fine outcome.
    }
  }, [region])

  return null
}
