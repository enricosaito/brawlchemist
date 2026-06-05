"use client"

import { useEffect, useRef } from "react"

// Filename has spaces — encode them so the browser fetches the right URL.
const VIDEO_SRC =
  "/assets/Anime%20Sparkling%20Stars%20Background%20by%20Sliced%20Bread.mp4"

/**
 * VideoBackground — fixed, darkened looping starfield behind the launcher.
 * Muted + playsInline so it autoplays on mobile; paused entirely under
 * prefers-reduced-motion (the first frame stays as a still backdrop).
 *
 * A left-weighted gradient overlay darkens the nav side hardest (keeps the
 * menu high-contrast) and lets the center/right breathe so the sparkle shows
 * through the frosted-glass panels.
 */
export function VideoBackground() {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = ref.current
    if (!v) return
    v.muted = true
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      v.pause()
      return
    }
    // Autoplay can reject (e.g. battery saver) — fall back to the still frame.
    const p = v.play()
    if (p && typeof p.catch === "function") p.catch(() => {})
  }, [])

  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden bg-background">
      <video
        ref={ref}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        className="size-full object-cover"
      >
        <source src={VIDEO_SRC} type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-gradient-to-r from-background/92 via-background/65 to-background/78" />
    </div>
  )
}
