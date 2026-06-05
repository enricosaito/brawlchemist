"use client"

import { useSyncExternalStore } from "react"
import { Volume2, VolumeX } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getSoundServerSnapshot,
  getSoundSnapshot,
  playToggleOn,
  setSoundEnabled,
  subscribeSound,
} from "@/lib/ui-sound"

/**
 * SoundToggle — game-style UI sound switch. Reads the persisted value via
 * useSyncExternalStore (server snapshot = off, so hydration is deterministic),
 * and plays a confirmation chime when switched on. When off, the whole sound
 * layer is silent.
 */
export function SoundToggle({ className }: { className?: string }) {
  const on = useSyncExternalStore(
    subscribeSound,
    getSoundSnapshot,
    getSoundServerSnapshot,
  )

  function toggle() {
    const next = !on
    setSoundEnabled(next)
    if (next) playToggleOn()
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? "Mute UI sounds" : "Enable UI sounds"}
      title={on ? "Sound on" : "Sound off"}
      className={cn(
        "flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        on && "text-copper hover:text-copper",
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
