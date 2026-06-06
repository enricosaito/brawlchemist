"use client"

import { useSyncExternalStore } from "react"
import { Volume2, VolumeX } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getSoundServerSnapshot,
  getSoundSnapshot,
  setSoundEnabled,
  subscribeSound,
} from "@/lib/ui-sound"

/**
 * SoundToggle — mute switch for the background music. Reads the persisted value
 * via useSyncExternalStore (server snapshot = off, so hydration is
 * deterministic). The toggle click is the user gesture that lets the
 * BackgroundMusic player start audible playback.
 */
export function SoundToggle({ className }: { className?: string }) {
  const on = useSyncExternalStore(
    subscribeSound,
    getSoundSnapshot,
    getSoundServerSnapshot,
  )

  function toggle() {
    setSoundEnabled(!on)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? "Mute music" : "Play music"}
      title={on ? "Music on" : "Music off"}
      className={cn(
        "flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        on && "text-foreground hover:text-foreground",
        className,
      )}
    >
      {on ? (
        <Volume2 className="size-4" />
      ) : (
        <VolumeX className="size-4" />
      )}
    </button>
  )
}
