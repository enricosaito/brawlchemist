"use client"

import { useEffect, useRef, useSyncExternalStore } from "react"
import {
  getSoundServerSnapshot,
  getSoundSnapshot,
  subscribeSound,
} from "@/lib/ui-sound"

// Filename has spaces — encode them for the URL.
const MUSIC_SRC = "/assets/Brawlhalla%20Piano%20Theme.mp3"

/**
 * BackgroundMusic — loops the Brawlhalla piano theme while the mute toggle is
 * on. `preload="none"` keeps the ~8 MB file off the initial load; it's only
 * fetched once the user enables sound (which is also the gesture browsers
 * require before audible playback). Pauses immediately when toggled off.
 */
export function BackgroundMusic() {
  const enabled = useSyncExternalStore(
    subscribeSound,
    getSoundSnapshot,
    getSoundServerSnapshot,
  )
  const ref = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const audio = ref.current
    if (!audio) return
    if (enabled) {
      audio.volume = 0.35
      const p = audio.play()
      // Autoplay can still reject (e.g. first paint before a gesture) — ignore.
      if (p && typeof p.catch === "function") p.catch(() => {})
    } else {
      audio.pause()
    }
  }, [enabled])

  return <audio ref={ref} src={MUSIC_SRC} loop preload="none" aria-hidden />
}
