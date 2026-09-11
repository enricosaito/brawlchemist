"use client"

import { useEffect } from "react"

import { LIVE_VIEW_COOKIE, LIVE_VIEW_MAX_AGE } from "@/lib/live-view"

/**
 * Remembers the live-queue view the viewer last had open.
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
export function RememberLiveView({
  queue,
  region,
}: {
  queue: string
  region: string
}) {
  useEffect(() => {
    try {
      const value = `${queue}:${region}`
      document.cookie = `${LIVE_VIEW_COOKIE}=${encodeURIComponent(
        value,
      )}; path=/; max-age=${LIVE_VIEW_MAX_AGE}; SameSite=Lax`
    } catch {
      // Cookies disabled — the default view is a fine outcome.
    }
  }, [queue, region])

  return null
}
