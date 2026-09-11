"use client"

import { useEffect, useRef, useState } from "react"

// Filename has spaces — encode them so the browser fetches the right URL.
const VIDEO_SRC =
  "/assets/Anime%20Sparkling%20Stars%20Background%20by%20Sliced%20Bread.mp4"

/**
 * VideoBackground — fixed, darkened looping starfield behind the launcher.
 * Muted + playsInline so it autoplays on mobile.
 *
 * The clip is ~3 MB and sits behind every route, so it is deliberately NOT
 * part of the first load: the element mounts without a source and only picks
 * one up once the browser is idle after paint. The container's own
 * `bg-background` is the design's base colour, so the backdrop looks correct
 * from the first frame — the sparkle simply arrives a beat later instead of
 * competing with the page's own content for bandwidth.
 *
 * Under prefers-reduced-motion the video is never requested at all (it used to
 * download in full just to be paused on frame one) — those users get the flat
 * background, which is the intended reduced-motion treatment anyway.
 *
 * A left-weighted gradient overlay darkens the nav side hardest (keeps the
 * menu high-contrast) and lets the center/right breathe so the sparkle shows
 * through the frosted-glass panels.
 */
export function VideoBackground() {
  const ref = useRef<HTMLVideoElement>(null)
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const load = () => setSrc(VIDEO_SRC)
    // requestIdleCallback isn't in Safari <17 — fall back to a short timeout.
    const ric = window.requestIdleCallback
    if (typeof ric === "function") {
      const id = ric(load, { timeout: 2500 })
      return () => window.cancelIdleCallback?.(id)
    }
    const t = setTimeout(load, 600)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const v = ref.current
    if (!v || !src) return
    v.muted = true
    // Autoplay can reject (e.g. battery saver) — fall back to the still frame.
    const p = v.play()
    if (p && typeof p.catch === "function") p.catch(() => {})
  }, [src])

  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden bg-background">
      {src && (
        <video
          ref={ref}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="size-full object-cover"
        >
          <source src={src} type="video/mp4" />
        </video>
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-background/92 via-background/65 to-background/78" />
    </div>
  )
}
